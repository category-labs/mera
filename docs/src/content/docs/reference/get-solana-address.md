---
title: getSolanaAddress
description: Derives the base58-encoded Solana address for an Ed25519 public key.
---

Derives the Solana address for an Ed25519 public key: the public key itself, base58-encoded.

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

A `SolanaAddress`, a branded `string` type. TypeScript cannot check base58 the way `0x${string}` covers EVM addresses, so only this function produces values of the type.

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `publicKey` is not 32 bytes.
