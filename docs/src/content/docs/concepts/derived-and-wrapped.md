---
title: Derived and wrapped modes
description: Two ways to use PRF output, with different storage and recovery stories.
---

Both modes start the same way: a passkey ceremony returns 32 bytes of PRF output. They differ in what those bytes become. Derived mode turns them into accounts. Wrapped mode turns them into the key that guards one stored secret.

## Derived

With mera's [fixed deterministic salt](/reference/get-deterministic-prf-salt-v1/), the same passkey and relying party produce the same PRF output on every ceremony. The app feeds that output into a derivation scheme of its choosing; the demo uses BIP-39/BIP-32 for secp256k1 keys and SLIP-0010 for Ed25519.

There is no stored secret. Sign-in on a new device is the same ceremony as on the old one, and it produces the same accounts, provided the passkey is there. That is the mode's defining trade: state lives in the passkey and nowhere else.

The loss cases follow directly. The account may be unrecoverable if the passkey is deleted, not synced, tied to a lost provider account, or unavailable under the app's rpId after a domain migration. Recovery then depends on an app-provided export, import, or backup path, taken while the passkey still works. [Reveal a recovery phrase](/recipes/reveal-a-recovery-phrase/) shows one such path.

## Wrapped

An AES-256-GCM vault holds one secret: a recovery phrase, a private key, any bytes. The ceremony's PRF output, evaluated against a fresh random salt stored alongside the vault, produces the key material that decrypts it. The vault itself is ordinary JSON and can live in `localStorage`, on a backend, or in a sync service.

Here the secret exists independently of the passkey. An account that predates the passkey can be imported by wrapping its recovery phrase or private key, and the person who holds that secret may also keep it somewhere else entirely. Custody of the vault blob becomes an app design question: whoever holds it holds ciphertext, and the passkey ceremony is what turns it back into the secret.

## Choosing

- **Where state lives.** Derived keeps it in the passkey. Wrapped keeps it in a blob the app has to store somewhere.
- **Existing accounts.** Wrapped can hold a secret that predates the passkey. Derived only produces accounts rooted in the passkey itself.
- **Losing the passkey.** Both modes lose access through mera. A derived account recovers only through an export taken beforehand; a wrapped secret recovers wherever another copy of it survives.
- **Salts.** Derived uses the one fixed deterministic salt. Wrapped stores a fresh random salt per vault, and reusing one across secrets is a real mistake; the [security model](/concepts/security-model/) explains why.

## See also

- [Derive accounts from one passkey](/recipes/derive-accounts/)
- [Wrap a recovery phrase](/recipes/wrap-a-recovery-phrase/)
- [Secret vault format](/reference/secret-vault-format/)
