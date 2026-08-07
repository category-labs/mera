---
title: Authenticator support
description: Which authenticators deliver WebAuthn PRF, and since when.
---

mera requires three things from the authenticator stack: the [WebAuthn](https://www.w3.org/TR/webauthn-3/) PRF extension, discoverable credentials, and user verification. [Passkeys and the PRF extension](/concepts/passkeys-and-prf/) defines all three.

In the table, `✓` means a live PRF create + get cycle has been confirmed end-to-end; `Not supported` means a live test did not return PRF.

| Authenticator            | Browser                           | OS                          | Status                     | Supported since                              |
| ------------------------ | --------------------------------- | --------------------------- | -------------------------- | -------------------------------------------- |
| 1Password                | any browser with 1Password active | any                         | ✓                          | 2.26.1 beta / Android 8.10.38 beta (2024-07) |
| iCloud Keychain          | Safari                            | iOS 18+                     | ✓                          | Safari 18 / iOS 18 (2024-09)                 |
| iCloud Keychain          | Safari                            | macOS 15+                   | ✓                          | Safari 18 / macOS 15 (2024-09)               |
| iCloud Keychain          | Chrome                            | macOS 15+                   | ✓                          | Chrome 132+ (2025-01)                        |
| iCloud Keychain          | Chrome                            | iOS 18+                     | ✓                          | Safari 18 / iOS 18 (2024-09)                 |
| iCloud Keychain          | Firefox                           | macOS 15+                   | ✓                          | Firefox 139+ (2025-05)                       |
| Google Password Manager  | Chrome                            | Android                     | ✓                          | Known by 2026-06                             |
| Google Password Manager  | Chrome                            | Desktop (signed-in)         | ✓                          | Chrome 132+ (2025-01)                        |
| Chrome profile           | Chrome                            | Desktop                     | Not supported (2026-06-01) |                                              |
| Google Password Manager  | Edge                              | Android                     | ✓                          | Known by 2026-06                             |
| Windows Password Manager | Edge                              | Windows 11 25H2+            | ✓                          | Windows 11 25H2 + 2026-02 update             |
| Windows Password Manager | Chrome                            | Windows 11 25H2+            | ✓                          | Chrome 147+ (2026-04)                        |
| Windows Password Manager | Firefox 148+                      | Windows 11 25H2+            | ✓                          | Firefox 148+ (2026-02)                       |
| YubiKey 5C Nano          | Chrome                            | Desktop                     | ✓                          | Chrome 116+; YubiKey 5.2+ hmac-secret        |
| Bitwarden                | Chrome                            | Desktop                     | Not supported (2026-06-01) |                                              |
| Dashlane                 | Chrome                            | Desktop                     | Not supported (2026-06-01) |                                              |
| Proton Pass              | Chrome                            | Desktop                     | ✓                          | Latest public version (2026-06)              |

## Native apps

The table covers browsers. A native app reaches the same passkeys through the platform's own API: AuthenticationServices on iOS, which gained PRF in iOS 18, and Credential Manager on Android, where Google Password Manager and 1Password both supply it. Both hand an app a passkey only for a relying party the domain has delegated to it, through `apple-app-site-association` and `assetlinks.json`. The relying party ID decides the PRF output, so an app that names the same host as the web page derives the same accounts.

One native combination is confirmed so far: 1Password on a Pixel 9a returned PRF output for an assertion, reaching the account a browser had created on the same host (2026-08). Creation through a native API is not confirmed on any provider.

[`reactNativeWebAuthnClient`](/reference/web-authn-client/#reactnativewebauthnclient) runs those APIs through react-native-passkey. The repository's `demo-mobile` app uses it.

On cross-device sign-in, where a phone answers a ceremony started on another machine, avoid iOS 18.0 through 18.3 as the phone: Corbado reports PRF data loss there, fixed in 18.4. For mera, losing PRF output means losing the account derived from it.

## The desktop Chrome complication

On desktop Chrome, only passkeys saved to Google Password Manager carry PRF. The local profile authenticator lacks [`hmac-secret`](https://fidoalliance.org/specs/fido-v2.2-ps-20250714/fido-client-to-authenticator-protocol-v2.2-ps-20250714.html#sctn-hmac-secret-extension), the [CTAP](https://fidoalliance.org/specs/fido-v2.2-ps-20250714/fido-client-to-authenticator-protocol-v2.2-ps-20250714.html) primitive behind PRF.

Chrome may create the passkey in the local profile instead of Google Password Manager when its "Offer to save passwords and passkeys" setting is off, or when a third-party password-manager extension intercepts WebAuthn and relays the browser fallback [ceremony](/concepts/passkeys-and-prf/#ceremonies-and-prompts). Either way the passkey exists but returns no PRF output, so mera cannot use it and [createPasskeyWithPrfOutput](/reference/create-passkey-with-prf-output/) fails.

## See also

- [Passkeys and the PRF extension](/concepts/passkeys-and-prf/): what PRF is and why user verification is required.
- Corbado's [Passkeys & WebAuthn PRF for End-to-End Encryption](https://www.corbado.com/blog/passkeys-prf-webauthn): the broader PRF compatibility picture beyond the combinations tested here.
