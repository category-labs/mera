---
title: Errors
description: Every error the library throws and its stable code.
---

The library uses `MeraError` for its documented failure modes. It carries a stable, machine-readable `code` alongside the usual `message` and optional `cause`. The codes are the contract; the message text is free to change between versions.

## MeraError

```ts
class MeraError extends Error {
  readonly code: MeraErrorCode;
}
```

`name` is always `"MeraError"`. When a lower-level failure triggered the error (a [WebAuthn](https://www.w3.org/TR/webauthn-3/) rejection, a Web Crypto failure), it is attached as `cause`.

## isMeraError

```ts
import {
  getPasskeyPrfOutput,
  isMeraError,
} from "@category-labs/mera";

try {
  await getPasskeyPrfOutput({
    rpId: "account.example.com",
  });
} catch (error) {
  if (isMeraError(error) && error.code === "PRF_UNAVAILABLE") {
    // Point at a PRF-capable authenticator.
  }
  throw error;
}
```

`isMeraError` is a type guard: it narrows a caught value so `code` can be branched on.

## Codes

### PASSKEY_OPERATION_FAILED

WebAuthn failed, was cancelled, returned an unexpected credential, or the credential API is unavailable. Cancellation is the everyday case: the person dismissed the prompt.

### CRYPTO_UNAVAILABLE

Web Crypto is unavailable. In practice this means the page is running outside a secure context (HTTPS, or `localhost` during development), or in a runtime without `globalThis.crypto`.

### PRF_UNAVAILABLE

The authenticator did not enable PRF, or did not return a usable 32-byte PRF output. [Authenticator support](/authenticator-support/) lists tested compatible stacks.

### SESSION_ENDED

A signing call was made after the session's `end()`.

### DECRYPT_FAILED

[AES-GCM](/concepts/secret-vaults/#how-a-vault-works) authentication failed while decrypting a vault: wrong key material or a tampered nonce/ciphertext pair.

### INPUT_INVALID

A caller-supplied value at a public boundary did not satisfy a length, range, encoding, or curve constraint (a private key that is not a valid scalar, a public key that is not a valid point). Each function's Errors section lists its specific conditions.

### VAULT_FORMAT_INVALID

Untrusted vault data (JSON text or an object) was malformed, missing required fields, used a non-canonical encoding, or declared an unsupported version.
