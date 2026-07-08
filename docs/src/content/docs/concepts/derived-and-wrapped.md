---
title: Derived and wrapped modes
description: Two ways to use PRF output, with different storage and recovery trade-offs.
---

Both modes start from the same ceremony and its 32 bytes of PRF output. Derived mode turns the bytes into accounts; wrapped mode turns them into the key that guards one stored secret.

## Derived

With mera's [fixed deterministic salt](/reference/get-deterministic-prf-salt-v1/), the same passkey and relying party produce the same PRF output on every ceremony. The app feeds that output into a derivation scheme of its choosing; [Derive accounts from one passkey](/recipes/derive-accounts/) shows one built on common HD standards.

There is no stored secret. Sign-in on a new device is the same ceremony as on the old one and produces the same accounts, provided the passkey is there: state lives in the passkey and nowhere else.

The account may be unrecoverable if the passkey is deleted, not synced, tied to a lost provider account, or unavailable under the app's rpId after a domain migration. Recovery then depends on an app-provided export, import, or backup path, taken while the passkey still works. [Reveal a recovery phrase](/recipes/reveal-a-recovery-phrase/) shows one such path.

## Wrapped

An AES-256-GCM vault holds one secret: a recovery phrase, a private key, any bytes. The ceremony's PRF output, evaluated against a fresh random salt stored alongside the vault, produces the key material that decrypts it. The vault itself is ordinary JSON and can live in `localStorage`, on a backend, or in a sync service.

The secret exists independently of the passkey: an account that predates it can be imported by wrapping its recovery phrase or private key, and a copy of that secret may live somewhere else entirely. Custody of the vault is an app design question; whoever holds it holds ciphertext, and only the passkey ceremony turns it back into the secret.

## Choosing

- **Where state lives.** Derived keeps it in the passkey. Wrapped keeps it in a blob the app has to store somewhere.
- **Existing accounts.** Wrapped can hold a secret that predates the passkey. Derived only produces accounts rooted in the passkey itself.
- **Losing the passkey.** Both modes lose access through mera. A derived account recovers only through an export taken beforehand; a wrapped secret recovers wherever another copy of it survives.
- **Salts.** Derived uses the one fixed deterministic salt. Wrapped stores a fresh random salt per vault; reusing one across secrets shares the wrapping key, and the [security model](/concepts/security-model/#one-output-one-purpose) explains the consequence.

## See also

- [Derive accounts from one passkey](/recipes/derive-accounts/)
- [Wrap a recovery phrase](/recipes/wrap-a-recovery-phrase/)
- [Secret vault format](/reference/secret-vault-format/)
