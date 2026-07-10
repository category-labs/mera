---
title: createPasskeyWithPrfOutput
description: Creates a passkey and returns the PRF output for the given salt in one call.
---

Creates a passkey and returns the WebAuthn PRF output for the given salt. If the [createPasskey](/reference/create-passkey/) result has no `prfOutput`, the function runs [getPasskeyPrfOutput](/reference/get-passkey-prf-output/) with the same salt, which may show a second browser prompt.

## Import

```ts
import { createPasskeyWithPrfOutput } from "@category-labs/mera";
```

## Usage

```ts
import {
  createPasskeyWithPrfOutput,
  getDeterministicPrfSaltV1,
} from "@category-labs/mera";

const result = await createPasskeyWithPrfOutput({
  rp: { id: "account.example.com", name: "Example" },
  user: { name: "account@example.com", displayName: "Example account" },
  prfSalt: getDeterministicPrfSaltV1(),
});
// result.credentialId, result.prfSalt, result.prfOutput
```

## Parameters

`options` is a `CreatePasskeyWithPrfOutputOptions`. It tightens `CreatePasskeyOptions` in two places: `rp.id` is required so the fallback ceremony can target the same relying party, and `prfSalt` is required so the app explicitly chooses between the derived and wrapped patterns.

### options.rp

- Type: `PublicKeyCredentialRpEntity & { id: string }`
- Required, including `rp.id`

Relying party identity, passed to WebAuthn.

### options.user

- Type: `{ id?: Uint8Array; name: string; displayName: string }`
- Required

Same fields and constraints as on [createPasskey](/reference/create-passkey/#optionsusername): `name` and `displayName` are required, `id` is optional (1 to 64 bytes, fresh 32-byte random handle per call when omitted).

### options.prfSalt

- Type: `Uint8Array`
- Required

32-byte PRF salt, evaluated during creation or by the fallback assertion. Derived flows pass [getDeterministicPrfSaltV1()](/reference/get-deterministic-prf-salt-v1/); wrapped flows pass 32 fresh random bytes. Copied before async WebAuthn work starts, so post-call mutation of the input changes neither the fallback ceremony nor the returned salt.

### options.timeout

- Type: `number`
- Optional; browser defaults apply when omitted

WebAuthn timeout in milliseconds, applied to each ceremony.

## Returns

`Promise<CreatePasskeyWithPrfOutputResult>`. Credential metadata (`credentialId`, `transports` when reported) plus the 32-byte `prfSalt` that was evaluated and the 32-byte `prfOutput`. The returned salt never aliases the caller's input.

The result can be passed straight through as the `credential` argument of [createSecretVault](/reference/create-secret-vault/).

## Errors

- [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable): the authenticator did not enable PRF, or did not return PRF output on the fallback ceremony.
- [`INPUT_INVALID`](/reference/errors/#input_invalid): `prfSalt` is not 32 bytes, or `user.id` is provided but not 1 to 64 bytes.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): Web Crypto is unavailable.
- [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed): WebAuthn is unavailable, cancelled, or returns an unexpected credential.

## Notes

WebAuthn challenges are generated internally. Raw attestation and assertion responses are not returned.

If the fallback ceremony fails, the passkey from the completed creation ceremony still exists on the authenticator, but the thrown error does not carry its metadata.

## See also

- [createSecretVault](/reference/create-secret-vault/): wrap a secret with this function's result.
- [Getting started](/getting-started/): the derived-mode flow built on this call.
