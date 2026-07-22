---
title: decryptSecretVaultWithPasskey
description: Performs a passkey assertion and decrypts one secret vault.
---

Performs the passkey [assertion](/concepts/passkeys-and-prf/#ceremonies-and-prompts) for a parsed vault and decrypts its secret. Runs one `navigator.credentials.get()` ceremony.

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

A parsed secret vault; [parseSecretVault](/reference/parse-secret-vault/) produces one from untrusted stored data. The assertion is restricted to the credential stored in the vault.

### options.timeout

- Type: `number`
- Optional; browser defaults apply when omitted

WebAuthn timeout in milliseconds.

## Returns

`Promise<Uint8Array>`: the decrypted secret bytes as a fresh allocation.

## Errors

- [`VAULT_FORMAT_INVALID`](/reference/errors/#vault_format_invalid): the vault's required structure, version, or encoded data is invalid.
- [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable): the authenticator did not return a usable 32-byte PRF output.
- [`DECRYPT_FAILED`](/reference/errors/#decrypt_failed): [AES-GCM](/concepts/secret-vaults/#how-a-vault-works) authentication failed because the PRF output was wrong or the vault was modified.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): the page is not in a secure context, or the runtime lacks Web Crypto.
- [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed): WebAuthn is unavailable, cancelled, or returns an unexpected credential.

## Notes

The vault is validated and copied before the assertion starts, so a malformed vault fails before any prompt. The transient PRF output is zeroed before the function finishes, even when decryption fails.

The WebAuthn challenge is generated internally.

## See also

- [parseSecretVault](/reference/parse-secret-vault/): validate stored JSON before this call.
- [Use an existing secret](/recipes/use-an-existing-secret/): the complete storage and secret-lifetime pattern.
