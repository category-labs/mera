---
title: getPasskeyPrfOutput
description: Requests a passkey PRF evaluation and returns the output.
---

Requests a passkey PRF evaluation and returns the output. Runs one `navigator.credentials.get()` ceremony and shows one user-verification prompt.

## Import

```ts
import { getPasskeyPrfOutput } from "@category-labs/mera";
```

## Usage

```ts
const { credentialId, prfOutput } = await getPasskeyPrfOutput({
  rpId: "account.example.com",
});
```

## Parameters

`options` is a `GetPasskeyPrfOutputOptions`.

### options.rpId

- Type: `string`
- Required

Relying party ID for the [WebAuthn](https://www.w3.org/TR/webauthn-3/) [assertion](/concepts/passkeys-and-prf/#ceremonies-and-prompts).

### options.credential

- Type: `PasskeyCredentialMetadata`
- Optional; when omitted, WebAuthn may choose any discoverable credential for the relying party

Credential metadata that restricts the assertion to one passkey: a `credentialId` in canonical unpadded base64url, plus the `transports` reported when it was created. An empty `credentialId` is rejected rather than passed through, because WebAuthn would treat it as no restriction at all and silently widen the assertion to any discoverable passkey.

### options.prfSalt

- Type: `Uint8Array`
- Optional; defaults to mera's fixed v1 deterministic salt

PRF salt as 32 raw bytes. An explicit value supports custom PRF namespaces and low-level composition. It is copied before use.

### options.timeout

- Type: `number`
- Optional; browser defaults apply when omitted

WebAuthn timeout in milliseconds.

## Returns

`Promise<PasskeyPrfResult>`: the `credentialId` the browser actually selected (canonical unpadded base64url) and the 32-byte `prfOutput`. When `credential` was omitted, the person picks the passkey in the browser UI, so the returned ID can name a different credential than the app expected.

## Errors

- [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable): the authenticator did not return a usable 32-byte PRF output.
- [`INPUT_INVALID`](/reference/errors/#input_invalid): an explicit `prfSalt` is not 32 bytes, or `credential.credentialId` is empty or not canonical base64url.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): Web Crypto is unavailable.
- [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed): WebAuthn is unavailable, cancelled, or returns an unexpected credential.

## Notes

The assertion requires user verification, and the requirement is not configurable; [Passkeys and the PRF extension](/concepts/passkeys-and-prf/#user-verification) explains the mechanism.

The WebAuthn challenge is generated internally.

## See also

- [getDeterministicPrfSaltV1](/reference/get-deterministic-prf-salt-v1/): access the default salt explicitly for protocol interoperability.
- [getSecretVaultPrfOutput](/reference/get-secret-vault-prf-output/): the same assertion, driven by a stored vault.
- [Create passkey accounts](/recipes/create-passkey-accounts/): credential pinning in practice.
