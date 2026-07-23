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

Ed25519 private key (the 32-byte seed).

## Returns

A live [`Ed25519SigningSession`](/reference/ed25519-signing-session/).

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `privateKey` is not 32 bytes.

## See also

- [getSolanaAddress](/reference/get-solana-address/): the address for `session.publicKey`.
- [Signing sessions](/concepts/signing-sessions/): how a session owns the key, and the lifecycle.
