---
title: createPasskey
description: Creates a discoverable, user-verified passkey with the WebAuthn PRF extension enabled.
---

Creates a discoverable, user-verified passkey with the WebAuthn PRF extension enabled. Runs one `navigator.credentials.create()` ceremony, which may show browser or authenticator UI.

## Import

```ts
import { createPasskey } from "@category-labs/mera";
```

## Usage

```ts
const credential = await createPasskey({
  rp: { id: "account.example.com", name: "Example" },
  user: { name: "account@example.com", displayName: "Example account" },
});
// credential.credentialId is base64url; credential.transports when reported.
```

## Parameters

`options` is a `CreatePasskeyOptions`.

### options.rp

- Type: `PublicKeyCredentialRpEntity`
- Required

Relying party identity, passed directly to WebAuthn.

### options.user.name

- Type: `string`
- Required

User name displayed or stored by the authenticator.

### options.user.displayName

- Type: `string`
- Required

Human-readable display name for the authenticator UI.

### options.user.id

- Type: `Uint8Array`
- Optional; a fresh 32-byte random handle is generated per call when omitted

User handle stored with the discoverable credential. Must be 1 to 64 bytes when provided (WebAuthn's user-handle limit). The generated handle is not correlated with an app account, so repeated calls do not share a stable user handle. Copied before use.

### options.timeout

- Type: `number`
- Optional; browser defaults apply when omitted

WebAuthn timeout in milliseconds.

### options.prfSalt

- Type: `Uint8Array`
- Optional; no PRF evaluation happens during creation when omitted

32-byte PRF salt to evaluate during creation. Authenticators that do not support PRF evaluation at create time silently ignore it, and the result then omits `prfOutput`. Copied before use; the original buffer is not modified.

## Returns

`Promise<CreatePasskeyResult>`. The credential ID as canonical unpadded base64url, the authenticator transports when the browser reports them, and a 32-byte `prfOutput` when `prfSalt` was provided and evaluated during creation.

## Errors

- [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable): the authenticator did not enable PRF, or returned a malformed create-time PRF output.
- [`INPUT_INVALID`](/reference/errors/#input_invalid): `prfSalt` is provided but not 32 bytes, or `user.id` is provided but not 1 to 64 bytes.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): Web Crypto is unavailable.
- [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed): WebAuthn is unavailable, cancelled, or returns an unexpected credential.

## Notes

The credential is requested with fixed parameters: ES256 or RS256 key types, attestation `"none"`, a required resident key, and required user verification. The user-verification requirement is not configurable: the PRF extension evaluates only the credential's user-verified PRF, so a `userVerification` setting could neither change the PRF output nor remove the check. [Passkeys and the PRF extension](/concepts/passkeys-and-prf/#user-verification) explains the mechanism.

The WebAuthn challenge is generated internally. The raw attestation response is not returned.

A `PRF_UNAVAILABLE` failure happens after the creation ceremony has completed: the passkey exists on the authenticator, but the thrown error does not carry its metadata. The orphaned credential appears in the authenticator's passkey list.

WebAuthn availability is checked before Web Crypto, so an environment missing both throws `PASSKEY_OPERATION_FAILED`.

## See also

- [createPasskeyWithPrfOutput](/reference/create-passkey-with-prf-output/): create and obtain the PRF output in one call.
- [getPasskeyPrfOutput](/reference/get-passkey-prf-output/): evaluate the PRF of an existing passkey.
