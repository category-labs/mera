import {
  getEvmAddress,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import {
  type Account,
  type Hex,
  hashMessage,
  hexToBytes,
  keccak256,
  type Signature,
  serializeSignature,
  serializeTransaction,
  toHex,
} from "viem";
import { toAccount } from "viem/accounts";

/**
 * Adapts a secp256k1 passkey signing session into a viem account.
 *
 * The library only signs a raw 32-byte digest (`signDigest`, low-S enforced), so every
 * viem signing entry point reduces to the same shape: build the digest viem expects, hand
 * it to the session, and reassemble the `{ r, s, yParity }` signature viem wants.
 */
function toPasskeyAccount(session: Secp256k1SigningSession): Account {
  const address = getEvmAddress(session.publicKey);

  async function signHash(hash: Hex): Promise<Signature> {
    const { compact, recovery } = await session.signDigest(hexToBytes(hash));
    return {
      r: toHex(compact.slice(0, 32)),
      s: toHex(compact.slice(32, 64)),
      yParity: recovery,
      v: BigInt(27 + recovery),
    };
  }

  return toAccount({
    address,
    async signTransaction(transaction) {
      const signature = await signHash(
        keccak256(serializeTransaction(transaction)),
      );
      return serializeTransaction(transaction, signature);
    },
    async signMessage({ message }) {
      return serializeSignature(await signHash(hashMessage(message)));
    },
    async signTypedData() {
      throw new Error("signTypedData not implemented");
    },
  });
}

export { toPasskeyAccount };
