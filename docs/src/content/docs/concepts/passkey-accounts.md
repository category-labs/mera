---
title: Passkey accounts
description: Accounts derived from a passkey's PRF output, with no stored secret.
---

A passkey account is a blockchain account whose keys derive from a passkey's PRF output, the 32 secret bytes a passkey returns deterministically ([Passkeys and PRF](/concepts/passkeys-and-prf/) explains the mechanism). Each ceremony, one [WebAuthn](https://www.w3.org/TR/webauthn-3/) call with a user-verification prompt, recomputes the same accounts. This is the default way to use mera.

## One salt, one stable output

When the PRF salt is omitted, mera uses its [fixed v1 salt](/reference/get-deterministic-prf-salt-v1/). The same passkey and relying party then produce the same 32 bytes of PRF output on every ceremony, on every device the passkey syncs to. There is no stored secret; all state lives in the passkey. The app passes the output to a [derivation scheme](/concepts/entropy-keys-and-accounts/) of its choosing. [Create passkey accounts](/recipes/create-passkey-accounts/) shows one built on common HD (hierarchical deterministic) standards.

## Losing the passkey

The account may be unrecoverable if the passkey is deleted, not synced, tied to a lost provider account, or unavailable under the app's rpId after a domain migration. Recovery then depends on an app-provided export, import, or backup path, taken while the passkey still works.

## When the secret already exists

Passkey accounts are rooted in the passkey itself, so an account that predates the passkey cannot become one. A [secret vault](/concepts/secret-vaults/) covers that case: it encrypts the existing recovery phrase or private key behind the same passkey ceremony.

## See also

- [Entropy, keys, and accounts](/concepts/entropy-keys-and-accounts/): the derivation pipeline the app runs on the PRF output.
- [Create passkey accounts](/recipes/create-passkey-accounts/): the pattern in code, with numbered accounts and credential pinning.
- [Secret vaults](/concepts/secret-vaults/): the advanced pattern for secrets that exist on their own.
- [getDeterministicPrfSaltV1](/reference/get-deterministic-prf-salt-v1/): the fixed salt behind the stability.
- [Security model](/concepts/security-model/): what a domain migration breaks.
