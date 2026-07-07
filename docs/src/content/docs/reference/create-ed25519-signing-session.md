---
title: createEd25519SigningSession
description: Wraps an Ed25519 private key in an explicitly lockable signing session.
---

Wraps an Ed25519 private key in an explicitly lockable signing session. The key is consumed: the input buffer is zeroed before the call returns or throws, and from then on the session's copy is the only one the library knows about.

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

const session = createEd25519SigningSession({
  consumePrivateKey: seed, // zeroed by this call
});

const address = getSolanaAddress(session.publicKey);
const signature = await session.signMessage(messageBytes);

session.lock();
```

## Parameters

`options` is a `CreateSigningSessionOptions`.

### options.consumePrivateKey

- Type: `Uint8Array`
- Required

Ed25519 private key (the 32-byte seed). Copied into one session-owned snapshot; the input buffer is zeroed before the call returns or throws. Callers holding the key elsewhere should pass a copy.

## Returns

An `Ed25519SigningSession`, unlocked.

### publicKey

`Uint8Array`, the 32-byte Ed25519 public key. Derived from the same owned snapshot used for signing, so the two cannot diverge.

### signMessage(message)

Signs an arbitrary-length message and resolves to the 64-byte Ed25519 signature (`R || s`). Hashing happens inside Ed25519 itself; the caller passes the raw message, never a digest. The message is copied before use because signing reads the buffer after an await; the original is not modified. Throws [`SESSION_LOCKED`](/reference/errors/#session_locked) after `lock`.

### lock()

Zeroes the session-owned private-key copy and permanently locks the session; later signing throws `SESSION_LOCKED`. If `lock` is called while a sign on the same session is still in flight, the calls race and the in-flight signature's result is unspecified.

### [Symbol.dispose]()

Calls `lock`, so a `using` declaration locks the session when its scope exits. Sessions bound with `const` or `let` are unaffected; disposal runs only where a caller opts in with `using`.

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `consumePrivateKey` is not 32 bytes. The input buffer is zeroed even on this path.

## Notes

Signing needs no passkey ceremony and shows no prompt. One user-verification prompt produces the entropy; the session then signs as often as the app asks until it is locked.

## See also

- [getSolanaAddress](/reference/get-solana-address/): the address for `session.publicKey`.
- [Sign Solana transactions](/recipes/sign-solana-transactions/): where `signMessage` plugs into a transaction flow.
- [Security model](/concepts/security-model/): what an active session exposes.
