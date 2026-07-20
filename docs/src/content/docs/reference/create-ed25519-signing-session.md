---
title: createEd25519SigningSession
description: Creates an explicitly lockable signing session from an Ed25519 private key.
---

Creates an explicitly lockable signing session from an Ed25519 private key.

## Import

```ts
import { createEd25519SigningSession } from "@category-labs/mera";
```

## Usage

```ts
import {
  createEd25519SigningSession,
  getSolanaAddress,
} from "@category-labs/mera";

const seed = crypto.getRandomValues(new Uint8Array(32)); // stand-in for an app-derived key
const message = new TextEncoder().encode("hello mera");

const session = createEd25519SigningSession({ privateKey: seed });

const address = getSolanaAddress(session.publicKey);
const signature = await session.signMessage(message);

session.lock();
```

## Parameters

`options` is a `CreateSigningSessionOptions`.

### options.privateKey

- Type: `Uint8Array`
- Required

Ed25519 private key (the 32-byte seed). Copied into one session-owned snapshot.

## Returns

An `Ed25519SigningSession`, unlocked.

### publicKey

`Uint8Array`, the 32-byte Ed25519 public key. Derived from the same owned snapshot used for signing, so the two cannot diverge.

### signMessage(message)

Signs an arbitrary-length message and resolves to the 64-byte Ed25519 signature (`R || s`). Hashing happens inside Ed25519 itself; the caller passes the raw message, never a digest.

### lock()

Zeroes the session-owned private-key copy and permanently locks the session; later signing throws [`SESSION_LOCKED`](/reference/errors/#session_locked).

### [Symbol.dispose]()

Calls `lock`, so a `using` declaration locks the session when its scope exits. Sessions bound with `const` or `let` are unaffected; disposal runs only where a caller opts in with `using`.

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `privateKey` is not 32 bytes.
- [`SESSION_LOCKED`](/reference/errors/#session_locked): `signMessage` was called after `lock`.

## Notes

Signing needs no passkey ceremony and shows no prompt; the session signs as often as the app asks until it is locked.

The message is read before `signMessage` returns; mutating the buffer after the call cannot change what was signed.

## See also

- [getSolanaAddress](/reference/get-solana-address/): the address for `session.publicKey`.
- [Signing sessions](/concepts/signing-sessions/): the custody model, the lifecycle, and what an active session exposes.
