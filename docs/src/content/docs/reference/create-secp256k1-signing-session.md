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

secp256k1 private key. Must be exactly 32 bytes and a valid scalar, an integer inside the curve's private-key range. Copied into one session-owned snapshot.

## Returns

A live `Secp256k1SigningSession`.

### publicKey

`Uint8Array`, 65 bytes, the uncompressed secp256k1 public key with the `0x04` prefix.

### signDigest(digest32)

Signs a 32-byte digest without prehashing it and resolves to a `Secp256k1Signature`: `compact` (64 bytes, `r || s`, low-S: `s` lies in the lower half of the curve order) plus `recovery` (0 or 1).

### end()

Zeroes the session-owned private-key copy and permanently ends the session; later signing throws [`SESSION_ENDED`](/reference/errors/#session_ended).

### [Symbol.dispose]()

Calls `end`, so a `using` declaration ends the session when its scope exits:

```ts
{
  using session = createSecp256k1SigningSession({ privateKey });
  await session.signDigest(digest32);
} // ended here
```

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `privateKey` is not a valid secp256k1 scalar, or `digest32` is not 32 bytes.
- [`SESSION_ENDED`](/reference/errors/#session_ended): `signDigest` was called after `end`.

## Notes

The recovery ID is declared `0 | 1`. Values 2 and 3 exist in ECDSA, the signature algorithm secp256k1 uses, but require the signature's `r` to reach the curve order, which happens with probability around 2^-127; if it ever did, the call would throw [`INPUT_INVALID`](/reference/errors/#input_invalid) rather than return a signature that cannot be address-recovered.

## See also

- [getEvmAddress](/reference/get-evm-address/): the address for `session.publicKey`.
- [toViemAccount](/reference/to-viem-account/): a viem account backed by the session.
- [Signing sessions](/concepts/signing-sessions/): how a session owns the key, the lifecycle, and what an active session exposes.
