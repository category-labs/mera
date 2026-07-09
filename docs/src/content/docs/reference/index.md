---
title: API reference
description: Every exported function, one page each.
---

Each exported function has its own page. Types are documented on the pages of the functions that produce or accept them.

## Passkeys

- [createPasskey](/reference/create-passkey/): creates a discoverable, user-verified passkey with the WebAuthn PRF extension enabled.
- [createPasskeyWithPrfOutput](/reference/create-passkey-with-prf-output/): creates a passkey and returns the PRF output for the given salt in one call.
- [getPasskeyPrfOutput](/reference/get-passkey-prf-output/): requests a passkey PRF evaluation and returns the output.
- [getDeterministicPrfSaltV1](/reference/get-deterministic-prf-salt-v1/): returns mera's fixed v1 deterministic PRF salt.

## Signing sessions

- [createSecp256k1SigningSession](/reference/create-secp256k1-signing-session/): wraps a secp256k1 private key in an explicitly lockable signing session.
- [createEd25519SigningSession](/reference/create-ed25519-signing-session/): wraps an Ed25519 private key in an explicitly lockable signing session.
- [toViemAccount](/reference/to-viem-account/): adapts a secp256k1 signing session into a viem local account.

## Secret vault

- [createSecretVault](/reference/create-secret-vault/): encrypts an arbitrary secret into a passkey-protected vault.
- [getSecretVaultPrfOutput](/reference/get-secret-vault-prf-output/): performs the WebAuthn assertion needed to unlock a vault.
- [unwrapSecretVault](/reference/unwrap-secret-vault/): decrypts the secret from a vault.
- [parseSecretVault](/reference/parse-secret-vault/): parses and validates untrusted vault JSON or objects.
- [Secret vault format](/reference/secret-vault-format/): the v1 storage contract, field by field.

## Addresses

- [getEvmAddress](/reference/get-evm-address/): derives the EIP-55 checksummed EVM address for a secp256k1 public key.
- [isEvmAddress](/reference/is-evm-address/): returns true when a string is a 20-byte `0x`-prefixed EVM address.
- [getSolanaAddress](/reference/get-solana-address/): derives the base58-encoded Solana address for an Ed25519 public key.
- [isSolanaAddress](/reference/is-solana-address/): returns true when a string is a valid base58-encoded Solana address.

## Errors

- [Errors](/reference/errors/): every error the library throws and its stable code.
