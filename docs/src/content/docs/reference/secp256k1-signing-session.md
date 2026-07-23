---
title: Secp256k1SigningSession
description: The live secp256k1 signing session.
---

A live signing session holding a secp256k1 private key. [createSecp256k1SigningSession](/reference/create-secp256k1-signing-session/) returns it.

## Import

```ts
import type { Secp256k1SigningSession } from "@category-labs/mera";
```

## Members

### publicKey

`Uint8Array`, 65 bytes, the uncompressed secp256k1 public key with the `0x04` prefix.

### signDigest(digest32)

Signs a 32-byte digest without prehashing it and resolves to a `Secp256k1Signature`: `compact` (64 bytes, `r || s`, low-S: `s` lies in the lower half of the curve order) plus `recovery` (0 or 1).

### end()

Zeroes the session-owned private-key copy and permanently ends the session; later signing throws [`SESSION_ENDED`](/reference/errors/#session_ended).

### [Symbol.dispose]()

Calls `end`, so a `using` declaration ends the session when its scope exits:

```ts
import { createSecp256k1SigningSession } from "@category-labs/mera";

const privateKey = crypto.getRandomValues(new Uint8Array(32));
const digest32 = new Uint8Array(32);

{
  using session = createSecp256k1SigningSession({ privateKey });
  await session.signDigest(digest32);
} // ended here
```

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `digest32` is not 32 bytes.
- [`SESSION_ENDED`](/reference/errors/#session_ended): `signDigest` was called after `end`.

## See also

- [createSecp256k1SigningSession](/reference/create-secp256k1-signing-session/): creates the session from a private key.
- [getEvmAddress](/reference/get-evm-address/): the address for `publicKey`.
- [toViemAccount](/reference/to-viem-account/): a viem account backed by the session.
- [Signing sessions](/concepts/signing-sessions/): how a session owns the key, and the lifecycle.
