import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import { base64urlnopad } from "@scure/base";
import {
  type Connector,
  connect,
  createConfig,
  createStorage,
  disconnect,
  getChainId,
  reconnect,
  sendCalls,
  sendTransaction,
  signMessage,
  signTypedData,
  switchChain,
} from "@wagmi/core";
import {
  type AccessList,
  type BaseError,
  custom,
  defineChain,
  keccak256,
  numberToHex,
  parseTransaction,
  recoverTransactionAddress,
  type TransactionSerialized,
  verifyMessage,
  verifyTypedData,
} from "viem";
import {
  createSecp256k1SigningSession,
  deriveEvmPrivateKey,
  getEvmAddress,
} from "../dist/index.js";
import { mera } from "../dist/wagmi.js";
import type { WebAuthnClient } from "../dist/webauthn.js";
import { DEFAULT_PRF_SALT, expectError } from "./helpers.js";

const rp = { id: "example.com", name: "Mera Test" };
// wagmi prefixes the connector's "mera.account" key with its own "wagmi.".
const STORED_ACCOUNT_KEY = "wagmi.mera.account";
const user = { name: "nad", displayName: "nad" };
const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// Pads gas estimates the documented way for chains that charge the limit.
const testChain = defineChain({
  id: 31337,
  name: "Test",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:1"] } },
  prepareTransactionRequest: [
    async (request) => ({
      ...request,
      gas: ((request.gas ?? 0n) * 11n) / 10n,
    }),
    { runAt: ["afterFillParameters"] },
  ],
});
const otherChain = defineChain({ ...testChain, id: 31338, name: "Other" });

const typedData = {
  domain: { name: "Mera Test", chainId: testChain.id },
  types: { Order: [{ name: "amount", type: "uint256" }] },
  primaryType: "Order",
  // Above 2^53, so the JSON-RPC request carries it as a string.
  message: { amount: 2n ** 60n },
} as const;

/**
 * A passkey store in memory. Each passkey's PRF output is
 * sha256(secret || salt), and every call counts as one prompt. `get` is a
 * failure to throw; `beforeGet` holds an assertion prompt open.
 */
function fakeAuthenticator(
  options: { get?: unknown; beforeGet?: () => Promise<void> } = {},
): {
  client: WebAuthnClient;
  prompts(): number;
  gets: WebAuthnClient.GetCredentialRequest[];
  prfOutputOf(credentialId: Uint8Array): Uint8Array;
} {
  const passkeys = new Map<string, Uint8Array>();
  const gets: WebAuthnClient.GetCredentialRequest[] = [];
  let prompts = 0;
  const prf = (secret: Uint8Array, salt: Uint8Array) =>
    sha256(new Uint8Array([...secret, ...salt]));

  const client: WebAuthnClient = {
    async createCredential({ prfSalt }) {
      prompts += 1;
      const credentialId = crypto.getRandomValues(new Uint8Array(16));
      const secret = crypto.getRandomValues(new Uint8Array(32));
      passkeys.set(bytesToHex(credentialId), secret);
      return {
        credentialId,
        transports: ["internal"],
        prfEnabled: true,
        prfOutput: prf(secret, prfSalt),
      };
    },
    async getCredential(request) {
      prompts += 1;
      gets.push(request);
      await options.beforeGet?.();
      if (options.get !== undefined) throw options.get;
      const id =
        request.allowCredential !== undefined
          ? bytesToHex(request.allowCredential.credentialId)
          : [...passkeys.keys()][0];
      const secret = id === undefined ? undefined : passkeys.get(id);
      if (id === undefined || secret === undefined) {
        throw new DOMException(
          "The operation either timed out or was not allowed.",
          "NotAllowedError",
        );
      }
      return {
        credentialId: hexToBytes(id),
        prfOutput: prf(secret, request.prfSalt),
      };
    },
  };

  return {
    client,
    prompts: () => prompts,
    gets,
    prfOutputOf(credentialId) {
      const secret = passkeys.get(bytesToHex(credentialId));
      if (secret === undefined) throw new Error("unknown passkey");
      return prf(secret, DEFAULT_PRF_SALT);
    },
  };
}

/**
 * An RPC that fills transactions and records raw transactions sent to it. Its
 * pending nonce counts the transactions it has received, as a node's does. It
 * reports a base fee, so viem fills EIP-1559 transactions unless a request
 * names another type.
 */
function fakeRpc(beforeNonce?: () => Promise<void>): {
  transport: ReturnType<typeof custom>;
  sent: TransactionSerialized[];
} {
  const sent: TransactionSerialized[] = [];
  const transport = custom({
    async request({ method, params }: { method: string; params?: unknown }) {
      switch (method) {
        case "eth_getTransactionCount":
          await beforeNonce?.();
          return numberToHex(sent.length);
        case "eth_estimateGas":
          return numberToHex(21_000);
        case "eth_maxPriorityFeePerGas":
          return numberToHex(1_000_000_000);
        case "eth_getBlockByNumber":
          return { number: "0x1", baseFeePerGas: numberToHex(1_000_000_000) };
        case "eth_sendRawTransaction": {
          const [raw] = params as [TransactionSerialized];
          sent.push(raw);
          return keccak256(raw);
        }
        default:
          throw Object.assign(new Error(`${method} is not available`), {
            code: -32601,
          });
      }
    },
  });
  return { transport, sent };
}

/**
 * One page load. Pages that share `items` share storage, like reloads in one
 * browser.
 */
function openPage(
  authenticator: ReturnType<typeof fakeAuthenticator>,
  {
    items = new Map<string, string>(),
    accountIndex,
    keepSessionOpen,
    persist = true,
    beforeNonce,
  }: {
    items?: Map<string, string>;
    accountIndex?: number | undefined;
    keepSessionOpen?: boolean | undefined;
    persist?: boolean;
    beforeNonce?: () => Promise<void>;
  } = {},
) {
  const rpc = fakeRpc(beforeNonce);
  const config = createConfig({
    chains: [testChain, otherChain],
    connectors: [
      mera({
        rp,
        webAuthnClient: authenticator.client,
        accountIndex,
        keepSessionOpen,
      }),
    ],
    transports: {
      [testChain.id]: rpc.transport,
      [otherChain.id]: fakeRpc().transport,
    },
    storage: persist
      ? createStorage({
          storage: {
            getItem: (key) => items.get(key) ?? null,
            setItem: (key, value) => void items.set(key, value),
            removeItem: (key) => void items.delete(key),
          },
        })
      : null,
    multiInjectedProviderDiscovery: false,
  });
  const [connector] = config.connectors;
  if (connector === undefined) throw new Error("connector missing");
  return { config, connector, sent: rpc.sent, items };
}

test("creates a passkey account and asks for the passkey again to sign, without storage", async () => {
  const authenticator = fakeAuthenticator();
  const page = openPage(authenticator, { persist: false });

  const { accounts } = await connect(page.config, {
    connector: page.connector,
    create: { user },
  });
  const message = "Sign in to Mera Test";
  const signature = await signMessage(page.config, { message });

  expect(authenticator.prompts()).toBe(2);
  expect(
    await verifyMessage({ address: accounts[0], message, signature }),
  ).toBe(true);
  expect(await page.connector.isAuthorized()).toBe(false);
});

test("opens the account deriveEvmPrivateKey derives at accountIndex", async () => {
  const authenticator = fakeAuthenticator();
  const creator = openPage(authenticator);
  await connect(creator.config, {
    connector: creator.connector,
    create: { user },
  });
  const { credential } = readStoredAccount(creator.items);
  const prfOutput = authenticator.prfOutputOf(
    base64urlnopad.decode(credential.credentialId),
  );

  for (const accountIndex of [undefined, 1]) {
    const page = openPage(authenticator, { accountIndex });
    const { accounts } = await connect(page.config, {
      connector: page.connector,
    });
    expect(authenticator.gets.at(-1)?.allowCredential).toBeUndefined();
    const privateKey = deriveEvmPrivateKey({
      prfOutput,
      accountIndex: accountIndex ?? 0,
    });
    const { publicKey } = createSecp256k1SigningSession({ privateKey });

    expect(accounts[0]).toBe(getEvmAddress(publicKey));
  }

  const reloadedAtOtherIndex = openPage(authenticator, {
    items: creator.items,
    accountIndex: 1,
  });
  expect(await reloadedAtOtherIndex.connector.isAuthorized()).toBe(false);

  expectError(() => mera({ rp, accountIndex: -1 }), "INPUT_INVALID");
});

test("reconnects after a reload without a prompt, then asks for the stored passkey at each signature", async () => {
  const authenticator = fakeAuthenticator();
  const first = openPage(authenticator);
  const { accounts } = await connect(first.config, {
    connector: first.connector,
    create: { user },
  });
  const { credential } = readStoredAccount(first.items);

  const reloaded = openPage(authenticator, { items: first.items });
  const [connection] = await reconnect(reloaded.config);
  expect(connection?.accounts).toEqual(accounts);
  expect(authenticator.prompts()).toBe(1);

  const message = "like";
  const [signature, typedSignature] = await Promise.all([
    signMessage(reloaded.config, { message }),
    signTypedData(reloaded.config, typedData),
  ]);

  const storedId = base64urlnopad.decode(credential.credentialId);
  expect(
    authenticator.gets.map((get) => get.allowCredential?.credentialId),
  ).toEqual([storedId, storedId]);
  expect(
    await verifyMessage({ address: accounts[0], message, signature }),
  ).toBe(true);
  expect(
    await verifyTypedData({
      ...typedData,
      address: accounts[0],
      signature: typedSignature,
    }),
  ).toBe(true);
});

test("with keepSessionOpen, signs after a connect without a prompt and asks once after a reload", async () => {
  const authenticator = fakeAuthenticator();
  const first = openPage(authenticator, { keepSessionOpen: true });
  const { accounts } = await connect(first.config, {
    connector: first.connector,
    create: { user },
  });
  const reloaded = openPage(authenticator, {
    items: first.items,
    keepSessionOpen: true,
  });
  await reconnect(reloaded.config);

  const message = "like";
  const [signature] = await Promise.all([
    signMessage(reloaded.config, { message }),
    signTypedData(reloaded.config, typedData),
  ]);
  await sendTransaction(reloaded.config, { to: recipient, value: 1n });

  expect(authenticator.prompts()).toBe(2);
  expect(
    await verifyMessage({ address: accounts[0], message, signature }),
  ).toBe(true);

  await disconnect(reloaded.config);
  await connect(reloaded.config, { connector: reloaded.connector });
  await signMessage(reloaded.config, { message });

  expect(authenticator.prompts()).toBe(3);
});

test("sends transactions signed in the page through the configured chain and transport", async () => {
  const page = openPage(fakeAuthenticator());
  const { accounts } = await connect(page.config, {
    connector: page.connector,
    create: { user },
  });

  const hash = await sendTransaction(page.config, {
    to: recipient,
    value: 1n,
  });

  const [raw] = page.sent;
  if (raw === undefined) throw new Error("no transaction sent");
  const transaction = parseTransaction(raw);
  expect(hash).toBe(keccak256(raw));
  expect(transaction).toMatchObject({
    to: recipient.toLowerCase(),
    value: 1n,
    chainId: testChain.id,
    gas: 23_100n,
  });
  expect(await recoverTransactionAddress({ serializedTransaction: raw })).toBe(
    accounts[0],
  );
});

test("keeps the type, gas price, and access list of legacy and EIP-2930 transactions", async () => {
  const page = openPage(fakeAuthenticator());
  await connect(page.config, { connector: page.connector, create: { user } });
  const gasPrice = 2_000_000_000n;
  const accessList: AccessList = [{ address: recipient, storageKeys: [] }];

  await sendTransaction(page.config, {
    to: recipient,
    type: "legacy",
    gasPrice,
  });
  await sendTransaction(page.config, {
    to: recipient,
    type: "eip2930",
    gasPrice,
    accessList,
  });

  expect(page.sent.map((raw) => parseTransaction(raw))).toMatchObject([
    { type: "legacy", gasPrice },
    {
      type: "eip2930",
      gasPrice,
      accessList: [{ address: recipient.toLowerCase(), storageKeys: [] }],
    },
  ]);
});

test("gives transactions sent together distinct nonces", async () => {
  const page = openPage(fakeAuthenticator());
  await connect(page.config, { connector: page.connector, create: { user } });

  await Promise.all([
    sendTransaction(page.config, { to: recipient, value: 1n }),
    sendTransaction(page.config, { to: recipient, value: 2n }),
  ]);

  const nonces = page.sent.map((raw) => parseTransaction(raw).nonce);
  expect(nonces.sort()).toEqual([0, 1]);
});

test("sends each call as its own transaction when sendCalls falls back", async () => {
  const page = openPage(fakeAuthenticator());
  await connect(page.config, { connector: page.connector, create: { user } });

  await sendCalls(page.config, {
    calls: [
      { to: recipient, value: 1n },
      { to: recipient, value: 2n },
    ],
    experimental_fallback: true,
  });

  expect(page.sent.map((raw) => parseTransaction(raw).value)).toEqual([1n, 2n]);
});

test("disconnecting ends the session, stops a send in flight, and forgets the account", async () => {
  const authenticator = fakeAuthenticator();
  const nonceRequested = Promise.withResolvers<void>();
  const nonceReleased = Promise.withResolvers<void>();
  const page = openPage(authenticator, {
    beforeNonce: async () => {
      nonceRequested.resolve();
      await nonceReleased.promise;
    },
  });
  await connect(page.config, { connector: page.connector, create: { user } });

  const sending = sendTransaction(page.config, { to: recipient, value: 1n });
  await nonceRequested.promise;
  await disconnect(page.config);
  nonceReleased.resolve();

  const error = (await sending.catch((caught: unknown) => caught)) as BaseError;
  expect(
    error.walk(
      (cause) => (cause as { code?: unknown }).code === "SESSION_ENDED",
    ),
  ).toBeTruthy();
  expect(await page.connector.isAuthorized()).toBe(false);
});

test("disconnecting during a passkey prompt keeps no session", async () => {
  const promptOpened = Promise.withResolvers<void>();
  const promptClosed = Promise.withResolvers<void>();
  const authenticator = fakeAuthenticator({
    beforeGet: async () => {
      promptOpened.resolve();
      await promptClosed.promise;
    },
  });
  const first = openPage(authenticator);
  await connect(first.config, { connector: first.connector, create: { user } });
  const reloaded = openPage(authenticator, { items: first.items });
  await reconnect(reloaded.config);

  const signing = signMessage(reloaded.config, { message: "hello" });
  await promptOpened.promise;
  await disconnect(reloaded.config);
  promptClosed.resolve();

  await expect(signing).rejects.toMatchObject({ code: 4001 });
});

test("rejects a dismissed prompt as the person's choice and keeps other failures", async () => {
  // A fake without passkeys rejects like a dismissed prompt.
  const dismissedPage = openPage(fakeAuthenticator());
  await expect(
    connect(dismissedPage.config, { connector: dismissedPage.connector }),
  ).rejects.toMatchObject({ name: "UserRejectedRequestError", code: 4001 });

  // react-native-passkey rejects with plain objects that name the outcome.
  for (const error of ["UserCancelled", "TimedOut"]) {
    const native = openPage(fakeAuthenticator({ get: { error, message: "" } }));
    await expect(
      connect(native.config, { connector: native.connector }),
    ).rejects.toMatchObject({ code: 4001 });
  }

  // The same choice at the first signature after a reload.
  const first = openPage(fakeAuthenticator());
  await connect(first.config, { connector: first.connector, create: { user } });
  const reloaded = openPage(fakeAuthenticator(), { items: first.items });
  await reconnect(reloaded.config);
  await expect(
    signMessage(reloaded.config, { message: "hello" }),
  ).rejects.toMatchObject({ code: 4001 });

  // A relying party ID the page cannot use fails the same ceremony with
  // SecurityError, which is a setup problem rather than a choice.
  const misconfiguredPage = openPage(
    fakeAuthenticator({
      get: new DOMException("The RP ID is invalid.", "SecurityError"),
    }),
  );
  await expect(
    connect(misconfiguredPage.config, {
      connector: misconfiguredPage.connector,
    }),
  ).rejects.toMatchObject({
    name: "MeraError",
    code: "PASSKEY_OPERATION_FAILED",
  });
});

test("refuses to sign when the passkey opens a different account than the stored one", async () => {
  const authenticator = fakeAuthenticator();
  const page = openPage(authenticator);
  await connect(page.config, { connector: page.connector, create: { user } });

  page.items.set(
    STORED_ACCOUNT_KEY,
    JSON.stringify({ ...readStoredAccount(page.items), address: recipient }),
  );
  const reloaded = openPage(authenticator, { items: page.items });
  await reconnect(reloaded.config);

  await expect(
    signMessage(reloaded.config, { message: "hello" }),
  ).rejects.toMatchObject({ code: 4100 });
});

test("switches between the config's chains and refuses others", async () => {
  const unconnected = fakeAuthenticator();
  const unconnectedPage = openPage(unconnected);
  await expect(
    connect(unconnectedPage.config, {
      connector: unconnectedPage.connector,
      chainId: 1 as never,
      create: { user },
    }),
  ).rejects.toMatchObject({ name: "SwitchChainError" });
  expect(unconnected.prompts()).toBe(0);

  const page = openPage(fakeAuthenticator());
  await connect(page.config, { connector: page.connector, create: { user } });

  await switchChain(page.config, { chainId: otherChain.id });
  const provider = await providerOf(page.connector);

  expect(getChainId(page.config)).toBe(otherChain.id);
  expect(await provider.request({ method: "eth_chainId" })).toBe(
    numberToHex(otherChain.id),
  );
  await expect(
    provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: numberToHex(1) }],
    }),
  ).rejects.toMatchObject({ code: 4902 });
  await expect(
    provider.request({ method: "wallet_switchEthereumChain", params: [null] }),
  ).rejects.toMatchObject({ code: -32602 });
});

test("rejects signing methods and transaction fields it does not support", async () => {
  const page = openPage(fakeAuthenticator());
  const { accounts } = await connect(page.config, {
    connector: page.connector,
    create: { user },
  });
  const provider = await providerOf(page.connector);

  await expect(
    provider.request({
      method: "eth_signTypedData_v4",
      params: [
        accounts[0],
        { ...typedData, domain: { ...typedData.domain, chainId: 1 } },
      ],
    }),
  ).rejects.toMatchObject({ code: -32602 });
  await expect(
    provider.request({
      method: "eth_signTransaction",
      params: [{ from: accounts[0], to: recipient }],
    }),
  ).rejects.toMatchObject({ code: -32004 });
  const badChecksum = recipient.replace("C", "c");
  for (const field of [
    { blobs: ["0x00"] },
    { type: "constructor" },
    { value: "0x" },
    { to: badChecksum },
  ]) {
    await expect(
      provider.request({
        method: "eth_sendTransaction",
        params: [{ from: accounts[0], to: recipient, ...field }],
      }),
    ).rejects.toMatchObject({ code: -32602 });
  }
});

/** The connector's EIP-1193 provider, which answers any method name. */
async function providerOf(connector: Connector): Promise<{
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}> {
  return (await connector.getProvider()) as never;
}

function readStoredAccount(items: Map<string, string>): {
  address: string;
  credential: { credentialId: string };
} {
  return JSON.parse(items.get(STORED_ACCOUNT_KEY) ?? "null");
}
