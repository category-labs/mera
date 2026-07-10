---
title: Derived accounts and secret vaults
description: Two ways to use PRF output, with different storage and recovery trade-offs.
---

Both patterns start from the same ceremony and its 32 bytes of PRF output. The derived pattern turns the bytes into accounts; the secret-vault pattern turns them into the key that decrypts one stored secret.

## Derived

When the PRF salt is omitted, mera uses its [fixed v1 salt](/reference/get-deterministic-prf-salt-v1/). The same passkey and relying party produce the same PRF output on every ceremony. The app feeds that output into a derivation scheme of its choosing; [Derive accounts from one passkey](/recipes/derive-accounts/) shows one built on common HD standards.

There is no stored secret; all state lives in the passkey. Once the passkey has synced to a new device, sign-in there is the same ceremony and produces the same accounts.

The account may be unrecoverable if the passkey is deleted, not synced, tied to a lost provider account, or unavailable under the app's rpId after a domain migration. Recovery then depends on an app-provided export, import, or backup path, taken while the passkey still works.

## Secret vault

An AES-256-GCM vault holds one secret: a recovery phrase, a private key, any bytes. Secret-vault functions evaluate the passkey against a fresh random salt for each secret and store that salt in the vault. The resulting PRF output produces the key material that decrypts it. The vault itself is ordinary JSON and can live in `localStorage`, on a backend, or in a sync service.

The secret exists independently of the passkey: an account that predates it can be imported by encrypting its recovery phrase or private key, and a copy of that secret may live somewhere else entirely. Custody of the vault is an app design question. The holder has only ciphertext; decrypting it requires the passkey ceremony.

## Choosing

- **Where state lives.** Derived accounts keep it in the passkey. Secret vaults keep it in a blob the app has to store somewhere.
- **Existing accounts.** A secret vault can hold a secret that predates the passkey. Derived accounts are rooted in the passkey itself.
- **Losing the passkey.** Both patterns lose access through mera. A derived account is recoverable only through an export taken beforehand; a vault-backed secret is recoverable from any other copy of it.
- **Salts.** Derived calls omit the salt and use mera's fixed v1 value. Secret-vault functions generate and store a fresh random salt per vault; secrets encrypted using a reused salt share one encryption key, so exposing that key exposes all of them ([one output, one purpose](/concepts/security-model/#one-output-one-purpose)).

## See also

- [Derive accounts from one passkey](/recipes/derive-accounts/)
- [Use an existing secret](/recipes/use-an-existing-secret/)
- [Secret vault format](/reference/secret-vault-format/)
