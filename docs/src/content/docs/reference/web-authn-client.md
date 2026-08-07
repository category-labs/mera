---
title: WebAuthnClient
description: The client mera runs its passkey ceremonies through, and how to supply one.
---

Every mera function that touches a passkey runs its [ceremony](/concepts/passkeys-and-prf/#ceremonies-and-prompts) through a `WebAuthnClient`. The built-in browser client calls `navigator.credentials`. Supplying another client runs the same functions on another platform.

## Import

```ts
import type { WebAuthnClient } from "@category-labs/mera";
```

## Usage

```ts
import { getPasskeyPrfOutput } from "@category-labs/mera";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";

const { prfOutput } = await getPasskeyPrfOutput({
  rpId: "account.example.com",
  webAuthnClient: reactNativeWebAuthnClient,
});
```

## Members

### createCredential

Runs one creation ceremony. The request contains the relying party, user, challenge, credential algorithms, PRF salt, timeout, and mera's fixed ceremony policy.

The result contains the credential ID, reported transports, whether the authenticator enabled PRF, and any PRF output produced during creation. When PRF is enabled without an output, mera calls `getCredential` with the same client and salt.

### getCredential

Runs one assertion ceremony. The request contains the relying party ID, challenge, PRF salt, timeout, user-verification requirement, and an optional allowed credential. Without an allowed credential, the platform may select any discoverable credential for the relying party.

The result contains the selected credential ID and any PRF output.

## reactNativeWebAuthnClient

The client for [react-native-passkey](https://github.com/f-23/react-native-passkey) `^3.5.0` lives in a separate entry point, so the root package loads no React Native code.

It calls `createPlatformKey` and `getPlatformKey`. These entry points keep iOS on platform credentials, whose results can include PRF output. Android uses Credential Manager.

Challenges, user handles, and credential IDs cross the native bridge as base64url. The PRF salt stays a `Uint8Array`, which both platform bridges accept. Results return to mera as `Uint8Array`, and malformed PRF byte values fail with [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable).

Errors from react-native-passkey surface as the `cause` of mera's [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed). The package's `PasskeyError` type describes that cause.

## Notes

Every ceremony parameter arrives in the request. Binary values cross in both directions as `Uint8Array`. A client converts those bytes to the shape its platform expects and returns credential IDs and PRF output as `Uint8Array`.

A PRF output that is not 32 bytes fails with [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable). Anything a client throws surfaces as [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed) with the original error as its `cause`.

Passkey functions need `crypto.getRandomValues`. Secret-vault functions also need `crypto.subtle`.

## See also

- [getPasskeyPrfOutput](/reference/get-passkey-prf-output/): the assertion that returns PRF output.
- [createPasskeyWithPrfOutput](/reference/create-passkey-with-prf-output/): the creation ceremony and its fallback assertion.
- [Authenticator support](/authenticator-support/#native-apps): native PRF requirements and tested combinations.
- [Passkeys and the PRF extension](/concepts/passkeys-and-prf/): ceremonies, prompts, and user verification.
