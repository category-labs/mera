---
title: decryptSecretVault
description: Decrypts the secret from a secret vault.
---

Decrypts the secret from a secret vault.

## Import

```ts
import { decryptSecretVault } from "@category-labs/mera";
```

## Usage

```ts
import {
  decryptSecretVault,
  getSecretVaultPrfOutput,
  parseSecretVault,
} from "@category-labs/mera";

const vault = parseSecretVault(localStorage.getItem("vault"));
const { prfOutput } = await getSecretVaultPrfOutput({
  rpId: "account.example.com",
  vault,
});

const secret = await decryptSecretVault({ vault, prfOutput });
try {
  // use the secret bytes
} finally {
  secret.fill(0);
}
```

## Parameters

`options` is a `DecryptSecretVaultOptions`.

### options.vault

- Type: `PasskeySecretVault`
- Required

A parsed secret vault; [parseSecretVault](/reference/parse-secret-vault/) produces one from untrusted stored data.

### options.prfOutput

- Type: `Uint8Array`
- Required

The 32-byte [WebAuthn](https://www.w3.org/TR/webauthn-3/) PRF output for the vault's stored salt.

## Returns

`Promise<Uint8Array>`: the decrypted secret bytes, exactly as they were passed to [createSecretVault](/reference/create-secret-vault/).

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `prfOutput` is not 32 bytes, or the vault's `nonce` or `ciphertext` is not valid base64url (already validated for vaults from `parseSecretVault`).
- [`DECRYPT_FAILED`](/reference/errors/#decrypt_failed): AES-GCM authentication failed, meaning wrong key material or a tampered vault. The two are indistinguishable.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): Web Crypto is unavailable.

## Notes

The `prfOutput` buffer is copied before async cryptographic work starts.

The returned buffer is a fresh allocation; the library keeps no reference to it. Zeroing it after use is the caller's job.

## See also

- [decryptSecretVaultWithPasskey](/reference/decrypt-secret-vault-with-passkey/): perform the [assertion](/concepts/passkeys-and-prf/#ceremonies-and-prompts) and decryption in one call.
- [Use an existing secret](/recipes/use-an-existing-secret/): create, store, and decrypt with the zeroing pattern.
- [Secret vault format](/reference/secret-vault-format/): what the ciphertext actually contains.
