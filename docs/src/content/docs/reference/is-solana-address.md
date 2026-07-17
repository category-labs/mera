---
title: isSolanaAddress
description: Returns true when a string is a valid base58-encoded Solana address.
---

Returns `true` when a string is valid base58 and decodes to exactly 32 bytes.

## Import

```ts
import { isSolanaAddress } from "@category-labs/mera";
```

## Usage

```ts
const input = "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";

if (isSolanaAddress(input)) {
  // input: SolanaAddress from here on
}
```

## Parameters

### value

- Type: `string`
- Required

The string to check.

## Returns

`boolean`, and a type predicate for `SolanaAddress`.

## Errors

None. Invalid input returns `false`.

## See also

- [getSolanaAddress](/reference/get-solana-address/): the other way to mint a `SolanaAddress`.
