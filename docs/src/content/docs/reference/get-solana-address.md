---
title: getSolanaAddress
description: Derives the base58-encoded Solana address for an Ed25519 public key.
---

Derives the base58-encoded Solana address for an Ed25519 public key. A Solana address is the public key itself, base58-encoded.

## Import

```ts
import { getSolanaAddress } from "@category-labs/mera";
```

## Usage

```ts
import {
  createEd25519SigningSession,
  getSolanaAddress,
} from "@category-labs/mera";

const session = createEd25519SigningSession({
  privateKey: crypto.getRandomValues(new Uint8Array(32)),
});

const address = getSolanaAddress(session.publicKey);
// base58, like "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV"
```

## Parameters

### publicKey

- Type: `Uint8Array`
- Required

A 32-byte Ed25519 public key.

## Returns

A `SolanaAddress`. The type is a nominal brand over `string`: base58 has no structural shape TypeScript could check the way `0x${string}` covers EVM addresses, so values of this type are minted only by this function. At runtime the value is a plain string.

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `publicKey` is not 32 bytes.

## See also

- [createEd25519SigningSession](/reference/create-ed25519-signing-session/): the session whose `publicKey` this typically receives.
