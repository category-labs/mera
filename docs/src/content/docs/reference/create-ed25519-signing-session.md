---
title: createEd25519SigningSession
description: Creates a signing session from an Ed25519 private key.
---

Creates a signing session from an [Ed25519](/concepts/entropy-keys-and-accounts/) private key.

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

const privateKey = crypto.getRandomValues(new Uint8Array(32));
const message = new TextEncoder().encode("hello mera");

const session = createEd25519SigningSession({ privateKey });

const address = getSolanaAddress(session.publicKey);
const signature = await session.signMessage(message);

session.end();
```

## Parameters

`options` is a `CreateSigningSessionOptions`.

### options.privateKey

- Type: `Uint8Array`
- Required

Ed25519 private key (the 32-byte seed). Copied into one session-owned snapshot.

## Returns

A live `Ed25519SigningSession`.

### publicKey

`Uint8Array`, the 32-byte Ed25519 public key. Derived from the same owned snapshot used for signing, so the two cannot diverge.

### signMessage(message)

Signs an arbitrary-length message and resolves to the 64-byte Ed25519 signature (`R || s`). Hashing happens inside Ed25519 itself; the caller passes the raw message, never a digest.

### end()

Zeroes the session-owned private-key copy and permanently ends the session; later signing throws [`SESSION_ENDED`](/reference/errors/#session_ended).

### [Symbol.dispose]()

Calls `end`, so a `using` declaration ends the session when its scope exits.

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `privateKey` is not 32 bytes.
- [`SESSION_ENDED`](/reference/errors/#session_ended): `signMessage` was called after `end`.

## See also

- [getSolanaAddress](/reference/get-solana-address/): the address for `session.publicKey`.
- [Signing sessions](/concepts/signing-sessions/): how a session owns the key, the lifecycle, and what an active session exposes.
