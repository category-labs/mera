---
title: Passkey accounts
description: Accounts derived from a passkey's PRF output, with no stored secret.
---

In mera's model, a passkey account is a blockchain account whose keys derive from a passkey's PRF output, the 32 secret bytes a passkey returns deterministically, so each [ceremony](/concepts/passkeys-and-prf/#ceremonies-and-prompts) recomputes the same accounts.

## One salt, one stable output

The PRF takes a 32-byte salt as input to give the same passkey unrelated outputs. Mera uses a fixed salt. The same passkey and relying party then produce the same PRF output on every device the passkey syncs to. The app passes the output to a [derivation scheme](/concepts/entropy-keys-and-accounts/) of its choosing. [Create passkey accounts](/recipes/create-passkey-accounts/) shows one built on common HD (hierarchical deterministic) standards.

## Losing the passkey

The account may be unrecoverable if the passkey is deleted, not synced, tied to a lost provider account, or unavailable under the app's rpId after a domain migration. Recovery then depends on an app-provided export, import, or backup path, taken while the passkey still works.

## When the secret already exists

Passkey accounts are rooted in the passkey itself, so an account that predates the passkey cannot become one. Mera supports encrypting arbitrary secrets with Passkey's PRF output, described in [secret vault](/concepts/secret-vaults/). This is an advanced use case since it requires the app to store the encrypted blob.

## See also

- [Entropy, keys, and accounts](/concepts/entropy-keys-and-accounts/): the derivation pipeline the app runs on the PRF output.
- [Create passkey accounts](/recipes/create-passkey-accounts/): the pattern in code, with numbered accounts and credential pinning.
- [Secret vaults](/concepts/secret-vaults/): the advanced pattern for secrets that exist on their own.
- [getPasskeyPrfOutput](/reference/get-passkey-prf-output/): the ceremony and the fixed salt behind the stability.
- [Security model](/concepts/security-model/): what a domain migration breaks.
