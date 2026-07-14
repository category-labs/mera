---
title: Passkey accounts
description: Accounts derived from a passkey's PRF output, with no stored secret.
---

A passkey account is a blockchain account whose keys derive from a passkey's PRF output. No secret is stored anywhere; the passkey is the root, and each ceremony recomputes the same accounts from it. This is the default way to use mera.

## One salt, one stable output

When the PRF salt is omitted, mera uses its [fixed v1 salt](/reference/get-deterministic-prf-salt-v1/). The same passkey and relying party then produce the same 32 bytes of PRF output on every ceremony. The app feeds that output into a derivation scheme of its choosing, the deterministic computation that turns root entropy into per-account keys ([Entropy, keys, and accounts](/concepts/entropy-keys-and-accounts/) explains the pipeline); [Create passkey accounts](/recipes/create-passkey-accounts/) shows one built on common HD standards.

## No stored state

There is no stored secret; all state lives in the passkey. Once the passkey has synced to a new device, sign-in there is the same ceremony and produces the same accounts.

## Losing the passkey

The account may be unrecoverable if the passkey is deleted, not synced, tied to a lost provider account, or unavailable under the app's rpId after a domain migration. Recovery then depends on an app-provided export, import, or backup path, taken while the passkey still works; without one, nothing else can reproduce the keys.

## When the secret already exists

Passkey accounts are rooted in the passkey itself, so an account that predates the passkey cannot become one. A [secret vault](/concepts/secret-vaults/) covers that case: it encrypts the existing recovery phrase or private key behind the same passkey ceremony.

## See also

- [Entropy, keys, and accounts](/concepts/entropy-keys-and-accounts/): the derivation pipeline the app runs on the PRF output.
- [Create passkey accounts](/recipes/create-passkey-accounts/): the pattern in code, with numbered accounts and credential pinning.
- [Secret vaults](/concepts/secret-vaults/): the advanced pattern for secrets that exist on their own.
- [getDeterministicPrfSaltV1](/reference/get-deterministic-prf-salt-v1/): the fixed salt behind the stability.
- [Security model](/concepts/security-model/#rpid-binding): what a domain migration breaks.
