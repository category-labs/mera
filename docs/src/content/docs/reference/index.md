---
title: API reference
description: The exported functions, the vault storage format, and the error codes.
---

## Passkeys

- [createPasskeyWithPrfOutput](/reference/create-passkey-with-prf-output/): creates a passkey and returns its deterministic PRF output in one call.
- [getPasskeyPrfOutput](/reference/get-passkey-prf-output/): requests a passkey PRF evaluation and returns the deterministic output.
- [WebAuthnClient](/reference/web-authn-client/): the client the ceremonies run through, and how to supply one off the web.

## Signing sessions

- [createSecp256k1SigningSession](/reference/create-secp256k1-signing-session/): creates a signing session from a secp256k1 private key.
- [Secp256k1SigningSession](/reference/secp256k1-signing-session/): the returned session.
- [createEd25519SigningSession](/reference/create-ed25519-signing-session/): creates a signing session from an Ed25519 private key.
- [Ed25519SigningSession](/reference/ed25519-signing-session/): the returned session.
- [toViemAccount](/reference/to-viem-account/): adapts a secp256k1 signing session into a viem local account.

## Secret vault

- [createSecretVaultWithNewPasskey](/reference/create-secret-vault-with-new-passkey/): creates a passkey and encrypts one secret with a fresh random salt.
- [createSecretVaultWithExistingPasskey](/reference/create-secret-vault-with-existing-passkey/): encrypts another secret with an existing passkey and a fresh random salt.
- [decryptSecretVaultWithPasskey](/reference/decrypt-secret-vault-with-passkey/): performs the passkey assertion and decrypts a vault.
- [parseSecretVault](/reference/parse-secret-vault/): parses and validates untrusted vault JSON or objects.
- [Secret vault format](/reference/secret-vault-format/): the v1 storage contract, field by field.

## Addresses

- [getEvmAddress](/reference/get-evm-address/): derives the EIP-55 checksummed EVM address for a secp256k1 public key.
- [getSolanaAddress](/reference/get-solana-address/): derives the base58-encoded Solana address for an Ed25519 public key.

## Errors

- [Errors](/reference/errors/): every error the library throws and its stable code.
