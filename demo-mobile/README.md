# mera mobile demo

An Expo app that shares accounts with the [web demo](../demo) in both
directions: create a passkey here and the web app reaches the same account, or
create one there and sign in here.

Both apps turn the same PRF output into a BIP-39 mnemonic, then derive the key at
`m/44'/60'/0'/0/0`. The passkey and relying party therefore produce the same
address in each app.

The app covers passkey mode. It creates or opens an account, signs a message,
reveals the recovery phrase behind a fresh ceremony, locks the signing session,
and manages the device cache described below. Creating twice adds two passkeys
and accounts because mera generates a fresh user handle for each creation.

## What makes it work

mera runs its WebAuthn ceremonies through a
[`WebAuthnClient`](https://mera.category.xyz/reference/web-authn-client/), which
defaults to `navigator.credentials`. React Native has no such object, so
[src/passkeyClient.ts](src/passkeyClient.ts) implements the same two ceremonies
over [react-native-passkey](https://github.com/f-23/react-native-passkey): iOS
AuthenticationServices and Android Credential Manager. The adapter converts
each byte field to the shape the native module expects and uses platform-key
entry points so an iOS security key cannot answer without PRF output.

The passkey APIs need only `crypto.getRandomValues`, which
[src/polyfills.ts](src/polyfills.ts) installs from `expo-crypto`.

An authenticator that enables PRF without returning an output during creation
causes a fallback assertion and a second prompt. Signing in is confirmed on a
Pixel 9a with 1Password against an account from the web demo. Native creation and
both iOS ceremonies remain untested on a device.

## The device cache

The first sign-in runs a ceremony. [src/prfCache.ts](src/prfCache.ts) then keeps
the PRF output in `expo-secure-store`, encrypted by a key the platform keystore
holds. Reading it requires a biometric or device credential, and the item stays
on that device. Later sign-ins can skip the passkey ceremony.

Any read failure counts as a cache miss and starts a ceremony. Clearing the item,
changing enrolled biometrics, or moving to another phone therefore keeps the
passkey as the source of the account. Creating another account replaces the one
cached result; **Clear device cache** opens the authenticator picker on the next
sign-in.

Deleting the app is not one of those on iOS. Android drops the item on uninstall,
but iOS keeps a keychain item written under the same bundle ID, so a reinstall
can sign in without a ceremony. **Clear device cache** is what removes it.

The [authentication prompt](https://docs.expo.dev/versions/latest/sdk/securestore/)
differs by platform. Android asks on every operation. iOS asks when reading or
updating an item. A device with no biometric or device credential cannot cache
the result.

Revealing the recovery phrase still runs its own ceremony. That phrase reproduces
every account, so it is worth a passkey even on a device that already unlocked
one.

## Requirements

- Node 24, Xcode for iOS, or Android Studio for Android.
- A physical iPhone on iOS 18 or newer, signed into the iCloud account that holds
  the passkey. PRF arrived on iOS 18, and the simulator has no shared iCloud
  Keychain. On Android, a provider that supplies PRF through Credential Manager:
  Google Password Manager and 1Password both do.
- Control of the host the passkeys belong to, because it has to serve the files
  below.

## Serve the association files

Both platforms hand an app a passkey only when the domain names the app back.
The demo's relying party is `mera-demo.up.railway.app` (see
[app.config.ts](app.config.ts)); point the app at your own deployment with
`MERA_RP_ID`.

1. Fill in [well-known/apple-app-site-association](well-known/apple-app-site-association)
   with your Apple team ID, and
   [well-known/assetlinks.json](well-known/assetlinks.json) with the SHA-256
   fingerprint of every key you sign with. For a local Android build that is the
   debug key:

   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
   ```

2. Serve both files from the relying party host, unencrypted JSON, no redirects:
   `https://<host>/.well-known/apple-app-site-association` and
   `https://<host>/.well-known/assetlinks.json`. Copying them into
   `demo/public/.well-known/` puts them in the web demo's build output. Check
   the deployment actually serves them, since some static servers refuse
   directories that start with a dot:

   ```bash
   curl -i https://mera-demo.up.railway.app/.well-known/assetlinks.json
   ```

Apple caches its copy through a CDN, so a change can take a few minutes to reach
a device.

## Run it

```bash
npm run build
npm install --prefix demo-mobile
```

The app bundles a packed copy of the library rather than a symlink, and
installing does not build it, so `dist/` has to exist first. After changing the
library, `npm run sync-library --prefix demo-mobile` rebuilds it and copies it
in.

```bash
npm run prebuild --prefix demo-mobile
```

This writes the `ios/` and `android/` projects from
[app.config.ts](app.config.ts), including the associated domain entitlement.
Then, with a device connected:

```bash
npm run ios --prefix demo-mobile
```

```bash
npm run android --prefix demo-mobile
```

Expo Go cannot run this app: passkeys need native code that only a build of your
own project carries.

## Prove the reuse

Web to phone:

1. Open [the web demo](https://mera-demo.up.railway.app) on any machine, pick
   passkey mode, and create an account. Note the address.
2. Sign in on the phone with the same passkey provider, and compare.

Phone to web:

1. Tap **Create account** on the phone. Note the address.
2. Sign in on the web demo and pick that passkey. It appears wherever the
   provider syncs it, so a browser signed into the same account offers it.

Either way the addresses match, or something in the chain above is wrong: a
different relying party host, a passkey that never synced across, or a provider
without PRF. **Reveal recovery phrase** on both is the stronger check: the same
24 words, which import into any HD wallet and derive the same address a third
time.
