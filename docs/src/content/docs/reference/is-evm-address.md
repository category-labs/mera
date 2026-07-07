---
title: isEvmAddress
description: Returns true when a string is a 20-byte 0x-prefixed EVM address.
---

Returns `true` when a string is a 20-byte `0x`-prefixed EVM address, narrowing it to `EvmAddress` for TypeScript. Never throws.

## Import

```ts
import { isEvmAddress } from "@category-labs/mera";
```

## Usage

```ts
if (isEvmAddress(input)) {
  // input: EvmAddress from here on
}
```

## Parameters

### value

- Type: `string`
- Required

The string to check.

## Returns

`boolean`, and a type predicate for `EvmAddress`.

The case rules match how addresses circulate in the wild. All-lowercase and all-uppercase hex bodies are accepted as-is, since they carry no checksum to verify. Mixed-case input is validated against EIP-55, so an inconsistently cased address (a typo, a tampered string) is rejected.

## Errors

None. Invalid input returns `false`.

## See also

- [getEvmAddress](/reference/get-evm-address/): produces checksummed addresses this guard always accepts.
