---
title: Ed25519SigningSession
description: The live Ed25519 signing session.
---

A live signing session holding an Ed25519 private key. [createEd25519SigningSession](/reference/create-ed25519-signing-session/) returns it.

## Import

```ts
import type { Ed25519SigningSession } from "@category-labs/mera";
```

## Members

### publicKey

`Uint8Array`, the 32-byte Ed25519 public key.

### signMessage(message)

Signs an arbitrary-length message and resolves to the 64-byte Ed25519 signature (`R || s`). Hashing happens inside Ed25519 itself.

### end()

Zeroes the session-owned private-key copy and permanently ends the session; later signing throws [`SESSION_ENDED`](/reference/errors/#session_ended).

### \[Symbol.dispose]()

Calls `end`, so a `using` declaration ends the session when its scope exits:

```ts
import { createEd25519SigningSession } from "@category-labs/mera";

const privateKey = crypto.getRandomValues(new Uint8Array(32));
const message = new TextEncoder().encode("hello mera");

{
  using session = createEd25519SigningSession({ privateKey });
  await session.signMessage(message);
} // ended here
```

## Errors

- [`SESSION_ENDED`](/reference/errors/#session_ended): `signMessage` was called after `end`.

## See also

- [createEd25519SigningSession](/reference/create-ed25519-signing-session/): creates the session from a private key.
- [getSolanaAddress](/reference/get-solana-address/): the address for `publicKey`.
- [Signing sessions](/concepts/signing-sessions/): how a session owns the key, and the lifecycle.
