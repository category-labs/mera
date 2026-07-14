---
title: Security model
description: What mera protects, what it cannot, and the risks left to the app.
---

mera has a narrow scope: it runs passkey ceremonies, returns [entropy](/concepts/entropy-keys-and-accounts/) to the app, and holds signing keys in [lockable sessions](/concepts/signing-sessions/).

## What the library handles

Input buffers are copied before any async work starts, so mutating a buffer after a call cannot change what gets signed, encrypted, or derived.

Owned copies are zeroed where possible. A signing session zeroes the caller's private-key buffer when it consumes it, even when construction throws, and zeroes its own copy on `lock()`. [createSecretVault](/reference/create-secret-vault/) zeroes its internal secret and PRF-output copies. Secret-vault workflow functions also zero the transient secret and PRF-output copies they own before settling.

WebAuthn challenges are generated internally. So are AES-GCM nonces: a nonce is a value that must never repeat under one encryption key, so the library generates 12 fresh bytes per encryption and a caller cannot reuse one. Every ceremony requires user verification, and the requirement is [not configurable](/concepts/passkeys-and-prf/#user-verification).

## What a compromised runtime sees

A compromised JavaScript runtime, whether an injected script, a malicious dependency, or an extension with page access, can observe key material during app-owned derivation or import. It can also sign with an active session until `session.lock()` is called.

The mitigations are app-level: lock sessions when idle, keep derivation windows short, and treat everything that can run script on the page as inside the trust boundary.

## rpId binding

PRF output is a function of the credential, the relying party ID, and the salt. A passkey can be used only under the rpId it was created for, so after a domain migration the app cannot run assertions under the old one. That breaks both patterns: passkey accounts can no longer be reproduced, and secret vaults can no longer be decrypted.

Treat the rpId as a long-lived choice. Before any planned migration, accounts need an export path.

## One output, one purpose

If one PRF output is reused for unrelated purposes, exposing it compromises them all. Use a different salt per purpose, or split one output with a purpose-labeled key-derivation function (KDF), a deterministic function that turns one secret into separate purpose-specific keys ([Entropy, keys, and accounts](/concepts/entropy-keys-and-accounts/)).

A vault is bound to its PRF output only, never to the credential ID or salt. Secrets encrypted using one reused output share an encryption key, and their nonce/ciphertext pairs become interchangeable to anyone who can rewrite stored vault JSON. The secret-vault creation functions generate a fresh random 32-byte salt for each secret; the [createSecretVault](/reference/create-secret-vault/) page documents the low-level requirement.

## Strings cannot be zeroed

A revealed recovery phrase is a JavaScript string, and strings cannot be zeroed in place. The app can only drop references and keep the lifetime short. Treat a revealed phrase as high-risk UI state: render it late, discard it early, never log it.

## Dependency scope

Runtime dependencies are `@noble/*` and `@scure/*` only. Build and test tooling, and the unpublished demo app, never ship to library consumers.

## See also

- [Passkeys and the PRF extension](/concepts/passkeys-and-prf/)
- [Errors](/reference/errors/): every failure the library signals, by code.
