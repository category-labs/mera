---
title: unwrapSecretVault
description: Decrypts the secret from a secret vault.
---

Decrypts the secret from a secret vault. No ceremony runs here; the caller brings the PRF output from [getSecretVaultPrfOutput](/reference/get-secret-vault-prf-output/).

## Import

```ts
import { unwrapSecretVault } from "@category-labs/mera";
```

## Usage

```ts
const secret = await unwrapSecretVault({ vault, prfOutput });
try {
  // use the secret bytes
} finally {
  secret.fill(0);
}
```

## Parameters

`options` is an `UnwrapSecretVaultOptions`.

### options.vault

- Type: `PasskeySecretVault`
- Required

A parsed secret vault. Run untrusted stored data through [parseSecretVault](/reference/parse-secret-vault/) first.

### options.prfOutput

- Type: `Uint8Array`
- Required

The 32-byte WebAuthn PRF output for the vault's stored salt. Copied before async cryptographic work starts; the caller-owned buffer is not modified or zeroed.

## Returns

`Promise<Uint8Array>`: the decrypted secret bytes, exactly as they were passed to [createSecretVault](/reference/create-secret-vault/). The returned buffer is a fresh allocation; the library keeps no reference to it and never zeroes it. Zeroing it after use is the caller's job.

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `prfOutput` is not 32 bytes, or the vault's `nonce` or `ciphertext` is not valid base64url (already validated for vaults from `parseSecretVault`).
- [`DECRYPT_FAILED`](/reference/errors/#decrypt_failed): AES-GCM authentication failed, meaning wrong key material or a tampered vault. The two are indistinguishable.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): Web Crypto is unavailable.

## See also

- [Wrap a recovery phrase](/recipes/wrap-a-recovery-phrase/): create, store, and unwrap with the zeroing pattern.
- [Secret vault format](/reference/secret-vault-format/): what the ciphertext actually contains.
