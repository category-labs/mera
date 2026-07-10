---
title: createSecretVaultWithNewPasskey
description: Creates a passkey and encrypts one secret into a vault with a fresh random salt.
---

Creates a passkey and encrypts one secret into a vault. Runs one `navigator.credentials.create()` ceremony and may run a fallback `navigator.credentials.get()` ceremony, so it may show one or two browser prompts.

## Import

```ts
import { createSecretVaultWithNewPasskey } from "@category-labs/mera";
```

## Usage

```ts
import { createSecretVaultWithNewPasskey } from "@category-labs/mera";

const secret = new TextEncoder().encode("the secret to protect");
try {
  const vault = await createSecretVaultWithNewPasskey({
    rp: { id: "account.example.com", name: "Example" },
    user: { name: "account@example.com", displayName: "Example account" },
    secret,
  });
  localStorage.setItem("vault", JSON.stringify(vault));
} finally {
  secret.fill(0);
}
```

## Parameters

`options` is a `CreateSecretVaultWithNewPasskeyOptions`.

### options.rp

- Type: `PublicKeyCredentialRpEntity & { id: string }`
- Required, including `rp.id`

Relying party identity passed to WebAuthn. The required ID is reused by the fallback assertion.

### options.user

- Type: `{ id?: Uint8Array; name: string; displayName: string }`
- Required

User identity passed to WebAuthn. `id` must be 1 to 64 bytes when provided. A fresh random 32-byte user handle is generated when it is omitted.

### options.secret

- Type: `Uint8Array`
- Required

Secret bytes to encrypt. Any non-empty length; the library does not interpret them.

### options.timeout

- Type: `number`
- Optional; browser defaults apply when omitted

WebAuthn timeout in milliseconds, applied to each ceremony.

## Returns

`Promise<PasskeySecretVault>`: a JSON-safe vault containing the new credential metadata, generated PRF salt, nonce, and ciphertext.

## Errors

- [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable): the authenticator did not enable PRF or return a usable 32-byte output.
- [`INPUT_INVALID`](/reference/errors/#input_invalid): `secret` is empty, or the provided `user.id` length is outside 1 to 64 bytes.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): Web Crypto is unavailable.
- [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed): WebAuthn is unavailable, cancelled, or returns an unexpected credential.

## Notes

A fresh random 32-byte PRF salt is generated for the vault and stored in it. The secret is copied before either ceremony begins. The caller-owned buffer is not modified or zeroed; internal secret and PRF-output copies are zeroed before the function settles.

If the fallback ceremony or vault encryption fails after creation, the passkey remains on the authenticator and the error does not contain its metadata.

## See also

- [createSecretVaultWithExistingPasskey](/reference/create-secret-vault-with-existing-passkey/): create another vault with an existing passkey.
- [unwrapSecretVaultWithPasskey](/reference/unwrap-secret-vault-with-passkey/): perform the assertion and decrypt a stored vault.
- [Use an existing secret](/recipes/use-an-existing-secret/): the complete storage and secret-lifetime pattern.
