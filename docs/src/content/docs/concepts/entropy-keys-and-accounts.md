---
title: Entropy, keys, and accounts
description: How random bytes become a private key, an address, and a reproducible family of accounts.
---

The blockchain background the rest of the docs assume: how 32 random bytes become a private key, an account, and a reproducible family of accounts. Readers who know BIP-32 and BIP-39 can skip to [Passkeys and the PRF extension](/concepts/passkeys-and-prf/).

## Randomness and entropy

Entropy is randomness an attacker cannot predict, measured in bits. A fair coin flip carries one bit; 32 random bytes carry 256, and searching 2^256 values is infeasible for any computer.

Everything below starts from one such value and proceeds deterministically. The root secret is the only unpredictable input, so it is the only thing to protect; everything derived from it can be recomputed instead of stored.

## Private keys, public keys, and signatures

A private key is a 256-bit secret number. A one-way function computes the public key from it: cheap to run forward, infeasible to reverse, so the public key is safe to share.

A signature is computed from a message and a private key and verified with the public key alone. A valid signature proves the key's holder approved that exact message, without revealing the key.

The docs use two signature schemes, named for their curves: secp256k1 on Ethereum and other EVM chains (chains that run the Ethereum Virtual Machine), and Ed25519 on Solana.

## Accounts and addresses

A blockchain account is the state a chain tracks for one key pair: a balance and a transaction history. The address is a short encoding of the public key, safe to publish.

Control of an account is the ability to sign: a transaction is valid when its signature verifies against the account's public key. There is no reset path. Losing the private key loses the account, and anyone who obtains it controls the account.

## Deterministic derivation

A key-derivation function (KDF) turns one secret into others: the output looks random, and the same input always produces the same output. A key that can be recomputed never needs to be stored.

BIP-32 (secp256k1) and SLIP-0010 (Ed25519) extend one master seed into a tree of child keys, where a derivation path such as `m/44'/60'/0'/0/0` names one key. The same seed and path produce the same key on any machine, so one 32-byte value backs any number of accounts with nothing stored per account. (BIP is a Bitcoin Improvement Proposal; several became standards beyond Bitcoin.)

## Seed phrases

BIP-39 maps entropy to a phrase of common words and back: 128 bits become 12 words, 256 bits become 24. The phrase is an encoding, adding no security of its own; whoever reads it holds the entropy.

A wallet app that follows the same standards (MetaMask and Phantom are two) turns an imported phrase back into the same accounts, which gives accounts built this way an exit path independent of any one library.

## Where mera fits

mera supplies the root: a passkey ceremony returns 32 bytes of PRF output, and the app uses them as the entropy for this pipeline. Derivation, paths, and phrases are app-owned; the library returns entropy and signs.

## See also

- [Passkeys and the PRF extension](/concepts/passkeys-and-prf/): where the 32 bytes come from and why they are stable.
- [Derive accounts from one passkey](/recipes/derive-accounts/): this pipeline in code.
- [Getting started](/getting-started/): the shortest path from ceremony to signature.
