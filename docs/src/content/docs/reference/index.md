---
title: API reference
description: Every exported function, grouped the way the library is built.
---

One page per exported function, each in the same shape: import, usage, parameters, return value, errors, notes. Types are documented on the pages of the functions that produce or accept them; the one exception is the [secret vault format](/reference/secret-vault-format/), a storage contract with its own page.

## Passkey ceremonies

- [createPasskey](/reference/create-passkey/): creates a discoverable, user-verified passkey and requires WebAuthn PRF support.
- [createPasskeyWithPrfOutput](/reference/create-passkey-with-prf-output/): creates a passkey and returns its first PRF output in one call.
- [getPasskeyPrfOutput](/reference/get-passkey-prf-output/): requests a passkey PRF evaluation and returns the first output.

## Deterministic PRF salt

- [getDeterministicPrfSaltV1](/reference/get-deterministic-prf-salt-v1/): returns mera's fixed v1 deterministic PRF salt.

## Signing sessions

- [createSecp256k1SigningSession](/reference/create-secp256k1-signing-session/): wraps a secp256k1 private key in an explicitly lockable signing session.
- [createEd25519SigningSession](/reference/create-ed25519-signing-session/): wraps an Ed25519 private key in an explicitly lockable signing session.

## Secret vault

- [createSecretVault](/reference/create-secret-vault/): encrypts an arbitrary secret into a passkey-protected vault.
- [getSecretVaultPrfOutput](/reference/get-secret-vault-prf-output/): performs the WebAuthn assertion needed to unlock a vault.
- [unwrapSecretVault](/reference/unwrap-secret-vault/): decrypts the secret from a vault.
- [parseSecretVault](/reference/parse-secret-vault/): parses and validates untrusted vault JSON or objects.
- [Secret vault format](/reference/secret-vault-format/): the v1 storage contract, field by field.

## Chain addresses

- [getEvmAddress](/reference/get-evm-address/): derives the EIP-55 checksummed EVM address for a secp256k1 public key.
- [isEvmAddress](/reference/is-evm-address/): returns true when a string is a 20-byte `0x`-prefixed EVM address.
- [getSolanaAddress](/reference/get-solana-address/): derives the base58-encoded Solana address for an Ed25519 public key.
- [isSolanaAddress](/reference/is-solana-address/): returns true when a string is a valid base58-encoded Solana address.

## Errors

- [Errors](/reference/errors/): `MeraError`, `isMeraError`, and all seven stable error codes.
