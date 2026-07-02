# mera

Passkey-backed signing for multichain accounts — one biometric, many chains.

mera turns a WebAuthn passkey into stable, authenticator-bound entropy for wallet apps. The browser's WebAuthn PRF extension gives mera 32 bytes per ceremony; apps can feed those bytes into their chosen wallet derivation scheme (for example BIP-39/BIP-32 or SLIP-0010) or wrap an app-held secret — a recovery phrase, a private key — into a passkey-encrypted vault. No smart-account deploys, no custom on-chain verifier programs.

## What you get

- One passkey, multiple chains (EVM + Solana today).
- One biometric per session, not per transaction.
- Derived mode reproduces the same PRF output for the same PRF-capable passkey, `rpId`, and PRF salt. Cross-device use requires that passkey to be available on the new device.
- Apps can choose standard wallet derivation and offer explicit recovery-phrase export.
- Sessions are explicitly lockable; private-key bytes are zeroed on `session.lock()`.
- No silent extraction path: key export is an explicit app workflow.

## Modes

**Derived.** Stateless. Mera uses its fixed deterministic salt to reproduce the same PRF output for the same PRF-capable passkey and `rpId`; cross-device use requires that passkey to be available on the new device. The app derives wallet keys from that output using its chosen scheme. The demo uses BIP-39/BIP-32 for secp256k1 and SLIP-0010 for Ed25519. Best for "log in from anywhere."

**Wrapped.** An AES-256-GCM blob holds one secret — a recovery phrase, a private key, any bytes; only the passkey can unlock it. The blob can live in `localStorage`, a backend, or a sync service. Best for hot-wallet UX, returning users who want to sign many transactions per session, and importing an existing wallet.

Derived mode stores no app-owned secret to recover. If the passkey is deleted, not synced, tied to a lost provider account, or unavailable under the app's `rpId` after a domain migration, the account may be unrecoverable unless the app offers export, import, or another backup path.

## Install

```sh
npm install @category-labs/mera
```

## Quick example

A derived-mode skeleton: one passkey ceremony, then app-owned wallet derivation.

```ts
import {
  createDeterministicPrfSalt,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
} from "@category-labs/mera"
import { derivePrivateKeyWithYourWalletScheme } from "./wallet-derivation"

const rpId = "account.example.com"

const prfSalt = createDeterministicPrfSalt()
const { prfOutput } = await getPasskeyPrfOutput({ rpId, prfSalt })

const privateKey = derivePrivateKeyWithYourWalletScheme({
  entropy: prfOutput,
  path: "m/44'/60'/0'/0/0",
})

const session = createSecp256k1SigningSession({ consumePrivateKey: privateKey })
const address = getEvmAddress(session.publicKey)
```

Derived/reproducible-wallet flows pass a stable PRF salt such as `createDeterministicPrfSalt()`. Wrapped flows pass fresh random salt bytes.

## Supported authenticators

mera requires the WebAuthn PRF extension, discoverable credentials, and user verification. If the browser/OS/authenticator combination can't deliver PRF, the library throws `PRF_UNAVAILABLE`.

`✓` means a live PRF create + get cycle has been confirmed end-to-end; `Not supported` means a live test did not return PRF; blank means untested in this combination.

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

On desktop Chrome, only passkeys saved to Google Password Manager carry PRF. The local Chrome profile authenticator does not implement the CTAP2 `hmac-secret` extension, so a passkey created there returns `prf.enabled: false`. Creation lands on the local profile authenticator instead of Google Password Manager when Chrome's "Offer to save passwords and passkeys" setting is off, or when a third-party password-manager extension intercepts WebAuthn and relays the browser-fallback ceremony. For the broader PRF compatibility matrix, see Corbado's [Passkeys & WebAuthn PRF for End-to-End Encryption](https://www.corbado.com/blog/passkeys-prf-webauthn).

## API reference

Names only — your editor's hover surfaces the full JSDoc.

- **Passkey ceremonies** — `createPasskey`, `createPasskeyWithPrfOutput`, `getPasskeyPrfOutput`
- **Deterministic PRF salt** — `createDeterministicPrfSalt`
- **Signing sessions** — `createSecp256k1SigningSession`, `createEd25519SigningSession`
- **Secret vault** — `createSecretVault`, `unwrapSecretVault`, `parseSecretVault`, `getSecretVaultPrfOutput`
- **Chain addresses** — `getEvmAddress`, `isEvmAddress`, `getSolanaAddress`, `isSolanaAddress`
- **Errors** — `PasskeyAccountError`, `isPasskeyAccountError`, `PasskeyAccountErrorCode`

## Detailed docs

Secret-vault flows, demo HD derivation recipes (BIP-39/BIP-32, SLIP-0010), the secret vault format, and the viem adapter live in the developer documentation.

## Security

Keys are not protected once unlocked inside a compromised JavaScript runtime. Host apps should serve over HTTPS, use a strict CSP, avoid untrusted scripts, and keep unlocked sessions short-lived — call `session.lock()` as soon as you're done signing.

**Dependency scope.** The library’s shipped runtime dependency tree is the root manifest’s `dependencies` (`@noble/*`, `@scure/*`). The root `devDependencies` are build/test/lint tooling (supply-chain only), and the `demo/` app is a non-published example (`private: true`) with its own, larger dependency tree; neither set of packages ships to library consumers.

## License

Licensed under either of [Apache License](./LICENSE-APACHE), Version
2.0 or [MIT License](./LICENSE-MIT) at your option.
