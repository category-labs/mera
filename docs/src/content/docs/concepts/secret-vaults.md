---
title: Secret vaults
description: Passkey-encrypted storage for one existing secret, and when to use them.
sidebar:
  badge:
    text: Advanced
    variant: default
---

A secret vault holds one secret, a recovery phrase, a private key, any bytes, encrypted so that only a passkey ceremony can decrypt it. Vaults serve the cases where key material must come from outside the passkey, and above all migration: an existing account moves to passkey sign-in by encrypting its secret once. Apps creating accounts from scratch need only [passkey accounts](/concepts/passkey-accounts/).

## How a vault works

Vaults encrypt with AES-256-GCM, a symmetric cipher that authenticates what it encrypts, so tampering with the stored bytes makes decryption fail. The secret-vault functions evaluate the passkey against a fresh random salt for each secret and store that salt in the vault; the resulting PRF output produces the key material that decrypts it. Secrets encrypted using a reused salt would share one encryption key, and exposing that key would expose all of them ([one output, one purpose](/concepts/security-model/#one-output-one-purpose)).

The vault itself is ordinary JSON and can live in `localStorage`, on a backend, or in a sync service.

## The secret exists on its own

The secret exists independently of the passkey: an account that predates it can be imported by encrypting its recovery phrase or private key, and a copy of that secret may live somewhere else entirely. Custody of the vault is an app design question. The holder has only ciphertext; decrypting it requires the passkey ceremony.

## When to use a vault

Use a vault when the key material must come from outside the passkey. The main case is migration: an account created elsewhere, with an existing recovery phrase or private key, moves to passkey sign-in by encrypting that secret once. Recovery also differs: losing the passkey still loses access through mera, but any surviving copy of the secret restores the account, while a passkey account is recoverable only through an export taken beforehand.

The challenge is storage. The vault blob must live in durable storage, and where it lives, how it syncs, and how it survives device loss are design decisions the app owns; losing every copy of both the vault and the secret loses the account. That design burden is why vaults are the advanced option: when the secret does not already exist elsewhere, passkey accounts cover the same ground with nothing to store.

## See also

- [Encrypt an existing secret with a passkey](/recipes/use-an-existing-secret/): the pattern in code.
- [Secret vault format](/reference/secret-vault-format/): the stored JSON, field by field.
- [createSecretVaultWithNewPasskey](/reference/create-secret-vault-with-new-passkey/): the one-call entry point.
- [Passkey accounts](/concepts/passkey-accounts/): the default pattern this one complements.
- [Security model](/concepts/security-model/): zeroing, salts, and what the library cannot protect.
