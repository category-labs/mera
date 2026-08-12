---
title: WebAuthnClient
description: An abstraction layer between mera's passkey functions and a platform's WebAuthn API.
---

`WebAuthnClient` is the abstraction layer between mera's passkey functions and a platform's WebAuthn API. For each call, mera builds a request that the client converts to the platform's format and sends to the API.

The built-in browser client calls `navigator.credentials`. Apps on other platforms can provide a client that implements `createCredential` and `getCredential`.

## Members

```ts
type WebAuthnClient = {
  readonly createCredential: (
    request: WebAuthnCreateCredentialRequest,
  ) => Promise<WebAuthnCreateCredentialResult>;
  readonly getCredential: (
    request: WebAuthnGetCredentialRequest,
  ) => Promise<WebAuthnGetCredentialResult>;
};
```

Requests and results use `Uint8Array` for binary values. When creation enables PRF but returns no output, mera calls `getCredential` with the same client and salt.

A PRF output that is not 32 bytes fails with [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable). Anything a client throws surfaces as [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed) with the original error as its `cause`.

## Usage

```ts
import { getPasskeyPrfOutput } from "@category-labs/mera";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";

const { prfOutput } = await getPasskeyPrfOutput({
  rpId: "account.example.com",
  webAuthnClient: reactNativeWebAuthnClient,
});
```

## reactNativeWebAuthnClient

The React Native client requires [react-native-passkey](https://github.com/f-23/react-native-passkey). It lives in a separate entry point, so the root package loads no React Native code.

The `cause` inside [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed) is react-native-passkey's `PasskeyError`.

## See also

- [getPasskeyPrfOutput](/reference/get-passkey-prf-output/): the assertion that returns PRF output.
- [createPasskeyWithPrfOutput](/reference/create-passkey-with-prf-output/): the creation ceremony and its fallback assertion.
- [Use mera with React Native](/recipes/use-mera-with-react-native/): configure passkeys in a React Native app.
- [Authenticator support](/authenticator-support/): browser and operating system support.
- [Passkeys and the PRF extension](/concepts/passkeys-and-prf/): ceremonies, prompts, and user verification.
