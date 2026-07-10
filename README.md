# mera

Passkey-backed signing sessions for accounts across chains.

mera gets stable, authenticator-bound entropy from a WebAuthn passkey. The browser's WebAuthn PRF extension gives the library 32 bytes per ceremony. Apps can feed those bytes into their own account derivation, or wrap an app-held secret such as a recovery phrase or private key into a passkey-encrypted vault.

The result is ordinary signing material for the app to use. No smart-account deployment or custom on-chain verifier is required.

- Signing sessions for secp256k1 and Ed25519, address helpers for EVM and Solana.
- One user-verification prompt can cover a session of signatures.
- Key derivation stays app-owned; mera hands the app entropy.
- Cross-platform: a native iOS or Android app tied to the same domain can use the same passkey and derive the same accounts.

## Modes

**Derived.** mera uses its fixed deterministic salt to reproduce the same PRF output for the same PRF-capable passkey and `rpId`. The app derives account keys from that output with its chosen scheme. The demo uses BIP-39/BIP-32 for secp256k1 and SLIP-0010 for Ed25519.

Cross-device use requires the passkey to be available on the new device. This mode fits stateless account access across devices.

Derived mode stores no app-owned secret to recover. The account may be unrecoverable if the passkey is deleted, not synced, tied to a lost provider account, or unavailable under the app's `rpId` after a domain migration. Recovery then depends on an app-provided export, import, or backup path.

**Wrapped.** An AES-256-GCM blob holds one secret: a recovery phrase, a private key, or any bytes. The passkey ceremony produces the key material needed to decrypt it. The blob can live in `localStorage`, a backend, or a sync service. This mode fits existing-account imports.

## Install

```sh
npm install @category-labs/mera
```

The `@category-labs/mera/viem` entry point requires `viem` (^2.28.0) as an optional peer dependency; the root entry point does not use it.

## Quick example

A derived-mode example: one passkey ceremony, then app-owned BIP-39/BIP-32 key derivation with `@scure/bip32` and `@scure/bip39`, as in the demo.

```ts
import {
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
} from "@category-labs/mera"
import { HDKey } from "@scure/bip32"
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

const rpId = "account.example.com"

const { prfOutput } = await getPasskeyPrfOutput({ rpId })

// App-owned derivation: the PRF output is BIP-39 entropy, so the same phrase
// imported into a standard wallet reproduces the same account.
const mnemonic = entropyToMnemonic(prfOutput, wordlist)
const seed = mnemonicToSeedSync(mnemonic)
const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0")
if (node.privateKey === null) throw new Error("derivation produced no key")

const session = createSecp256k1SigningSession({
  // Copy out of the HDKey so the signing session can own and later zero it.
  consumePrivateKey: new Uint8Array(node.privateKey),
})
const address = getEvmAddress(session.publicKey)
```

Reusing one PRF output unchanged for unrelated purposes (key derivation and app-data encryption, say) links those secrets. Use a different PRF salt per purpose, or split one output with a purpose-labeled KDF.

Derived flows use mera's fixed v1 salt internally. Wrapped-mode vault functions generate and store a fresh random salt for each secret.

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

On desktop Chrome, only passkeys saved to Google Password Manager carry PRF. The local Chrome profile authenticator does not implement the CTAP2 `hmac-secret` extension, so a passkey created there returns `prf.enabled: false`.

Chrome may create the passkey in the local profile instead of Google Password Manager when its "Offer to save passwords and passkeys" setting is off, or when a third-party password-manager extension intercepts WebAuthn and relays the browser fallback ceremony.

For the broader PRF compatibility matrix, see Corbado's [Passkeys & WebAuthn PRF for End-to-End Encryption](https://www.corbado.com/blog/passkeys-prf-webauthn).

## API reference

Names only; editor hover shows the full JSDoc.

- **Passkey ceremonies**: `createPasskey`, `createPasskeyWithPrfOutput`, `getPasskeyPrfOutput`
- **Deterministic PRF salt**: `getDeterministicPrfSaltV1`
- **Signing sessions**: `createSecp256k1SigningSession`, `createEd25519SigningSession`
- **Secret vault workflows**: `createSecretVaultWithNewPasskey`, `createSecretVaultWithExistingPasskey`, `unwrapSecretVaultWithPasskey`
- **Secret vault primitives**: `createSecretVault`, `unwrapSecretVault`, `parseSecretVault`, `getSecretVaultPrfOutput`
- **Chain addresses**: `getEvmAddress`, `isEvmAddress`, `getSolanaAddress`, `isSolanaAddress`
- **viem adapter** (`@category-labs/mera/viem`): `toViemAccount`
- **Errors**: `MeraError`, `isMeraError`, `MeraErrorCode`

## Detailed docs

Secret-vault flows, demo HD derivation recipes (BIP-39/BIP-32, SLIP-0010), the secret vault format, and the viem adapter live in the developer documentation.

## Security

A compromised JavaScript runtime can observe key material during app-owned derivation or import, and can sign with an active session until `session.lock()`. Recovery export should be handled as a separate app-owned flow that reruns WebAuthn PRF or unwraps a vault with fresh user verification.

Recovery phrases become JavaScript strings when displayed or exported. Unlike `Uint8Array` buffers, strings cannot be zeroed in place; apps can only drop references and keep their lifetime short.

mera zeroes owned byte buffers where possible, but host apps should treat revealed recovery phrases as high-risk UI state.

**Dependency scope.** Runtime dependencies are `@noble/*` and `@scure/*` only. The root `devDependencies` (build/test tooling) and the unpublished `demo/` app never ship to library consumers.

## Development

```sh
npm ci
npm test            # build, typecheck the tests, run the full Playwright suite
npm run test:e2e    # end-to-end passkey ceremonies only (virtual authenticator)
npm run check       # Biome lint + format
npm run check:pack  # verify the publishable tarball
```

The docs site is a standalone package; see [docs/README.md](./docs/README.md).

## License

Licensed under either of [Apache License](./LICENSE-APACHE), Version
2.0 or [MIT License](./LICENSE-MIT) at your option.
