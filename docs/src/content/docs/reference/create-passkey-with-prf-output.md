---
title: createPasskeyWithPrfOutput
description: Creates a passkey and returns its deterministic PRF output in one call.
---

Creates a [discoverable](/concepts/passkeys-and-prf/), user-verified passkey with the [WebAuthn](https://www.w3.org/TR/webauthn-3/) PRF extension enabled and returns its PRF output. It runs one creation ceremony and shows one user-verification prompt; when the authenticator does not evaluate the PRF at create time, it runs [getPasskeyPrfOutput](/reference/get-passkey-prf-output/) with the same salt, which shows a second.

## Import

```ts
import { createPasskeyWithPrfOutput } from "@category-labs/mera";
```

## Usage

```ts
const { credentialId, prfSalt, prfOutput } = await createPasskeyWithPrfOutput({
  rp: { id: "account.example.com", name: "Example" },
  user: { name: "account@example.com", displayName: "Example account" },
});
```

## Parameters

`options` is a `CreatePasskeyWithPrfOutputOptions`.

### options.rp

- Type: `{ id: string; name: string }`
- Required, including `rp.id`

Relying party identity, passed to WebAuthn. `rp.id` lets the fallback ceremony target the same relying party.

### options.user.name

- Type: `string`
- Required

User name displayed or stored by the authenticator.

### options.user.displayName

- Type: `string`
- Required

Human-readable display name for the authenticator UI.

### options.prfSalt

- Type: `Uint8Array`
- Optional; defaults to mera's fixed salt

32-byte PRF salt evaluated during creation or by the fallback [assertion](/concepts/passkeys-and-prf/#ceremonies-and-prompts). An explicit value supports custom PRF namespaces.

### options.timeout

- Type: `number`
- Optional; platform defaults apply when omitted

WebAuthn timeout in milliseconds, applied to each ceremony.

### options.webAuthnClient

- Type: `WebAuthnClient`
- Optional; defaults to the built-in browser client

Client that runs the ceremony. [WebAuthnClient](/reference/web-authn-client/) covers supplying one for a runtime without `navigator.credentials`.

## Returns

`Promise<CreatePasskeyWithPrfOutputResult>`. Credential metadata (`credentialId`, `transports` when reported) plus the 32-byte `prfSalt` that was evaluated and the 32-byte `prfOutput`.

## Errors

- [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable): the authenticator reported no PRF support and returned no create-time output, returned an output that is not 32 bytes, or returned none on the fallback ceremony.
- [`INPUT_INVALID`](/reference/errors/#input_invalid): an explicit `prfSalt` is not 32 bytes.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): the runtime provides no `crypto.getRandomValues`.
- [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed): WebAuthn is unavailable, cancelled, or returns an unexpected credential.

## Notes

The credential is requested with fixed parameters: ES256 or RS256 key types, attestation `"none"` (no statement about the authenticator's make is requested), a required resident key, and required user verification. Resident key is the WebAuthn term for a [discoverable](/concepts/passkeys-and-prf/) credential. The user-verification requirement is not configurable ([Passkeys and the PRF extension](/concepts/passkeys-and-prf/#user-verification) explains the mechanism).

WebAuthn challenges and the credential's [user handle](/concepts/passkeys-and-prf/#user-handles) (`user.id`) are generated internally, 32 random bytes each. A fresh handle per call means each call adds a passkey and never overwrites one.

Any failure after the creation ceremony completes leaves the passkey on the authenticator: it appears in the authenticator's passkey list, but the thrown error does not carry its metadata.

## See also

- [createSecretVaultWithNewPasskey](/reference/create-secret-vault-with-new-passkey/): create a passkey and vault with a fresh random salt.
- [Getting started](/getting-started/): the passkey-account flow built on this call.
