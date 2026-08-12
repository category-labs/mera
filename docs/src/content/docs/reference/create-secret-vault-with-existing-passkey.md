---
title: createSecretVaultWithExistingPasskey
description: Encrypts one secret into a vault using an existing passkey and a fresh random salt.
---

Evaluates an existing passkey and encrypts one secret into a vault. Runs one [assertion](/concepts/passkeys-and-prf/#ceremonies-and-prompts) ceremony.

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

Relying party ID for the [WebAuthn](https://www.w3.org/TR/webauthn-3/) [assertion](/concepts/passkeys-and-prf/#ceremonies-and-prompts). It must match the ID under which the passkey was created.

### options.credential

- Type: `PasskeyCredentialMetadata`
- Optional; when omitted, WebAuthn may choose any discoverable credential for the relying party

Credential metadata that restricts the assertion to one passkey. Reported transports are retained in the new vault when the selected credential matches.

### options.secret

- Type: `Uint8Array`
- Required

Secret bytes to encrypt. Any non-empty length.

### options.timeout

- Type: `number`
- Optional; platform defaults apply when omitted

WebAuthn timeout in milliseconds.

### options.webAuthnClient

- Type: `WebAuthnClient`
- Optional; defaults to the built-in browser client

Client that runs the ceremony. [WebAuthnClient](/reference/web-authn-client/) covers supplying one for a runtime without `navigator.credentials`.

## Returns

```ts
import type { PasskeySecretVault } from "@category-labs/mera";

type ReturnType = Promise<PasskeySecretVault>;
```

A JSON-safe vault with `version`, `credential`, `prfSalt`, `nonce`, and `ciphertext`. It contains the selected credential's metadata and a fresh random 32-byte PRF salt. The [secret vault format](/reference/secret-vault-format/) page documents every field.

## Errors

- [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable): the authenticator did not return a usable 32-byte PRF output.
- [`INPUT_INVALID`](/reference/errors/#input_invalid): `secret` is empty, or `credential.credentialId` is empty or not canonical base64url.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): the runtime provides no `crypto.getRandomValues` or `crypto.subtle`.
- [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed): WebAuthn is unavailable, cancelled, or returns an unexpected credential.

## See also

- [createSecretVaultWithNewPasskey](/reference/create-secret-vault-with-new-passkey/): create the first vault together with a passkey.
- [decryptSecretVaultWithPasskey](/reference/decrypt-secret-vault-with-passkey/): perform the assertion and decrypt a stored vault.
- [Security model](/concepts/security-model/): why each vault receives a fresh salt.
