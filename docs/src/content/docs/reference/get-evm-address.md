---
title: getEvmAddress
description: Derives the EIP-55 checksummed EVM address for a secp256k1 public key.
---

Derives the [EIP-55](https://eips.ethereum.org/EIPS/eip-55) checksummed EVM address for a secp256k1 public key: keccak-256 over the uncompressed key's coordinates, last 20 bytes, mixed-case checksum.

## Import

```ts
import { getEvmAddress } from "@category-labs/mera";
```

## Usage

```ts
import {
  createSecp256k1SigningSession,
  getEvmAddress,
} from "@category-labs/mera";

const session = createSecp256k1SigningSession({
  privateKey: crypto.getRandomValues(new Uint8Array(32)),
});

const address = getEvmAddress(session.publicKey);
// EIP-55 checksummed, like "0x8ba1f109551bD432803012645Ac136ddd64DBA72"
```

## Parameters

### publicKey

- Type: `Uint8Array`
- Required

A secp256k1 public key, compressed (33 bytes) or uncompressed (65 bytes). Normalized internally, so both forms give the same address.

## Returns

```ts
import type { EvmAddress } from "@category-labs/mera";

type ReturnType = EvmAddress;
```

The EIP-55 mixed-case checksummed address as a `0x`-prefixed string. `EvmAddress` is the structural type `` `0x${string}` ``.

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `publicKey` is not valid secp256k1 (wrong length, wrong prefix, or not a point on the curve).
