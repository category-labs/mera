---
title: createSecp256k1SigningSession
description: Creates an explicitly lockable signing session from a secp256k1 private key.
---

Creates an explicitly lockable signing session from a secp256k1 private key.

## Import

```ts
import { createSecp256k1SigningSession } from "@category-labs/mera";
```

## Usage

```ts
import {
  createSecp256k1SigningSession,
  getEvmAddress,
} from "@category-labs/mera";

const privateKey = crypto.getRandomValues(new Uint8Array(32)); // stand-in for an app-derived key
const digest32 = new Uint8Array(32); // stand-in for a 32-byte transaction digest

const session = createSecp256k1SigningSession({
  consumePrivateKey: privateKey, // zeroed by this call
});

const address = getEvmAddress(session.publicKey);
const { compact, recovery } = await session.signDigest(digest32);

session.lock();
```

## Parameters

`options` is a `CreateSigningSessionOptions`.

### options.consumePrivateKey

- Type: `Uint8Array`
- Required

secp256k1 private key. Must be exactly 32 bytes and a valid scalar. Copied into one session-owned snapshot; the input buffer is zeroed before the call returns or throws. Callers holding the key inside another structure (an `HDKey`, for example) should pass a copy.

## Returns

A `Secp256k1SigningSession`, unlocked.

### publicKey

`Uint8Array`, 65 bytes, the uncompressed secp256k1 public key with the `0x04` prefix. Derived from the same owned snapshot used for signing, so the two cannot diverge.

### signDigest(digest32)

Signs a 32-byte digest without prehashing it and resolves to a `Secp256k1Signature`: `compact` (64 bytes, `r || s`, low-S) plus `recovery` (0 or 1).

### lock()

Zeroes the session-owned private-key copy and permanently locks the session; later signing throws [`SESSION_LOCKED`](/reference/errors/#session_locked).

### [Symbol.dispose]()

Calls `lock`, so a `using` declaration locks the session when its scope exits:

```ts
{
  using session = createSecp256k1SigningSession({ consumePrivateKey: privateKey });
  await session.signDigest(digest32);
} // locked here
```

Sessions bound with `const` or `let` are unaffected; disposal runs only where a caller opts in with `using`.

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `consumePrivateKey` is not a valid secp256k1 scalar, or `digest32` is not 32 bytes. The private-key input buffer is zeroed even when session construction fails.
- [`SESSION_LOCKED`](/reference/errors/#session_locked): `signDigest` was called after `lock`.

## Notes

Signing needs no passkey ceremony and shows no prompt; the session signs as often as the app asks until it is locked.

The digest is copied before signing; the original is not modified.

The recovery ID is declared `0 | 1`. Values 2 and 3 exist in ECDSA but require the signature's `r` to reach the curve order, which happens with probability around 2^-127; if it ever did, the call would fail loudly with [`INPUT_INVALID`](/reference/errors/#input_invalid) rather than return a signature that cannot be address-recovered.

## See also

- [getEvmAddress](/reference/get-evm-address/): the address for `session.publicKey`.
- [toViemAccount](/reference/to-viem-account/): a viem account backed by the session.
- [Signing sessions](/concepts/signing-sessions/): the custody model, the lifecycle, and what an active session exposes.
