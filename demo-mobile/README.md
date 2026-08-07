# mera mobile demo

An Expo app that shares accounts with the [web demo](../demo) in both
directions: create a passkey here and the web app reaches the same account, or
create one there and sign in here.

Nothing is copied between the two apps. The address is a function of the passkey:
one PRF output becomes a BIP-39 mnemonic, the mnemonic becomes a seed, and the
seed derives the key at `m/44'/60'/0'/0/0`. Both apps run that derivation, so
naming the same relying party is all it takes to reach the same address.

The demo covers the web app's passkey mode only. Vault mode works here too, since
a vault is bytes the caller stores wherever it likes, `expo-secure-store` as
readily as `localStorage`, and it needs `crypto.subtle` for HKDF and AES-GCM,
which Hermes lacks and `react-native-quick-crypto` supplies. What does not cross
over is a vault the web app already wrote: that ciphertext sits in one browser's
storage, so reaching it from a phone means syncing it, not deriving it.

The app screen creates a passkey or signs in with one, shows the address and its
balance on the demo network, signs a message without a second prompt, reveals the
recovery phrase behind a fresh ceremony, locks, and clears the device cache
described below.

Creating twice adds a second passkey and so a second account, which is what the
web demo does too: mera draws a fresh user handle per call, so a creation adds a
credential rather than replacing one. Each entry carries its creation time, which
Android shows in the picker and iOS does not, since react-native-passkey's
platform registration request takes only a user name.

## What makes it work

mera runs its WebAuthn ceremonies through a
[`WebAuthnClient`](https://mera.category.xyz/reference/web-authn-client/), which
defaults to `navigator.credentials`. React Native has no such object, so
[src/passkeyClient.ts](src/passkeyClient.ts) implements the same two ceremonies
over [react-native-passkey](https://github.com/f-23/react-native-passkey): iOS
AuthenticationServices, Android Credential Manager. It is an encoding layer, and
every ceremony parameter still comes from mera.

The encoding is per field, not one rule. Challenges, user handles, and credential
IDs cross as base64url; the PRF salt crosses as bytes, because
react-native-passkey rewrites binary fields to base64url only on Android, and
iOS decodes the salt only from the index-keyed object a `Uint8Array` stringifies
to. Both ceremonies also take the platform-key entry points, since a security key
would answer with no PRF output on iOS.

The passkey APIs need only `crypto.getRandomValues`, which
[src/polyfills.ts](src/polyfills.ts) installs from `expo-crypto`.

Creation runs one ceremony on iOS 18, which evaluates PRF while it writes the
credential. An authenticator that enables PRF without returning an output makes
mera assert the new passkey for one, so the create shows a second prompt. A
provider without PRF fails after the passkey is written: the entry stays in the
authenticator and has to be deleted there. Signing in is confirmed on a Pixel 9a
with 1Password, reaching the account the web demo created; no device has run
creation, and no device has run either ceremony on iOS.

## The device cache

The first sign-in runs a ceremony. [src/prfCache.ts](src/prfCache.ts) then keeps
the PRF output in `expo-secure-store`, encrypted by a key the platform keystore
holds and this app never sees, readable only after a biometric or
device-credential check and only on this device. Later sign-ins skip the passkey.
Creating an account fills the same item, and creating another repoints it, so
**Sign in** reaches the newest account and an earlier one takes **Clear device
cache** and a trip through the authenticator's picker.

It is a cache and not storage, which is what makes it safe to keep. The address is
a function of the passkey, so clearing the item, enrolling a new fingerprint, or
picking up another phone all fall back to a ceremony and arrive at the same
account. That also lets the read path be forgiving: anything that fails counts as
a miss, a dismissed prompt and a malformed item alike. **Clear device cache** on
the screen forces the fallback so you can watch it happen.

Deleting the app is not one of those on iOS. Android drops the item on uninstall,
but iOS keeps a keychain item written under the same bundle ID, so a reinstall
can sign in without a ceremony. **Clear device cache** is what removes it.

Gating the item costs a prompt, and [where that prompt
lands](https://docs.expo.dev/versions/latest/sdk/securestore/) differs: Android
asks on every operation, iOS only on reading or updating an item and never on
creating one. So a first sign-in shows two prompts on Android, the passkey and
then a biometric check to write the item, and one on iOS. A phone with no
biometric or device credential enrolled cannot hold the item at all, so it runs a
ceremony every time.

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
