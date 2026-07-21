---
title: createPasskeyWithPrfOutput
description: Creates a passkey and returns its PRF output in one call.
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

`options` is a `CreatePasskeyWithPrfOutputOptions`. It requires `rp.id` so the fallback ceremony can target the same relying party.

### options.rp

- Type: `PublicKeyCredentialRpEntity & { id: string }`
- Required, including `rp.id`

Relying party identity, passed to WebAuthn.

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

### options.prfSalt

- Type: `Uint8Array`
- Optional; defaults to mera's fixed salt

32-byte PRF salt evaluated during creation or by the fallback [assertion](/concepts/passkeys-and-prf/#ceremonies-and-prompts). An explicit value supports custom PRF namespaces and low-level composition. It is copied before async WebAuthn work starts, so post-call mutation changes neither the fallback ceremony nor the returned salt.

### options.timeout

- Type: `number`
- Optional; browser defaults apply when omitted

WebAuthn timeout in milliseconds, applied to each ceremony.

## Returns

`Promise<CreatePasskeyWithPrfOutputResult>`. Credential metadata (`credentialId`, `transports` when reported) plus the 32-byte `prfSalt` that was evaluated and the 32-byte `prfOutput`. The returned salt is a fresh copy.

## Errors

- [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable): the authenticator did not enable PRF, or did not return PRF output on the fallback ceremony.
- [`INPUT_INVALID`](/reference/errors/#input_invalid): an explicit `prfSalt` is not 32 bytes, or the provided `user.id` length is outside 1 to 64 bytes.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): Web Crypto is unavailable.
- [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed): WebAuthn is unavailable, cancelled, or returns an unexpected credential.

## Notes

The credential is requested with fixed parameters: ES256 or RS256 key types, attestation `"none"` (no statement about the authenticator's make is requested), a required resident key, and required user verification. Resident key is the WebAuthn term for a [discoverable](/concepts/passkeys-and-prf/) credential. The user-verification requirement is not configurable ([Passkeys and the PRF extension](/concepts/passkeys-and-prf/#user-verification) explains the mechanism).

WebAuthn challenges are generated internally.

Any failure after the creation ceremony completes leaves the passkey on the authenticator: it appears in the authenticator's passkey list, but the thrown error does not carry its metadata.

## See also

- [createSecretVaultWithNewPasskey](/reference/create-secret-vault-with-new-passkey/): create a passkey and vault with a fresh random salt.
- [Getting started](/getting-started/): the passkey-account flow built on this call.
