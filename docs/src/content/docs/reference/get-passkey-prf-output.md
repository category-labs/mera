---
title: getPasskeyPrfOutput
description: Requests a passkey PRF evaluation and returns the first output.
---

Requests a passkey PRF evaluation and returns the first output. Runs one `navigator.credentials.get()` ceremony, which may show browser or authenticator UI.

The PRF output is a deterministic function of the credential, `rpId`, and `prfSalt`: the same three inputs reproduce the same 32 bytes, and a different salt yields an unrelated output.

## Import

```ts
import { getPasskeyPrfOutput } from "@category-labs/mera";
```

## Usage

```ts
import {
  getDeterministicPrfSaltV1,
  getPasskeyPrfOutput,
} from "@category-labs/mera";

const { credentialId, prfOutput } = await getPasskeyPrfOutput({
  rpId: "account.example.com",
  prfSalt: getDeterministicPrfSaltV1(),
});
```

## Parameters

`options` is a `GetPasskeyPrfOutputOptions`.

### options.rpId

- Type: `string`
- Required

Relying party ID for the WebAuthn assertion.

### options.credential

- Type: `PasskeyCredentialMetadata`
- Optional; when omitted, WebAuthn may choose any discoverable credential for the relying party

Credential metadata that restricts the assertion to one passkey: a `credentialId` in canonical unpadded base64url, plus the `transports` reported when it was created. An empty `credentialId` is rejected rather than passed through, because WebAuthn would treat it as no restriction at all and silently widen the assertion to any discoverable passkey.

### options.prfSalt

- Type: `Uint8Array`
- Required

PRF salt as 32 raw bytes. Copied before use; the original buffer is not modified.

### options.timeout

- Type: `number`
- Optional; browser defaults apply when omitted

WebAuthn timeout in milliseconds.

## Returns

`Promise<PasskeyPrfResult>`: the `credentialId` the browser actually selected (canonical unpadded base64url) and the 32-byte `prfOutput`. Checking the returned ID matters in the discoverable case, where the person may have picked a different passkey than the app expected.

## Errors

- [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable): the authenticator did not return a usable 32-byte PRF output.
- [`INPUT_INVALID`](/reference/errors/#input_invalid): `prfSalt` is not 32 bytes, or `credential.credentialId` is empty or not canonical base64url.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): Web Crypto is unavailable.
- [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed): WebAuthn is unavailable, cancelled, or returns an unexpected credential.

## Notes

The assertion requires user verification, and the requirement is not configurable. Authenticators built on CTAP's `hmac-secret` keep two PRFs per credential, one for user-verified requests and one for the rest; WebAuthn exposes only the user-verified PRF and overrides a weaker `userVerification` setting when evaluating it, so a configurable setting could neither change the output nor skip the check.

The WebAuthn challenge is generated internally. The raw assertion response is not returned.

WebAuthn availability is checked before Web Crypto, so an environment missing both throws `PASSKEY_OPERATION_FAILED`.

## See also

- [getDeterministicPrfSaltV1](/reference/get-deterministic-prf-salt-v1/): the fixed salt for derived flows.
- [getSecretVaultPrfOutput](/reference/get-secret-vault-prf-output/): the same assertion, driven by a stored vault.
- [Derive accounts from one passkey](/recipes/derive-accounts/): credential pinning in practice.
