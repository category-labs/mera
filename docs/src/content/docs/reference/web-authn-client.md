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

## Runtimes without a DOM

React Native reaches passkeys through AuthenticationServices on iOS and Credential Manager on Android, so a client for them is an encoding layer. The bridge decides how each binary field is encoded, and it need not decide them alike: the mobile demo's client sends challenges, user handles, and credential IDs as base64url, and the PRF salt as raw bytes, because that is what its native module reads on both platforms. Check each field against the bridge rather than assuming one rule. [demo-mobile/src/passkeyClient.ts](https://github.com/category-labs/mera/blob/main/demo-mobile/src/passkeyClient.ts) is a worked example.

Two more things differ off the web. Hermes provides no Web Crypto, so `crypto.getRandomValues` has to be installed before the first ceremony, from `expo-crypto` or another CSPRNG; the [secret vault](/concepts/secret-vaults/) APIs additionally need `crypto.subtle` for HKDF and AES-GCM, which a shim such as `react-native-quick-crypto` supplies, and the passkey APIs do not need it at all. PRF itself needs iOS 18 or newer, or an Android provider that supports it ([Authenticator support](/authenticator-support/#native-apps)).

## See also

- [getPasskeyPrfOutput](/reference/get-passkey-prf-output/): the assertion that returns PRF output.
- [createPasskeyWithPrfOutput](/reference/create-passkey-with-prf-output/): the creation ceremony and its fallback assertion.
- [Passkeys and the PRF extension](/concepts/passkeys-and-prf/): ceremonies, prompts, and user verification.
