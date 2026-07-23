---
title: getPasskeyPrfOutput
description: Requests a passkey PRF evaluation and returns the output.
---

Runs one `navigator.credentials.get()` [ceremony](/concepts/passkeys-and-prf/#ceremonies-and-prompts) and returns the passkey's PRF output.

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

Credential metadata that restricts the assertion to one passkey: a `credentialId` in canonical unpadded base64url, plus the `transports` reported when it was created.

### options.prfSalt

- Type: `Uint8Array`
- Optional; defaults to mera's fixed salt

PRF salt as 32 raw bytes. An explicit value supports custom PRF namespaces.

### options.timeout

- Type: `number`
- Optional; browser defaults apply when omitted

WebAuthn timeout in milliseconds.

## Returns

`Promise<PasskeyPrfResult>`: the `credentialId` the browser actually selected (canonical unpadded base64url) and the 32-byte `prfOutput`. When `credential` was omitted, the person picks the passkey in the browser UI, so the returned ID can name a different credential than the app expected.

## Errors

- [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable): the authenticator did not return a usable 32-byte PRF output.
- [`INPUT_INVALID`](/reference/errors/#input_invalid): an explicit `prfSalt` is not 32 bytes, or `credential.credentialId` is empty or not canonical base64url.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): the page is not in a secure context, or the runtime lacks Web Crypto.
- [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed): WebAuthn is unavailable, cancelled, or returns an unexpected credential.

## Notes

When `prfSalt` is omitted, the default salt is used: `sha256("mera.prf.salt.v1")`. The salt will not change across library versions, and another implementation can reproduce the output from the same constant.

The assertion requires user verification, and the requirement is not configurable ([Passkeys and the PRF extension](/concepts/passkeys-and-prf/#user-verification) explains the mechanism).

The WebAuthn challenge is generated internally.

## See also

- [Create passkey accounts](/recipes/create-passkey-accounts/): credential pinning in practice.
