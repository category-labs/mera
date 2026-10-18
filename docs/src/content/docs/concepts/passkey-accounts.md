---
title: Passkey accounts
description: Accounts derived from a passkey with no stored secret.
---

In mera's model, a passkey account is a blockchain account whose keys derive from a passkey's [PRF output](/concepts/passkeys-and-prf/), the 32 secret bytes a passkey returns deterministically. mera evaluates the PRF with a fixed salt, so each [ceremony](/concepts/passkeys-and-prf/#ceremonies-and-prompts) recomputes the same accounts on every device the passkey syncs to, with no secret stored anywhere. mera derives the account keys with the HD (hierarchical deterministic) [derivation standards](/concepts/entropy-keys-and-accounts/) wallet apps use, and an app can apply another scheme to the same 32 bytes.

## Losing the passkey

The accounts may be unrecoverable if the passkey is deleted, not synced, tied to a lost provider account, unavailable under the app's rpId after a domain migration, or [overwritten](/concepts/passkeys-and-prf/#user-handles) by a second passkey with the same user handle. Recovery then depends on an app-provided export, import, or backup path, taken while the passkey still works.

## When the secret already exists

What if a seed phrase or another secret already exists, and the goal is passkey access to it? Passkey accounts are rooted in the passkey itself, so an account that predates the passkey cannot become one. The app can instead lock the existing secret to the passkey with a [secret vault](/concepts/secret-vaults/).

## See also

- [Keys and accounts](/concepts/entropy-keys-and-accounts/): the derivation pipeline behind passkey accounts.
- [Create passkey accounts](/recipes/create-passkey-accounts/): the pattern in code, with numbered accounts and credential pinning.
- [Secret vaults](/concepts/secret-vaults/): the advanced pattern for secrets that exist on their own.
- [getPasskeyPrfOutput](/reference/get-passkey-prf-output/): the ceremony and the fixed salt behind the stability.
- [deriveEvmPrivateKey](/reference/derive-evm-private-key/) and [deriveSolanaPrivateKey](/reference/derive-solana-private-key/): the derivation paths for EVM and Solana accounts.
- [Security model](/concepts/security-model/): what a domain migration breaks.
