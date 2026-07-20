---
title: createPasskeyWithPrfOutput
description: Creates a passkey and returns its deterministic PRF output in one call.
---

Creates a passkey and returns its [WebAuthn](https://www.w3.org/TR/webauthn-3/) PRF output. It runs [createPasskey](/reference/create-passkey/)'s creation ceremony, which may show browser or authenticator UI; when that ceremony returns no `prfOutput`, it runs [getPasskeyPrfOutput](/reference/get-passkey-prf-output/) with the same salt, which may show a second prompt.

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

User handle stored with the discoverable credential. Must be 1 to 64 bytes when provided, the same constraint as on [createPasskey](/reference/create-passkey/#optionsuserid). Copied before use.

### options.prfSalt

- Type: `Uint8Array`
- Optional; defaults to mera's fixed v1 deterministic salt

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

WebAuthn challenges are generated internally. Raw attestation and assertion responses are not returned.

If the fallback ceremony fails, the passkey from the completed creation ceremony still exists on the authenticator, but the thrown error does not carry its metadata.

## See also

- [createSecretVault](/reference/create-secret-vault/): low-level vault encryption with explicit PRF material.
- [createSecretVaultWithNewPasskey](/reference/create-secret-vault-with-new-passkey/): create a passkey and vault with a fresh random salt.
- [Getting started](/getting-started/): the passkey-account flow built on this call.
