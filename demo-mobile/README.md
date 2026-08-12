# mera React Native passkey demo

An Expo app that shows how to use mera passkeys on iOS and Android.

The app can:

- create a passkey;
- sign in with a passkey;
- derive an EVM account from the passkey's PRF output;
- keep the signing key in a session;
- store the account on the device;
- reveal the recovery phrase after another passkey request.

## Requirements

- Node.js 24 or newer.
- Xcode for iOS or Android Studio for Android.
- An iOS 18 or newer device or simulator, or an Android device or emulator with
  a passkey provider that supports PRF.
- An HTTPS host for the passkey domain files.

## Configure passkeys

### Choose the passkey domain

The relying party ID is the host the passkeys belong to. It must match the host
that serves the files below.

The demo defaults to `mera.category.xyz`. Set `MERA_RP_ID` to use another host:

```bash
export MERA_RP_ID=passkeys.example.com
```

Use a host name without `https://` or a path.

The app ID is `xyz.category.mera.demo`. Change `applicationId` in
[app.config.ts](app.config.ts) if the app uses another ID.

### iOS

1. Open
   [well-known/apple-app-site-association](well-known/apple-app-site-association).
2. Replace `TEAM_ID` with the Apple team ID.
3. Replace `xyz.category.mera.demo` if the bundle ID changed.
4. Serve the file at:

   ```text
   https://<rpId>/.well-known/apple-app-site-association
   ```

[app.config.ts](app.config.ts) adds `webcredentials:<rpId>` to the app's
Associated Domains when Expo creates the iOS project.

### Android

1. Open [well-known/assetlinks.json](well-known/assetlinks.json).
2. Replace `xyz.category.mera.demo` if the Android package changed.
3. Replace `SHA256_FINGERPRINT` with each Android signing certificate's SHA-256
   fingerprint.
4. Serve the file at:

   ```text
   https://<rpId>/.well-known/assetlinks.json
   ```

For a local Android build, print the debug certificate with:

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
```

Both files must be public over HTTPS and return JSON without a redirect.

## Run the app

From the repository root:

```bash
npm run build
npm ci --prefix demo-mobile
cd demo-mobile
npm run prebuild
npm run ios
```

Run `npm run android` instead of `npm run ios` for Android.

The demo installs a packed copy of the library. After changing the library, run
this command from `demo-mobile`:

```bash
npm run sync-library
```

## Account storage and locking

After creating or signing in with a passkey, the demo saves the credential ID
and PRF output in the device's secure storage. [src/prfStore.ts](src/prfStore.ts)
contains the storage code.

The app can then restore the account without asking for the passkey again.
Reading the stored value requires a biometric or device credential.

**Lock** ends the signing session but keeps the stored value. **Clear stored
account** ends the session and removes the stored value. It does not delete the
passkey from the passkey provider. **Reveal recovery phrase** asks for the
passkey again.

SecureStore data may remain after an iOS app is removed and installed again.
Android removes it when the app is removed.
