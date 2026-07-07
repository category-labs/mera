---
title: parseSecretVault
description: Parses and validates untrusted secret-vault JSON or objects.
---

Parses and validates untrusted secret-vault JSON or objects. This is the boundary for stored vault data: anything read from `localStorage`, a backend, or a sync service goes through here before other vault functions see it. Synchronous.

## Import

```ts
import { parseSecretVault } from "@category-labs/mera";
```

## Usage

```ts
const stored = localStorage.getItem("vault");
if (stored !== null) {
  const vault = parseSecretVault(stored);
  // vault is a validated PasskeySecretVault
}
```

## Parameters

### value

- Type: `unknown`
- Required

The secret vault as JSON text or an untrusted object. Strings are JSON-parsed first; objects are validated directly.

## Returns

A validated `PasskeySecretVault`. Only version 1 vaults are accepted. The credential ID, PRF salt, nonce, and ciphertext are validated as canonical base64url and length-checked (salt 32 bytes, nonce 12 bytes, ciphertext at least the 16-byte GCM tag). Unknown fields are dropped: the returned object carries the v1 schema fields and nothing else.

## Errors

- [`VAULT_FORMAT_INVALID`](/reference/errors/#vault_format_invalid): the required structure, version, or encoded data is invalid. The underlying parse failure, when there is one, rides along as `cause`.

## Notes

A vault that came through this function cannot trigger the `INPUT_INVALID` re-checks in [getSecretVaultPrfOutput](/reference/get-secret-vault-prf-output/) or [unwrapSecretVault](/reference/unwrap-secret-vault/); what remains is cryptographic failure (`DECRYPT_FAILED`) or ceremony failure.

A future vault format bumps the version number; an old library refusing it beats an old library misreading it.

## See also

- [Secret vault format](/reference/secret-vault-format/): the v1 schema this function enforces.
- [Wrap a recovery phrase](/recipes/wrap-a-recovery-phrase/): parse-then-unlock in context.
