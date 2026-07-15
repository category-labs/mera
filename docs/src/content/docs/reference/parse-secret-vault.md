---
title: parseSecretVault
description: Parses and validates untrusted secret-vault JSON or objects.
---

Parses and validates untrusted secret-vault JSON or objects.

## Import

```ts
import { parseSecretVault } from "@category-labs/mera";
```

## Usage

```ts
const vault = parseSecretVault(localStorage.getItem("vault"));
// vault is a validated PasskeySecretVault
```

## Parameters

### value

- Type: `unknown`
- Required

The secret vault as JSON text or an untrusted object. Strings are JSON-parsed first; objects are validated directly. Anything else fails validation, including the `null` a storage read returns when nothing is stored.

## Returns

A validated `PasskeySecretVault`. Only version 1 vaults are accepted. The credential ID, PRF salt, nonce, and ciphertext are validated as canonical base64url and length-checked (salt 32 bytes, nonce 12 bytes, ciphertext at least the 16-byte GCM tag). Unknown fields are dropped: the returned object carries the v1 schema fields and nothing else.

## Errors

- [`VAULT_FORMAT_INVALID`](/reference/errors/#vault_format_invalid): the required structure, version, or encoded data is invalid. The underlying parse failure, when there is one, is attached as `cause`.

## Notes

A vault that came through this function cannot trigger the [`INPUT_INVALID`](/reference/errors/#input_invalid) re-checks in [getSecretVaultPrfOutput](/reference/get-secret-vault-prf-output/), [decryptSecretVault](/reference/decrypt-secret-vault/), or [decryptSecretVaultWithPasskey](/reference/decrypt-secret-vault-with-passkey/). Cryptographic failure ([`DECRYPT_FAILED`](/reference/errors/#decrypt_failed)) and ceremony failure remain possible.

A future vault format will use a higher version number. Rejecting an unknown version keeps an old library from misreading newer data.

## See also

- [Secret vault format](/reference/secret-vault-format/): the v1 schema this function enforces.
- [Use an existing secret](/recipes/use-an-existing-secret/): parse-then-unlock in context.
