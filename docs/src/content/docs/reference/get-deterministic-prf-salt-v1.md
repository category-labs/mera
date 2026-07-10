---
title: getDeterministicPrfSaltV1
description: Returns mera's fixed v1 deterministic PRF salt.
---

Returns mera's fixed v1 deterministic PRF salt: `sha256("mera.v1.deterministic.prf")`. The PRF output functions use this value internally when `prfSalt` is omitted; this helper supports explicit protocol interoperability and custom composition.

The salt will not change across library versions, so one passkey assertion against it produces one stable 32-byte PRF output per credential and relying party. [Derived accounts](/concepts/derived-accounts-and-secret-vaults/) are built on that stability.

## Import

```ts
import { getDeterministicPrfSaltV1 } from "@category-labs/mera";
```

## Usage

```ts
const prfSalt = getDeterministicPrfSaltV1();
// 32 bytes, identical on every call and every mera version.
```

## Parameters

None.

## Returns

`Uint8Array` of 32 bytes. Each call returns a fresh copy: a `Uint8Array` cannot be frozen, so a shared buffer mutated by one caller would silently change every later derivation.

## Errors

None.

## Notes

The salt encodes no account selection. Selecting account 0 versus account 7 happens in the derivation scheme the app applies to the PRF output, never in the salt.

This salt belongs to derived flows. The secret-vault creation functions generate and store 32 fresh random bytes for each vault because vaults sharing one PRF output would share an encryption key.

## See also

- [getPasskeyPrfOutput](/reference/get-passkey-prf-output/): evaluate a passkey with this default or an explicit salt.
- [createSecretVaultWithNewPasskey](/reference/create-secret-vault-with-new-passkey/): create a secret vault with an internally generated salt.
- [Passkeys and the PRF extension](/concepts/passkeys-and-prf/): salts as namespaces.
