---
title: toViemAccount
description: Adapts a secp256k1 signing session into a viem local account.
---

Adapts a secp256k1 signing session into a viem local account. Every signing method signs through `session.signDigest`, so signing shows no passkey prompt. The function lives in the `@category-labs/mera/viem` entry point, which requires `viem` (`^2.28.0`) as an optional peer dependency; the root entry point does not use viem.

## Import

```ts
import { toViemAccount } from "@category-labs/mera/viem";
```

## Usage

```ts
import { createSecp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { createWalletClient, http, parseEther } from "viem";
import { sepolia } from "viem/chains";

const privateKey = crypto.getRandomValues(new Uint8Array(32)); // stand-in for an app-derived key
const session = createSecp256k1SigningSession({
  consumePrivateKey: privateKey, // zeroed by this call
});

const client = createWalletClient({
  account: toViemAccount(session),
  chain: sepolia,
  transport: http(),
});

const hash = await client.sendTransaction({
  to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  value: parseEther("0.01"),
});

session.lock();
```

## Parameters

The session is positional; `options` is a `ToViemAccountOptions` and may be omitted.

### session

- Type: `Secp256k1SigningSession`
- Required

Unlocked secp256k1 signing session that backs the account. [createSecp256k1SigningSession](/reference/create-secp256k1-signing-session/) produces one.

### options.nonceManager

- Type: `NonceManager`, from viem
- Optional; when omitted the account carries no nonce manager

viem nonce manager forwarded to the account. viem clients use it to assign transaction nonces automatically.

## Returns

A viem `LocalAccount` with `source: "mera"`, accepted anywhere viem takes an account.

### address

The EIP-55 checksummed address of the session key, the same value [getEvmAddress](/reference/get-evm-address/) returns for `session.publicKey`.

### publicKey

The 65-byte uncompressed secp256k1 public key as hex: the `0x04` prefix, then 128 hex characters.

### signTransaction(transaction, options?)

Serializes the transaction, signs its keccak-256 digest, and resolves to the signed serialized transaction. `options.serializer` replaces viem's `serializeTransaction` for both steps. EIP-4844 transactions are hashed without their sidecars and serialized with them.

### signMessage({ message })

Resolves to the EIP-191 personal-message signature for `message`, 65 bytes as hex.

### signTypedData(typedData)

Resolves to the EIP-712 signature for the typed data, 65 bytes as hex.

### signAuthorization(authorization)

Signs an EIP-7702 authorization and resolves to the signed authorization object: the contract address, chain ID, and nonce together with the signature fields.

### sign({ hash })

Signs a 32-byte hash directly, with no additional hashing, and resolves to the 65-byte hex signature.

## Errors

- [`SESSION_LOCKED`](/reference/errors/#session_locked): any signing method rejects with this after `session.lock()`.
- [`INPUT_INVALID`](/reference/errors/#input_invalid): `sign` rejects with this when `hash` is not exactly 32 bytes.

## Notes

Signatures are low-S, which EVM chains require since EIP-2; `signDigest` enforces this, so the adapter adds no normalization.

## See also

- [Send a transaction with viem](/recipes/send-a-transaction-with-viem/): the recipe built on this adapter.
- [createSecp256k1SigningSession](/reference/create-secp256k1-signing-session/): produces the session this adapter consumes.
- [Signing sessions](/concepts/signing-sessions/): the custody model and lifecycle.

