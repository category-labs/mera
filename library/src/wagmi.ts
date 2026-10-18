import {
  ChainNotConfiguredError,
  ConnectorNotConnectedError,
  type CreateConnectorFn,
  createConnector,
} from "@wagmi/core";
import {
  type Address,
  type Chain,
  createWalletClient,
  hexToBigInt,
  http,
  InvalidParamsRpcError,
  isAddress,
  isAddressEqual,
  isHex,
  type LocalAccount,
  MethodNotSupportedRpcError,
  nonceManager,
  numberToHex,
  SwitchChainError,
  type TypedDataDefinition,
  UnauthorizedProviderError,
  UserRejectedRequestError,
  type WalletClient,
} from "viem";
import { deriveEvmPrivateKey } from "./chains/evm.js";
import { MeraError } from "./errors.js";
import { checkAccountIndex } from "./hd.js";
import { createPasskeyWithPrfOutput, getPasskeyPrfOutput } from "./passkey.js";
import { createSecp256k1SigningSession } from "./secp256k1.js";
import type {
  PasskeyCredentialMetadata,
  PasskeyRelyingParty,
  Secp256k1SigningSession,
} from "./types.js";
import { toViemAccount } from "./viem.js";
import { browserWebAuthnClient, type WebAuthnClient } from "./webauthn.js";

/** The account kept between page loads. Holds no key material. */
type StoredAccount = {
  address: Address;
  credential: PasskeyCredentialMetadata;
  rpId: string;
  accountIndex: number;
};

const STORAGE_KEY = "mera.account";

type StorageItem = { [STORAGE_KEY]: StoredAccount };

type Provider = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
};

/** The `create` connect parameter. */
type CreatePasskey = { user: createPasskeyWithPrfOutput.Options["user"] };

type Properties = {
  connect<withCapabilities extends boolean = false>(parameters?: {
    chainId?: number | undefined;
    isReconnecting?: boolean | undefined;
    withCapabilities?: withCapabilities | boolean | undefined;
    /**
     * Creates a passkey for this user and connects its account. Without it,
     * connecting asks for any passkey the relying party already has. When the
     * second prompt that some authenticators need is dismissed, the new
     * passkey stays, and a later connect without `create` offers it.
     */
    create?: CreatePasskey | undefined;
  }): Promise<{
    accounts: withCapabilities extends true
      ? readonly { address: Address; capabilities: Record<string, unknown> }[]
      : readonly Address[];
    chainId: number;
  }>;
};

/**
 * Creates a wagmi connector for a passkey account: an EVM account whose key
 * derives from a passkey's PRF output.
 *
 * @param options - Relying party, account index, and WebAuthn client.
 * @returns A wagmi connector function with id `"mera"`.
 * @remarks
 * Connecting runs one passkey ceremony, or two when it creates a passkey on an
 * authenticator that evaluates the PRF only at sign-in, and keeps no key.
 * Every signing request runs its own ceremony, restricted to the stored
 * credential, after earlier requests finish, and ends its signing session
 * once it settles. A passkey that opens a different address is refused.
 *
 * The connector keeps the account's address and credential metadata in
 * wagmi's storage, never key material, so reconnecting after a page load
 * shows no prompt. It ignores a record stored for another `rp.id` or
 * `accountIndex`. The connector starts on the config's first chain.
 *
 * The provider signs `personal_sign`, `eth_signTypedData_v4`, and
 * `eth_sendTransaction` itself, and refuses typed data whose domain names
 * another chain. viem fills, signs, and sends each transaction
 * through the config's transport for the current chain, or the chain's
 * default RPC when the config has none. Transactions sent together get
 * consecutive nonces. Other signing and `wallet_` methods, including
 * `wallet_sendCalls`, reject with `MethodNotSupportedRpcError` (code -32004);
 * other methods go to the transport. A dismissed or timed-out passkey prompt
 * rejects with `UserRejectedRequestError` (code 4001); other ceremony failures
 * reject with their `MeraError`, which viem wraps for signing requests.
 * @throws MeraError with code `INPUT_INVALID` when `accountIndex` is not an integer from 0 to 2^31 - 1.
 */
function mera({
  rp,
  accountIndex = 0,
  webAuthnClient = browserWebAuthnClient,
}: mera.Options): CreateConnectorFn<Provider, Properties, StorageItem> {
  checkAccountIndex(accountIndex);

  return createConnector<Provider, Properties, StorageItem>((config) => {
    let chain = config.chains[0];
    // Storage only carries the account across page loads, so a config with
    // storage disabled still signs until it disconnects.
    let connection: Connection | undefined;
    // Signing requests run one at a time: WebAuthn allows one ceremony per
    // page, and each request asks for its own.
    let signing: Promise<unknown> = Promise.resolve();
    // One client per chain: each new client starts its transport, and a
    // ranked `fallback` transport then pings its RPCs for good.
    const clients = new Map<number, WalletClient>();

    function forget(): void {
      connection?.opened?.session.end();
      connection = undefined;
    }

    function connectedAddresses(): Address[] {
      return connection === undefined ? [] : [connection.account.address];
    }

    async function readStoredAccount(): Promise<StoredAccount | undefined> {
      const value: unknown = await config.storage?.getItem(STORAGE_KEY);
      // A record for another relying party or account index is not the
      // account this connector derives.
      return isStoredAccount(value) &&
        value.rpId === rp.id &&
        value.accountIndex === accountIndex
        ? value
        : undefined;
    }

    function clientFor(chain: Chain): WalletClient {
      let client = clients.get(chain.id);
      if (client === undefined) {
        client = createWalletClient({
          chain,
          transport: config.transports?.[chain.id] ?? http(),
        });
        clients.set(chain.id, client);
      }
      return client;
    }

    function configuredChain(id: number): Chain {
      const found = config.chains.find((candidate) => candidate.id === id);
      if (found === undefined) {
        throw new SwitchChainError(new ChainNotConfiguredError());
      }
      return found;
    }

    function switchTo(id: number): Chain {
      const next = configuredChain(id);
      if (chain.id !== id) {
        chain = next;
        config.emitter.emit("change", { chainId: id });
      }
      return next;
    }

    /**
     * Signs in with a new passkey for `create`, else with any passkey the
     * relying party has.
     */
    async function signIn(
      create: CreatePasskey | undefined,
    ): Promise<StoredAccount> {
      const ceremony: Promise<
        PasskeyCredentialMetadata & { prfOutput: Uint8Array }
      > =
        create === undefined
          ? getPasskeyPrfOutput({ rpId: rp.id, webAuthnClient })
          : createPasskeyWithPrfOutput({
              rp,
              user: create.user,
              webAuthnClient,
            });
      const { credentialId, transports, prfOutput } =
        await ceremony.catch(rejectCeremony);
      const opened = openAccount(prfOutput, accountIndex);
      opened.session.end();
      const account: StoredAccount = {
        address: opened.account.address,
        credential: { credentialId, transports },
        rpId: rp.id,
        accountIndex,
      };
      await config.storage?.setItem(STORAGE_KEY, account);

      forget();
      connection = { account };
      return account;
    }

    /** Restores the stored account without a prompt. */
    async function restore(): Promise<StoredAccount> {
      const stored = await readStoredAccount();
      if (stored === undefined) throw new ConnectorNotConnectedError();
      if (
        connection === undefined ||
        !isAddressEqual(connection.account.address, stored.address)
      ) {
        forget();
        connection = { account: stored };
      }
      return connection.account;
    }

    /**
     * Runs `sign` with the account for `address`. Each call waits for earlier
     * ones, asks for the stored passkey, and ends its session once `sign`
     * settles.
     */
    async function withSigner<T>(
      address: unknown,
      sign: (account: LocalAccount) => Promise<T>,
    ): Promise<T> {
      const current = connection;
      if (current === undefined) {
        throw new UnauthorizedProviderError(
          new Error("No passkey account is connected"),
        );
      }
      const { address: connected } = current.account;
      if (!isAddressString(address) || !isAddressEqual(address, connected)) {
        throw new UnauthorizedProviderError(
          new Error(`The connected passkey account is ${connected}`),
        );
      }

      const run = signing.then(() => signOnce(current, sign));
      signing = run.catch(() => {});
      return run;
    }

    async function signOnce<T>(
      current: Connection,
      sign: (account: LocalAccount) => Promise<T>,
    ): Promise<T> {
      const { account } = current;
      checkConnected(current);
      const { prfOutput } = await getPasskeyPrfOutput({
        rpId: rp.id,
        credential: account.credential,
        webAuthnClient,
      }).catch(rejectCeremony);
      const opened = openAccount(prfOutput, accountIndex);

      try {
        checkConnected(current);
        if (!isAddressEqual(opened.account.address, account.address)) {
          throw new UnauthorizedProviderError(
            new Error(
              `The passkey opened ${opened.account.address}, not ${account.address}`,
            ),
          );
        }
        // Disconnecting ends this session, which stops `sign` mid-request.
        current.opened = opened;
        return await sign(opened.account);
      } finally {
        opened.session.end();
        current.opened = undefined;
      }
    }

    /** Every connect and disconnect replaces `connection`. */
    function checkConnected(current: Connection): void {
      if (connection !== current) {
        throw new UserRejectedRequestError(
          new Error("The passkey account disconnected during the request"),
        );
      }
    }

    async function request({
      method,
      params,
    }: Parameters<Provider["request"]>[0]): Promise<unknown> {
      const args: readonly unknown[] = Array.isArray(params) ? params : [];

      switch (method) {
        case "eth_accounts":
          return connectedAddresses();
        case "eth_requestAccounts":
          if (connection === undefined) {
            throw new UnauthorizedProviderError(
              new Error("Connect the passkey account first"),
            );
          }
          return [connection.account.address];
        case "eth_chainId":
          return numberToHex(chain.id);
        case "wallet_switchEthereumChain": {
          const [parameter] = args as [
            { chainId?: unknown } | null | undefined,
          ];
          switchTo(Number(quantity("chainId", parameter?.chainId)));
          return null;
        }
        case "personal_sign": {
          const [message, address] = args;
          if (!isHex(message)) {
            throw new InvalidParamsRpcError(new Error("message must be hex"));
          }
          return withSigner(address, (account) =>
            account.signMessage({ message: { raw: message } }),
          );
        }
        case "eth_signTypedData_v4": {
          const [address, typedData] = args;
          const definition = parseTypedData(typedData, chain.id);
          return withSigner(address, (account) =>
            account.signTypedData(definition),
          );
        }
        case "eth_sendTransaction": {
          const [transaction] = args;
          const current = chain;
          const parsed = parseTransactionRequest(transaction, current.id);
          // Asking for the passkey before viem fills the transaction keeps
          // the prompt next to the click that caused it.
          return withSigner(parsed.from, (account) =>
            // viem types requests as a union per transaction type, which a
            // request built field by field cannot name.
            clientFor(current).sendTransaction({
              ...parsed.request,
              account,
              chain: current,
            } as never),
          );
        }
      }

      if (
        method.startsWith("wallet_") ||
        method.startsWith("eth_sign") ||
        method.startsWith("personal_")
      ) {
        // -32004 rather than EIP-1193's 4200: viem's sendCalls falls back to
        // one eth_sendTransaction per call only on a "not supported" error.
        throw new MethodNotSupportedRpcError(
          new Error(`${method} is not supported by the passkey account`),
          { method },
        );
      }

      return clientFor(chain).request({
        method,
        params,
      } as never);
    }

    const provider: Provider = { request };

    return {
      id: "mera",
      name: "Passkey",
      type: "mera",
      async connect({
        chainId: requestedChainId,
        isReconnecting,
        withCapabilities,
        create,
      }: NonNullable<Parameters<Properties["connect"]>[0]> = {}) {
        // Checked before the ceremony, so an unknown chain stores nothing.
        if (requestedChainId !== undefined) configuredChain(requestedChainId);
        const account = isReconnecting ? await restore() : await signIn(create);
        if (requestedChainId !== undefined) switchTo(requestedChainId);
        return {
          accounts: (withCapabilities
            ? [{ address: account.address, capabilities: {} }]
            : [account.address]) as never,
          chainId: chain.id,
        };
      },
      async disconnect() {
        forget();
        await config.storage?.removeItem(STORAGE_KEY);
      },
      async getAccounts() {
        return connectedAddresses();
      },
      async getChainId() {
        return chain.id;
      },
      async getProvider() {
        return provider;
      },
      async isAuthorized() {
        return (await readStoredAccount()) !== undefined;
      },
      async switchChain({ chainId: requestedChainId }) {
        return switchTo(requestedChainId);
      },
      // The provider emits no events, so nothing calls these.
      onAccountsChanged() {},
      onChainChanged() {},
      onDisconnect() {},
    };
  });
}

declare namespace mera {
  /** Inputs for the passkey account connector. */
  type Options = {
    /**
     * Relying party the passkeys belong to. `rp.name` is shown when a passkey
     * is created.
     */
    rp: PasskeyRelyingParty;
    /**
     * Account number passed to {@link deriveEvmPrivateKey}. Defaults to 0,
     * the first account.
     */
    accountIndex?: number | undefined;
    /**
     * Client that runs the WebAuthn ceremonies. Defaults to the built-in
     * browser client, which calls `navigator.credentials`.
     */
    webAuthnClient?: WebAuthnClient | undefined;
  };
}

/** A live session and the viem account that signs with it. */
type OpenedAccount = {
  session: Secp256k1SigningSession;
  account: LocalAccount;
};

/** One connection: its account and the session of the request signing now. */
type Connection = {
  account: StoredAccount;
  opened?: OpenedAccount | undefined;
};

/** Opens the account at `accountIndex`. Zeroes `prfOutput` and the derived key. */
function openAccount(
  prfOutput: Uint8Array,
  accountIndex: number,
): OpenedAccount {
  let privateKey: Uint8Array | undefined;
  try {
    privateKey = deriveEvmPrivateKey({ prfOutput, accountIndex });
    const session = createSecp256k1SigningSession({ privateKey });
    // The nonce manager gives transactions sent at the same time distinct
    // nonces; each would otherwise read the same pending count.
    return { session, account: toViemAccount(session, { nonceManager }) };
  } finally {
    privateKey?.fill(0);
    prfOutput.fill(0);
  }
}

/**
 * Rethrows a dismissed or timed-out prompt as `UserRejectedRequestError`,
 * which wagmi apps treat as the person's choice, and any other failure as is.
 * Browsers reject both with `NotAllowedError`; react-native-passkey reports
 * `UserCancelled` or `TimedOut`.
 */
function rejectCeremony(error: unknown): never {
  if (error instanceof MeraError && error.code === "PASSKEY_OPERATION_FAILED") {
    const cause = error.cause as { name?: unknown; error?: unknown } | null;
    if (
      cause?.name === "NotAllowedError" ||
      cause?.error === "UserCancelled" ||
      cause?.error === "TimedOut"
    ) {
      throw new UserRejectedRequestError(error);
    }
  }
  throw error;
}

function isStoredAccount(value: unknown): value is StoredAccount {
  if (typeof value !== "object" || value === null) return false;
  const { address, credential } = value as Record<string, unknown>;
  if (!isAddressString(address)) return false;
  if (typeof credential !== "object" || credential === null) return false;
  const { credentialId, transports } = credential as Record<string, unknown>;
  return (
    typeof credentialId === "string" &&
    (transports === undefined ||
      (Array.isArray(transports) &&
        transports.every((transport) => typeof transport === "string")))
  );
}

/**
 * Parses `eth_signTypedData_v4` typed data. A domain for a chain other than the
 * current one is refused, as EIP-712 wallets do: its signature would be valid
 * on that chain.
 */
function parseTypedData(value: unknown, chainId: number): TypedDataDefinition {
  let typedData: unknown = value;
  if (typeof value === "string") {
    try {
      typedData = JSON.parse(value);
    } catch (cause) {
      throw new InvalidParamsRpcError(cause as Error);
    }
  }
  if (typeof typedData !== "object" || typedData === null) {
    throw new InvalidParamsRpcError(new Error("typed data must be an object"));
  }
  // viem's hashing validates the structure and each value against its type.
  const definition = typedData as TypedDataDefinition;
  const domainChainId = definition.domain?.chainId;
  if (domainChainId !== undefined && Number(domainChainId) !== chainId) {
    throw new InvalidParamsRpcError(
      new Error(`The passkey account is on chain ${chainId}`),
    );
  }
  return definition;
}

const TRANSACTION_TYPES = new Map([
  ["0x0", "legacy"],
  ["0x1", "eip2930"],
  ["0x2", "eip1559"],
]);

/**
 * Converts an `eth_sendTransaction` request from RPC encoding to viem's, field
 * by field. Unknown fields, blob and set-code transactions, and a chain other
 * than the current one are refused rather than dropped.
 */
function parseTransactionRequest(
  transaction: unknown,
  chainId: number,
): { from: unknown; request: Record<string, unknown> } {
  if (typeof transaction !== "object" || transaction === null) {
    throw new InvalidParamsRpcError(new Error("transaction must be an object"));
  }
  // Blob (EIP-4844) and set-code (EIP-7702) fields land in `unsupported`.
  const {
    accessList,
    chainId: requestedChainId,
    data,
    from,
    gas,
    gasPrice,
    input,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce,
    to,
    type,
    value,
    ...unsupported
  } = transaction as Record<string, unknown>;
  const field = Object.keys(unsupported).find(
    (key) => unsupported[key] !== undefined,
  );
  if (field !== undefined) {
    throw new InvalidParamsRpcError(
      new Error(`Unsupported transaction field: ${field}`),
    );
  }

  if (
    requestedChainId !== undefined &&
    quantity("chainId", requestedChainId) !== BigInt(chainId)
  ) {
    throw new InvalidParamsRpcError(
      new Error(`The passkey account is on chain ${chainId}`),
    );
  }

  const request: Record<string, unknown> = {};
  if (data !== undefined && input !== undefined && data !== input) {
    throw new InvalidParamsRpcError(new Error("data and input differ"));
  }
  const callData = data ?? input;
  if (callData !== undefined) {
    if (!isHex(callData)) {
      throw new InvalidParamsRpcError(new Error("data must be hex"));
    }
    request.data = callData;
  }
  if (to !== undefined && to !== null) {
    // Strict, as viem checks `to`, so a bad checksum fails before the prompt.
    if (typeof to !== "string" || !isAddress(to)) {
      throw new InvalidParamsRpcError(new Error("to must be an address"));
    }
    request.to = to;
  }
  if (accessList !== undefined) {
    if (!Array.isArray(accessList)) {
      throw new InvalidParamsRpcError(new Error("accessList must be an array"));
    }
    request.accessList = accessList;
  }
  if (type !== undefined) {
    request.type =
      typeof type === "string" ? TRANSACTION_TYPES.get(type) : undefined;
    if (request.type === undefined) {
      throw new InvalidParamsRpcError(
        new Error(`Unsupported transaction type: ${String(type)}`),
      );
    }
  }
  const quantities = {
    value,
    gas,
    gasPrice,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
  for (const [name, encoded] of Object.entries(quantities)) {
    if (encoded !== undefined) request[name] = quantity(name, encoded);
  }
  if (nonce !== undefined) request.nonce = Number(quantity("nonce", nonce));
  return { from, request };
}

function quantity(field: string, value: unknown): bigint {
  // isHex accepts "0x", which hexToBigInt cannot parse.
  if (!isHex(value) || value === "0x") {
    throw new InvalidParamsRpcError(new Error(`${field} must be a hex number`));
  }
  return hexToBigInt(value);
}

function isAddressString(value: unknown): value is Address {
  return typeof value === "string" && isAddress(value, { strict: false });
}

export { mera };
