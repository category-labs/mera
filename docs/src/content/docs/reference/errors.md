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

A type guard: returns `true` when the value is a `MeraError` instance. Narrow with it first, then branch on `code`.

## Codes

### PASSKEY_OPERATION_FAILED

WebAuthn failed, was cancelled, returned an unexpected credential, or the credential API is unavailable. Cancellation is the everyday case: the person dismissed the prompt.

### CRYPTO_UNAVAILABLE

Web Crypto is unavailable. In practice this means the page is running outside a secure context, or in a runtime without `globalThis.crypto`.

### PRF_UNAVAILABLE

The authenticator did not enable PRF, or did not return a usable 32-byte PRF output. On the create path this fires after the creation ceremony has completed, so the passkey exists on the authenticator even though the error carries no metadata; [createPasskey](/reference/create-passkey/) documents the caveat. [Authenticator support](/authenticator-support/) lists tested compatible stacks.

### SESSION_LOCKED

A signing call was made after the session's `lock()`. Locking is permanent; recover by building a new session from fresh key material.

### DECRYPT_FAILED

AES-GCM authentication failed while decrypting a vault: wrong key material, or tampered ciphertext or additional authenticated data. The two cases are indistinguishable by design; GCM authenticates before it decrypts.

### INPUT_INVALID

A caller-supplied value at a public boundary did not satisfy a length, range, encoding, or curve (scalar or point) constraint. Each function's Errors section lists its specific conditions.

### VAULT_FORMAT_INVALID

Untrusted vault data (JSON text or an object) was malformed, missing required fields, used a non-canonical encoding, or declared an unsupported version. Thrown only by [parseSecretVault](/reference/parse-secret-vault/), the boundary for stored vault data.
