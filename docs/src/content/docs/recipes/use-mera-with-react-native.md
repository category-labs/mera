---
title: Use mera with React Native
description: Configure mera passkeys in a React Native app.
---

## Requirements

- An HTTPS host for the relying party ID.
- `crypto.getRandomValues`. Hermes does not provide it, so Hermes apps need a polyfill.

## Install the packages

```sh
npm install @category-labs/mera react-native-passkey
```

## Example polyfill

This Expo example uses `expo-crypto`:

```sh
npx expo install expo-crypto
```

```ts
import { getRandomValues } from "expo-crypto";

if (typeof globalThis.crypto?.getRandomValues !== "function") {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { ...globalThis.crypto, getRandomValues },
  });
}
```

Load the polyfill before any code that imports mera:

```ts
// @filename: src/polyfills.ts
import { getRandomValues } from "expo-crypto";

if (typeof globalThis.crypto?.getRandomValues !== "function") {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { ...globalThis.crypto, getRandomValues },
  });
}

// @filename: index.ts
// ---cut---
import "./src/polyfills";
```

## Link the app to the relying party domain

The relying party ID is the host the passkeys belong to. Use a host name without `https://` or a path. The host must list the app in the platform file below.

### iOS

Serve this JSON from `https://account.example.com/.well-known/apple-app-site-association`:

```json
{
  "webcredentials": {
    "apps": ["TEAM_ID.com.example.app"]
  }
}
```

Replace `TEAM_ID` with the Apple team ID and `com.example.app` with the bundle ID. Add this value under Associated Domains in Xcode:

```text
webcredentials:account.example.com
```

### Android

Serve this JSON from `https://account.example.com/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.get_login_creds"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.example.app",
      "sha256_cert_fingerprints": ["SHA256_FINGERPRINT"]
    }
  }
]
```

Replace the package name and fingerprint with those of the Android app. Include every certificate used to sign the app. For a local build, print the debug certificate with:

```sh
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
```

Both files must be public over HTTPS and return JSON without a redirect.

## Use the React Native WebAuthn client

`reactNativeWebAuthnClient` uses the iOS and Android API bindings from `react-native-passkey`. Pass it to each mera function that uses a passkey:

```ts
import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
} from "@category-labs/mera";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";

const rpId = "account.example.com";

const created = await createPasskeyWithPrfOutput({
  rp: { id: rpId, name: "Example" },
  user: { name: "account@example.com", displayName: "Example account" },
  webAuthnClient: reactNativeWebAuthnClient,
});

const signedIn = await getPasskeyPrfOutput({
  rpId,
  webAuthnClient: reactNativeWebAuthnClient,
});
```

Both results contain a credential ID and PRF output. [Create passkey accounts](/recipes/create-passkey-accounts/) shows how to derive and use accounts from the PRF output.

An app can use this client or provide its own `WebAuthnClient`.

## Optional storage

A mobile app can store the credential ID and PRF output in secure device storage. It can then restore the account without another passkey request.

## See also

- [React Native mobile demo](https://github.com/category-labs/mera/tree/main/demos/mobile): a full app that stores the credential ID and PRF output in secure device storage.
- [WebAuthnClient](/reference/web-authn-client/): the client contract and React Native client errors.
- [Authenticator support](/authenticator-support/): browser and operating system support.
