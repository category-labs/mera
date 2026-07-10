---
title: API reference
description: Every exported function, one page each.
---

Each exported function has its own page. Types are documented on the pages of the functions that produce or accept them.

## Passkeys

- [createPasskey](/reference/create-passkey/): creates a discoverable, user-verified passkey with the WebAuthn PRF extension enabled.
- [createPasskeyWithPrfOutput](/reference/create-passkey-with-prf-output/): creates a passkey and returns its deterministic PRF output in one call.
- [getPasskeyPrfOutput](/reference/get-passkey-prf-output/): requests a passkey PRF evaluation and returns the deterministic output.
- [getDeterministicPrfSaltV1](/reference/get-deterministic-prf-salt-v1/): returns the default salt explicitly for interoperability and custom composition.

## Signing sessions

- [createSecp256k1SigningSession](/reference/create-secp256k1-signing-session/): creates an explicitly lockable signing session from a secp256k1 private key.
- [createEd25519SigningSession](/reference/create-ed25519-signing-session/): creates an explicitly lockable signing session from an Ed25519 private key.
- [toViemAccount](/reference/to-viem-account/): adapts a secp256k1 signing session into a viem local account.

## Secret vault

- [createSecretVaultWithNewPasskey](/reference/create-secret-vault-with-new-passkey/): creates a passkey and encrypts one secret with a fresh random salt.
- [createSecretVaultWithExistingPasskey](/reference/create-secret-vault-with-existing-passkey/): encrypts another secret with an existing passkey and a fresh random salt.
- [decryptSecretVaultWithPasskey](/reference/decrypt-secret-vault-with-passkey/): performs the passkey assertion and decrypts a vault.
- [createSecretVault](/reference/create-secret-vault/): encrypts a secret from explicit credential and PRF material.
- [getSecretVaultPrfOutput](/reference/get-secret-vault-prf-output/): performs the WebAuthn assertion needed to unlock a vault.
- [decryptSecretVault](/reference/decrypt-secret-vault/): decrypts the secret from a vault.
- [parseSecretVault](/reference/parse-secret-vault/): parses and validates untrusted vault JSON or objects.
- [Secret vault format](/reference/secret-vault-format/): the v1 storage contract, field by field.

## Addresses

- [getEvmAddress](/reference/get-evm-address/): derives the EIP-55 checksummed EVM address for a secp256k1 public key.
- [isEvmAddress](/reference/is-evm-address/): returns true when a string is a 20-byte `0x`-prefixed EVM address.
- [getSolanaAddress](/reference/get-solana-address/): derives the base58-encoded Solana address for an Ed25519 public key.
- [isSolanaAddress](/reference/is-solana-address/): returns true when a string is a valid base58-encoded Solana address.

## Errors

- [Errors](/reference/errors/): every error the library throws and its stable code.
