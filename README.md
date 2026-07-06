# mera

Passkey-backed signing for multichain accounts — one biometric, many chains.

mera turns a WebAuthn passkey into stable, authenticator-bound entropy for wallet apps. The browser's WebAuthn PRF extension gives mera 32 bytes per ceremony; apps can feed those bytes into their chosen wallet derivation scheme or wrap an app-held secret — a recovery phrase, a private key — into a passkey-encrypted vault. No smart-account deploys, no custom on-chain verifier programs.

- One passkey, multiple chains (EVM + Solana today).
- One biometric per session, not per transaction.
- Wallet derivation stays app-owned — mera hands the app entropy, not a derivation path.

## Modes

**Derived.** Mera uses its fixed deterministic salt to reproduce the same PRF output for the same PRF-capable passkey and `rpId`; cross-device use requires that passkey to be available on the new device. The app derives wallet keys from that output using its chosen scheme — the demo uses BIP-39/BIP-32 for secp256k1 and SLIP-0010 for Ed25519. Best for stateless wallet access across devices.

**Wrapped.** An AES-256-GCM blob holds one secret — a recovery phrase, a private key, any bytes; only the passkey can unlock it. The blob can live in `localStorage`, a backend, or a sync service. Best for hot-wallet UX, returning users who sign many transactions per session, and importing an existing wallet.

Derived mode stores no app-owned secret to recover. If the passkey is deleted, not synced, tied to a lost provider account, or unavailable under the app's `rpId` after a domain migration, the account may be unrecoverable unless the app offers export, import, or another backup path.

## Install

```sh
npm install @category-labs/mera
```

## Quick example

A derived-mode skeleton: one passkey ceremony, then app-owned wallet derivation.

```ts
import {
  createSecp256k1SigningSession,
  getDeterministicPrfSaltV1,
  getEvmAddress,
  getPasskeyPrfOutput,
} from "@category-labs/mera"
import { deriveWalletPrivateKey } from "./wallet-derivation"

const rpId = "account.example.com"

const prfSalt = getDeterministicPrfSaltV1()
const { prfOutput } = await getPasskeyPrfOutput({ rpId, prfSalt })

const privateKey = deriveWalletPrivateKey({
  entropy: prfOutput,
  path: "m/44'/60'/0'/0/0",
})

const session = createSecp256k1SigningSession({ consumePrivateKey: privateKey })
const address = getEvmAddress(session.publicKey)
```

Reusing one PRF output unchanged for unrelated purposes — wallet derivation and app-data encryption, say — links those secrets. Use a different PRF salt per purpose, or split one output with a purpose-labeled KDF.

Derived/reproducible-wallet flows pass a stable PRF salt such as `getDeterministicPrfSaltV1()`. Wrapped flows pass fresh random salt bytes.

## Supported authenticators

mera requires the WebAuthn PRF extension, discoverable credentials, and user verification. If the browser/OS/authenticator combination can't deliver PRF, the library throws `PRF_UNAVAILABLE`.

`✓` means a live PRF create + get cycle has been confirmed end-to-end; `Not supported` means a live test did not return PRF.

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

Names only; editor hover shows the full JSDoc.

- **Passkey ceremonies** — `createPasskey`, `createPasskeyWithPrfOutput`, `getPasskeyPrfOutput`
- **Deterministic PRF salt** — `getDeterministicPrfSaltV1`
- **Signing sessions** — `createSecp256k1SigningSession`, `createEd25519SigningSession`
- **Secret vault** — `createSecretVault`, `unwrapSecretVault`, `parseSecretVault`, `getSecretVaultPrfOutput`
- **Chain addresses** — `getEvmAddress`, `isEvmAddress`, `getSolanaAddress`, `isSolanaAddress`
- **Errors** — `MeraError`, `isMeraError`, `MeraErrorCode`

## Detailed docs

Secret-vault flows, demo HD derivation recipes (BIP-39/BIP-32, SLIP-0010), the secret vault format, and the viem adapter live in the developer documentation.

## Security

A compromised JavaScript runtime can observe key material during app-owned derivation or import, and can sign with an unlocked session until `session.lock()`. Recovery export should be handled as a separate app-owned flow that reruns WebAuthn PRF or unwraps a vault with fresh user verification.

Recovery phrases become JavaScript strings when displayed or exported. Unlike `Uint8Array` buffers, strings cannot be zeroed in place; apps can only drop references and keep their lifetime short. Mera zeroes owned byte buffers where possible, but host apps should treat revealed recovery phrases as high-risk UI state.

**Dependency scope.** Runtime dependencies are `@noble/*` and `@scure/*` only. The root `devDependencies` (build/test tooling) and the unpublished `demo/` app never ship to library consumers.

## Development

```sh
npm ci
npm test            # build, typecheck the tests, run the full Playwright suite
npm run test:e2e    # end-to-end passkey ceremonies only (virtual authenticator)
npm run check       # Biome lint + format
npm run check:pack  # verify the publishable tarball
```

## License

Licensed under either of [Apache License](./LICENSE-APACHE), Version
2.0 or [MIT License](./LICENSE-MIT) at your option.
