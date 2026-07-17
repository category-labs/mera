import type { Hash, Hex, LocalAccount, NonceManager, Signature } from "viem";
import {
  hashMessage,
  hashTypedData,
  hexToBytes,
  keccak256,
  serializeSignature,
  serializeTransaction,
  toHex,
} from "viem";
import { toAccount } from "viem/accounts";
import { hashAuthorization } from "viem/utils";
import { getEvmAddress } from "./chains/evm.js";
import type { Secp256k1SigningSession } from "./types.js";

/** Options accepted by `toViemAccount`. */
type ToViemAccountOptions = {
  /** viem nonce manager forwarded to the account for automatic nonce handling. */
  nonceManager?: NonceManager;
};

/**
 * Adapts a secp256k1 signing session into a viem local account.
 *
 * Each signing method hashes its input with viem's own hashers and signs the
 * resulting 32-byte digest with `session.signDigest`, so signing never shows a
 * passkey prompt; the WebAuthn ceremony already ran when the session was
 * created. The account's `address` is the EIP-55 checksummed address of the
 * session key, and `publicKey` is the 65-byte uncompressed public key as hex.
 *
 * @param session - Unlocked secp256k1 signing session that backs the account.
 * @param options - Adapter inputs; fields are documented on {@link ToViemAccountOptions}.
 * @returns A viem local account with `source: "mera"` implementing
 * `signTransaction` (honoring a custom `serializer`), `signMessage` (EIP-191),
 * `signTypedData` (EIP-712), `signAuthorization` (EIP-7702), and raw-hash
 * `sign`.
 * @throws MeraError with code `SESSION_LOCKED`, rejected from every signing
 * method after `session.lock()` has been called.
 * @throws MeraError with code `INPUT_INVALID`, rejected from `sign` when
 * `hash` is not exactly 32 bytes.
 */
function toViemAccount(
  session: Secp256k1SigningSession,
  options: ToViemAccountOptions = {},
): LocalAccount<"mera"> {
  const address = getEvmAddress(session.publicKey);

  async function signHash(hash: Hash): Promise<Signature> {
    const { compact, recovery } = await session.signDigest(hexToBytes(hash));
    return {
      r: toHex(compact.slice(0, 32)),
      s: toHex(compact.slice(32, 64)),
      // Legacy transaction serialization reads `v` (EIP-155); everything else
      // reads `yParity`, so the signature carries both.
      v: BigInt(27 + recovery),
      yParity: recovery,
    };
  }

  const account = toAccount({
    address,
    nonceManager: options.nonceManager,
    async sign({ hash }) {
      return serializeSignature(await signHash(hash));
    },
    async signAuthorization(authorization) {
      // AuthorizationRequest is a one-of union of `address` and its
      // `contractAddress` alias; exactly one is set, which TypeScript cannot
      // express across the union members.
      const contract = (authorization.contractAddress ??
        authorization.address) as Hex;
      const { chainId, nonce } = authorization;
      const signature = await signHash(
        hashAuthorization({ address: contract, chainId, nonce }),
      );
      return { address: contract, chainId, nonce, ...signature };
    },
    async signMessage({ message }) {
      return serializeSignature(await signHash(hashMessage(message)));
    },
    async signTransaction(
      transaction,
      { serializer = serializeTransaction } = {},
    ) {
      // EIP-4844 transactions sign the payload without sidecars; serializing
      // the full transaction below reattaches them.
      const signableTransaction =
        transaction.type === "eip4844"
          ? { ...transaction, sidecars: false as const }
          : transaction;
      const signature = await signHash(
        keccak256(await serializer(signableTransaction)),
      );
      return serializer(transaction, signature);
    },
    async signTypedData(typedData) {
      return serializeSignature(await signHash(hashTypedData(typedData)));
    },
  });

  return { ...account, publicKey: toHex(session.publicKey), source: "mera" };
}

export type { ToViemAccountOptions };
export { toViemAccount };
