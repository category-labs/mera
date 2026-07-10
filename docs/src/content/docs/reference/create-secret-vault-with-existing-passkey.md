---
title: createSecretVaultWithExistingPasskey
description: Encrypts one secret into a vault using an existing passkey and a fresh random salt.
---

Evaluates an existing passkey against a fresh random salt and encrypts one secret into a vault. Runs one `navigator.credentials.get()` ceremony, which may show browser or authenticator UI.

## Import

```ts
import { createSecretVaultWithExistingPasskey } from "@category-labs/mera";
```

## Usage

```ts
import {
  createSecretVaultWithExistingPasskey,
  parseSecretVault,
} from "@category-labs/mera";

const existing = parseSecretVault(localStorage.getItem("vault"));
const secret = new TextEncoder().encode("another secret");
try {
  const vault = await createSecretVaultWithExistingPasskey({
    rpId: "account.example.com",
    credential: existing.credential,
    secret,
  });
  localStorage.setItem("second-vault", JSON.stringify(vault));
} finally {
  secret.fill(0);
}
```

## Parameters

`options` is a `CreateSecretVaultWithExistingPasskeyOptions`.

### options.rpId

- Type: `string`
- Required

Relying party ID for the WebAuthn assertion. It must match the ID under which the passkey was created.

### options.credential

- Type: `PasskeyCredentialMetadata`
- Optional; when omitted, WebAuthn may choose any discoverable credential for the relying party

Credential metadata that restricts the assertion to one passkey. Reported transports are retained in the new vault when the selected credential matches.

### options.secret

- Type: `Uint8Array`
- Required

Secret bytes to encrypt. Any non-empty length; the library does not interpret them.

### options.timeout

- Type: `number`
- Optional; browser defaults apply when omitted

WebAuthn timeout in milliseconds.

## Returns

`Promise<PasskeySecretVault>`: a JSON-safe vault containing the selected credential metadata, generated PRF salt, nonce, and ciphertext.

## Errors

- [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable): the authenticator did not return a usable 32-byte PRF output.
- [`INPUT_INVALID`](/reference/errors/#input_invalid): `secret` is empty, or `credential.credentialId` is empty or not canonical base64url.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): Web Crypto is unavailable.
- [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed): WebAuthn is unavailable, cancelled, or returns an unexpected credential.

## Notes

A fresh random 32-byte PRF salt is generated for each call and stored in the vault. The secret and supplied credential metadata are copied before the ceremony begins. Caller-owned inputs are not modified or zeroed; internal secret and PRF-output copies are zeroed before the function settles.

## See also

- [createSecretVaultWithNewPasskey](/reference/create-secret-vault-with-new-passkey/): create the first vault together with a passkey.
- [decryptSecretVaultWithPasskey](/reference/decrypt-secret-vault-with-passkey/): perform the assertion and decrypt a stored vault.
- [One output, one purpose](/concepts/security-model/#one-output-one-purpose): why each vault receives a fresh salt.
