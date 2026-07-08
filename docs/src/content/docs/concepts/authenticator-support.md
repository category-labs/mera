---
title: Authenticator support
description: Which authenticators deliver WebAuthn PRF, and since when.
---

mera requires three things from the authenticator stack: the WebAuthn PRF extension, discoverable credentials, and user verification.

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

## The desktop Chrome complication

On desktop Chrome, only passkeys saved to Google Password Manager carry PRF. The local Chrome profile authenticator does not implement the CTAP2 `hmac-secret` extension, so a passkey created there comes back without PRF.

Chrome may create the passkey in the local profile instead of Google Password Manager when its "Offer to save passwords and passkeys" setting is off, or when a third-party password-manager extension intercepts WebAuthn and relays the browser fallback ceremony. Either way the passkey exists but returns no PRF output, so mera cannot use it; [createPasskey](/reference/create-passkey/) documents the ordering caveat.

## See also

- [Passkeys and the PRF extension](/concepts/passkeys-and-prf/): what PRF is and why user verification is required.
- [Handle errors](/recipes/handle-errors/): turning unsupported-authenticator failures into clear guidance.
- Corbado's [Passkeys & WebAuthn PRF for End-to-End Encryption](https://www.corbado.com/blog/passkeys-prf-webauthn): the broader PRF compatibility picture beyond the combinations tested here.
