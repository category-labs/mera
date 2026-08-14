# mera React Native trading demo

An Expo app with the same paper-trading market as the web demo and the Chrome
extension: a fictional stock on a private demo network, traded from a
passkey-derived account.

The app can:

- show the live NAD market with no account;
- create a passkey here or sign in with one from the web demo, deriving the
  same address;
- fund the account with play money from the demo network's faucet;
- buy and sell shares, signing silently with the session key;
- track the position's profit and loss;
- store the account on the device and unlock it with a biometric check
  instead of a passkey prompt;
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
npm ci
npm run build
npm run prebuild -w demos/mobile
npm run ios -w demos/mobile
```

Run `npm run android -w demos/mobile` instead for Android.

The root install links the local library workspace. Rebuild the library after
changing it:

```bash
npm run build
```

## Account storage and locking

After creating or signing in with a passkey, the demo saves the PRF output in
the device's secure storage, gated by a biometric or device credential, and
the account's address beside it, ungated. [src/storage.ts](src/storage.ts)
contains the storage code.

A launch reads only the ungated address, so the market and the balances render
with no prompt. The first trade asks for the biometric or device credential,
reads the stored PRF output, and derives the signing key; no passkey prompt
appears.

**Lock** ends the signing session but keeps the stored account. **Sign out**
ends the session and removes the stored account. It does not delete the
passkey from the passkey provider, and the position's cost basis stays for the
next sign-in. **Export account** asks for the passkey again and shows the
recovery phrase.

SecureStore data may remain after an iOS app is removed and installed again.
Android removes it when the app is removed.
