---
title: decryptSecretVaultWithPasskey
description: Performs a passkey assertion and decrypts one secret vault.
---

Performs the passkey [assertion](/concepts/passkeys-and-prf/#ceremonies-and-prompts) for a parsed vault and decrypts its secret. Runs one assertion ceremony.

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
- Optional; platform defaults apply when omitted

WebAuthn timeout in milliseconds.

### options.webAuthnClient

- Type: `WebAuthnClient`
- Optional; defaults to the built-in browser client

Client that runs the ceremony. [WebAuthnClient](/reference/web-authn-client/) covers supplying one for a runtime without `navigator.credentials`.

## Returns

```ts
type ReturnType = Promise<Uint8Array<ArrayBuffer>>;
```

The decrypted secret bytes as a fresh allocation.

## Errors

- [`VAULT_FORMAT_INVALID`](/reference/errors/#vault_format_invalid)
- [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable): the authenticator did not return a usable 32-byte PRF output.
- [`DECRYPT_FAILED`](/reference/errors/#decrypt_failed)
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): the runtime provides no `crypto.getRandomValues` or `crypto.subtle`, or its `crypto.subtle` lacks the HKDF or AES-GCM support the vault needs.
- [`PASSKEY_CANCELLED`](/reference/errors/#passkey_cancelled)
- [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed)

## Notes

The WebAuthn challenge is generated internally.

## See also

- [parseSecretVault](/reference/parse-secret-vault/): validate stored JSON before this call.
- [Encrypt an existing secret with a passkey](/recipes/use-an-existing-secret/): the complete storage and secret-lifetime pattern.
