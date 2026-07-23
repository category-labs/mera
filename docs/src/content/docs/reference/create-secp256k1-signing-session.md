---
title: createSecp256k1SigningSession
description: Creates a signing session from a secp256k1 private key.
---

Creates a signing session from a [secp256k1](/concepts/entropy-keys-and-accounts/) private key.

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

const privateKey = crypto.getRandomValues(new Uint8Array(32));
const digest32 = new Uint8Array(32);

const session = createSecp256k1SigningSession({ privateKey });

const address = getEvmAddress(session.publicKey);
const { compact, recovery } = await session.signDigest(digest32);

session.end();
```

## Parameters

`options` is a `CreateSigningSessionOptions`.

### options.privateKey

- Type: `Uint8Array`
- Required

secp256k1 private key. Must be exactly 32 bytes and a valid scalar, an integer inside the curve's private-key range.

## Returns

A live [`Secp256k1SigningSession`](/reference/secp256k1-signing-session/).

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `privateKey` is not 32 bytes or not a valid secp256k1 scalar.

## See also

- [getEvmAddress](/reference/get-evm-address/): the address for `session.publicKey`.
- [toViemAccount](/reference/to-viem-account/): a viem account backed by the session.
- [Signing sessions](/concepts/signing-sessions/): how a session owns the key, and the lifecycle.
