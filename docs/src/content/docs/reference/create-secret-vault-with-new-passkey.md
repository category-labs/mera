---
title: createSecretVaultWithNewPasskey
description: Creates a passkey and encrypts one secret into a vault with a fresh random salt.
---

Creates a passkey and encrypts one secret into a vault. Runs one creation ceremony and may run a fallback assertion, so it shows one or two user-verification prompts.

## Import

```ts
import { createSecretVaultWithNewPasskey } from "@category-labs/mera";
```

## Usage

```ts
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

- Type: `{ id: string; name: string }`
- Required, including `rp.id`

Relying party identity passed to [WebAuthn](https://www.w3.org/TR/webauthn-3/). The required ID is reused by the fallback [assertion](/concepts/passkeys-and-prf/#ceremonies-and-prompts).

### options.user.name

- Type: `string`
- Required

User name displayed or stored by the authenticator.

### options.user.displayName

- Type: `string`
- Required

Human-readable display name for the authenticator UI.

### options.secret

- Type: `Uint8Array`
- Required

Secret bytes to encrypt. Any non-empty length.

### options.timeout

- Type: `number`
- Optional; platform defaults apply when omitted

WebAuthn timeout in milliseconds, applied to each ceremony.

### options.webAuthnClient

- Type: `WebAuthnClient`
- Optional; defaults to `browserWebAuthnClient`

Client that runs the ceremony. [WebAuthnClient](/reference/web-authn-client/) covers supplying one for a runtime without `navigator.credentials`.

## Returns

`Promise<PasskeySecretVault>`: a JSON-safe vault with the new credential's metadata and a fresh random 32-byte PRF salt. The [secret vault format](/reference/secret-vault-format/) page documents every field.

## Errors

- [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable): the authenticator did not enable PRF or return a usable 32-byte output.
- [`INPUT_INVALID`](/reference/errors/#input_invalid): `secret` is empty.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): the runtime provides no `crypto.getRandomValues` or `crypto.subtle`.
- [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed): WebAuthn is unavailable, cancelled, or returns an unexpected credential.

## Notes

The credential's [user handle](/concepts/passkeys-and-prf/#user-handles) (`user.id`) is 32 random bytes, generated per call, so each call adds a passkey and never overwrites one.

If the fallback ceremony or vault encryption fails after creation, the passkey remains on the authenticator and the error does not contain its metadata.

## See also

- [createSecretVaultWithExistingPasskey](/reference/create-secret-vault-with-existing-passkey/): create another vault with an existing passkey.
- [decryptSecretVaultWithPasskey](/reference/decrypt-secret-vault-with-passkey/): perform the assertion and decrypt a stored vault.
- [Use an existing secret](/recipes/use-an-existing-secret/): the complete storage and secret-lifetime pattern.
