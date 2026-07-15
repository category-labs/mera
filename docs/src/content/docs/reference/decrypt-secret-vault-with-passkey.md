---
title: decryptSecretVaultWithPasskey
description: Performs a passkey assertion and decrypts one secret vault.
---

Performs the passkey assertion for a parsed vault and decrypts its secret. Runs one `navigator.credentials.get()` ceremony, which may show browser or authenticator UI.

## Import

```ts
import { decryptSecretVaultWithPasskey } from "@category-labs/mera";
```

## Usage

```ts
import {
  decryptSecretVaultWithPasskey,
  parseSecretVault,
} from "@category-labs/mera";

const vault = parseSecretVault(localStorage.getItem("vault"));
const secret = await decryptSecretVaultWithPasskey({
  rpId: "account.example.com",
  vault,
});
try {
  // use the secret bytes
} finally {
  secret.fill(0);
}
```

## Parameters

`options` is a `DecryptSecretVaultWithPasskeyOptions`.

### options.rpId

- Type: `string`
- Required

Relying party ID for the [WebAuthn](https://www.w3.org/TR/webauthn-3/) assertion. It must match the ID under which the vault's passkey was created.

### options.vault

- Type: `PasskeySecretVault`
- Required

A parsed secret vault. Run untrusted stored data through [parseSecretVault](/reference/parse-secret-vault/) first. The assertion is restricted to the credential stored in the vault.

### options.timeout

- Type: `number`
- Optional; browser defaults apply when omitted

WebAuthn timeout in milliseconds.

## Returns

`Promise<Uint8Array>`: the decrypted secret bytes as a fresh allocation. The library keeps no reference to this buffer and does not zero it; the caller controls its lifetime.

## Errors

- [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable): the authenticator did not return a usable 32-byte PRF output.
- [`INPUT_INVALID`](/reference/errors/#input_invalid): the vault contains an invalid credential ID, PRF salt, nonce, or ciphertext.
- [`DECRYPT_FAILED`](/reference/errors/#decrypt_failed): AES-GCM authentication failed because the PRF output was wrong or the vault was modified.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): Web Crypto is unavailable.
- [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed): WebAuthn is unavailable, cancelled, or returns an unexpected credential.

## Notes

The vault is copied before the assertion starts, so post-call mutation changes neither the credential restriction nor the ciphertext being decrypted. The transient PRF output is zeroed before the function settles, including when decryption fails.

The WebAuthn challenge is generated internally, and the raw assertion response is not returned.

## See also

- [parseSecretVault](/reference/parse-secret-vault/): validate stored JSON before this call.
- [decryptSecretVault](/reference/decrypt-secret-vault/): decrypt with an explicitly supplied PRF output.
- [Use an existing secret](/recipes/use-an-existing-secret/): the complete storage and secret-lifetime pattern.
