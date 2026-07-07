---
title: Sign with viem
description: Adapt a secp256k1 signing session into a viem account.
---

A `Secp256k1SigningSession` signs 32-byte digests. viem, like most EVM libraries, can delegate signing to anything that produces `{ r, s, yParity }` for a digest, so the adapter is small: build the digest viem expects, hand it to the session, reassemble the signature. viem is one example; any library that accepts an external signer gets the same treatment.

Prerequisites: `viem` installed and an unlocked session ([Derive accounts from one passkey](/recipes/derive-accounts/) produces one).

## The adapter

The demo's adapter:

```ts
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
```

Every entry point reduces to `signHash`: transactions are keccak-256 over the serialized payload, personal messages go through viem's `hashMessage`. The session's `compact` signature is `r || s`, so the split at byte 32 is exact, and `recovery` maps straight onto `yParity`.

## Using the account

```ts
import { createWalletClient, http, parseEther } from "viem";
import { sepolia } from "viem/chains";

const account = toPasskeyAccount(session);
const client = createWalletClient({
  account,
  chain: sepolia,
  transport: http(),
});

const hash = await client.sendTransaction({
  to: recipient,
  value: parseEther("0.01"),
});
```

Signing happens locally in the session with no passkey prompt; the ceremony already ran when the session was created.

## Notes

- **Low-S is already enforced.** `signDigest` returns low-S signatures, which EVM chains require since EIP-2; the adapter adds nothing.
- **`signTypedData` is left unimplemented** in the demo. Implementing it is the same shape: hash with viem's `hashTypedData`, then `signHash`.
- **Locking propagates.** After `session.lock()`, any viem call that signs rejects with a `SESSION_LOCKED` MeraError. Build the reconnect flow around that; [Handle errors](/recipes/handle-errors/) shows the mapping.

## See also

- [createSecp256k1SigningSession](/reference/create-secp256k1-signing-session/): the signature format this adapter consumes.
