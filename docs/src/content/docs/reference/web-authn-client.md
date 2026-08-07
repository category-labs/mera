---
title: WebAuthnClient
description: The client mera runs its passkey ceremonies through, and how to supply one.
---

Every mera function that touches a passkey runs its [ceremony](/concepts/passkeys-and-prf/#ceremonies-and-prompts) through a `WebAuthnClient`. The default, `browserWebAuthnClient`, calls `navigator.credentials`. Supplying another one runs the same flows on a runtime that has no such object, a React Native app above all.

## Import

```ts
import { browserWebAuthnClient, type WebAuthnClient } from "@category-labs/mera";
```

## Usage

```ts
import { getPasskeyPrfOutput, type WebAuthnClient } from "@category-labs/mera";

const nativeClient: WebAuthnClient = {
  async createCredential(request) {
    const created = await platformCreate(request);
    return {
      credentialId: decodeBase64Url(created.credentialId),
      prfEnabled: created.prfEnabled,
      ...(created.prfOutput !== undefined
        ? { prfOutput: decodeBase64Url(created.prfOutput) }
        : {}),
    };
  },
  async getCredential(request) {
    const asserted = await platformGet(request);
    return {
      credentialId: decodeBase64Url(asserted.credentialId),
      ...(asserted.prfOutput !== undefined
        ? { prfOutput: decodeBase64Url(asserted.prfOutput) }
        : {}),
    };
  },
};

const { prfOutput } = await getPasskeyPrfOutput({
  rpId: "account.example.com",
  webAuthnClient: nativeClient,
});
```

## The contract

Every ceremony parameter arrives in the request, including the discoverable-credential, user-verification, and attestation requirements mera's [security properties](/concepts/security-model/) rest on. A client forwards the request to the platform and reports what came back, so it needs to know none of that policy to run the ceremony mera asked for.

Binary values cross in both directions as `Uint8Array`: challenges, PRF salts, the user handle, and credential IDs. mera encodes the credential IDs it hands its own callers as canonical unpadded base64url, so that encoding holds by construction rather than by a check on the way back.

`createCredential` runs one creation ceremony. An authenticator that evaluates PRF only on assertion returns no `prfOutput`, and mera falls back to an assertion through the same client, which shows a second prompt. A result with neither `prfOutput` nor `prfEnabled` fails rather than running that fallback.

`getCredential` runs one assertion ceremony, restricted to `allowCredential` when the request carries one and open to any discoverable credential for `rpId` when it does not.

A PRF output that is not 32 bytes fails with [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable).

Anything a client throws surfaces as [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed) with the original error as its `cause`.

## browserWebAuthnClient

The default client. `createCredential` calls `navigator.credentials.create()` and `getCredential` calls `navigator.credentials.get()`, both with the PRF extension. It normalizes the shapes browsers return: PRF results arrive as an `ArrayBuffer`, an `ArrayBufferView`, or a plain array of byte values depending on the provider.

Wrapping it composes with the default rather than replacing it, which is one way to log or instrument ceremonies:

```ts
import { browserWebAuthnClient, type WebAuthnClient } from "@category-labs/mera";

const timedClient: WebAuthnClient = {
  ...browserWebAuthnClient,
  async getCredential(request) {
    const start = performance.now();
    try {
      return await browserWebAuthnClient.getCredential(request);
    } finally {
      console.log(`assertion took ${performance.now() - start}ms`);
    }
  },
};
```

## reactNativeWebAuthnClient

The client for [react-native-passkey](https://github.com/f-23/react-native-passkey) `^3.5.0`. It lives in a separate entry point, so the root package loads no React Native code:

```ts
import { getPasskeyPrfOutput } from "@category-labs/mera";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-passkey";

const { prfOutput } = await getPasskeyPrfOutput({
  rpId: "account.example.com",
  webAuthnClient: reactNativeWebAuthnClient,
});
```

The client calls `createPlatformKey` and `getPlatformKey`. The platform-only choice prevents iOS from offering a security key, whose response carries no PRF output. Android still uses Credential Manager.

Challenges, user handles, and credential IDs cross the native bridge as base64url. The PRF salt stays a `Uint8Array`, which both platform bridges accept. Results return to mera as `Uint8Array`, and malformed PRF byte values fail with [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable).

Errors from react-native-passkey surface as the `cause` of mera's [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed). The package's `PasskeyError` type describes that cause.

## Other runtimes without a DOM

A non-browser client converts each byte field to the shape its platform bridge expects and converts results back to `Uint8Array`.

Passkey functions need `crypto.getRandomValues`. Secret-vault functions also need `crypto.subtle`. [Authenticator support](/authenticator-support/#native-apps) lists the native PRF requirements and tested combinations.

## See also

- [getPasskeyPrfOutput](/reference/get-passkey-prf-output/): the assertion that returns PRF output.
- [createPasskeyWithPrfOutput](/reference/create-passkey-with-prf-output/): the creation ceremony and its fallback assertion.
- [Passkeys and the PRF extension](/concepts/passkeys-and-prf/): ceremonies, prompts, and user verification.
