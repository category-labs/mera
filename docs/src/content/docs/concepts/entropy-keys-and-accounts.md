---
title: Entropy, keys, and accounts
description: How random bytes become a private key, an address, and a reproducible family of accounts.
---

This page is the blockchain background the rest of the docs assume: how 32 random bytes become a private key, how a private key becomes an account, and how one root secret reproduces any number of accounts. Readers who already know BIP-32 and BIP-39 can skip to [Passkeys and the PRF extension](/concepts/passkeys-and-prf/).

## Randomness and entropy

Entropy is randomness an attacker cannot predict, measured in bits. One fair coin flip carries one bit. 32 random bytes carry 256 bits, which puts guessing out of reach: a search over 2^256 values is infeasible for any computer, present or projected.

Everything on this page starts from one such random value and proceeds by deterministic computation, meaning the same input always produces the same output. That structure carries the security story: the root secret is the only unpredictable input, so it is the only thing that needs protecting, and everything below it can be recomputed instead of stored.

## Private keys, public keys, and signatures

A private key is a large secret number, in practice 256 bits, so it fits in 32 bytes. A one-way function computes a public key from it: cheap to run forward, infeasible to reverse. The public key can be shared with anyone without exposing the private key.

A signature is a value computed from a message and a private key. Anyone holding the public key can verify it, and a valid signature proves the private key's holder approved that exact message. The key itself is never revealed; approving one message grants nothing over any other.

The docs use two signature schemes, named after their underlying elliptic curves (the mathematical structure the keys live on; nothing else here depends on the details). secp256k1 is the scheme of Ethereum and other EVM chains, the chains that run the Ethereum Virtual Machine. Ed25519 is the scheme Solana uses.

## Accounts and addresses

A blockchain account is the state a chain tracks for one key pair: a balance and a transaction history. The address is the account's public name, a short encoding computed from the public key, safe to publish and share.

Control of an account is exactly the ability to sign. A transaction moves funds when it carries a signature that the account's public key verifies, so whoever holds the private key controls the account. No authority stands behind the key: there is no reset path, losing the key loses the account, and anyone who obtains it gains full control.

## Deterministic derivation

A key-derivation function (KDF) turns one secret into others. Its output looks random, yet the same input produces the same output every time. Determinism is the point: a key that can be recomputed from the root never needs to be stored.

Hierarchical derivation extends one secret into a family of keys. BIP-32 (for secp256k1) and SLIP-0010 (for Ed25519) turn one master seed, a single root secret, into a tree of child keys. A derivation path such as `m/44'/60'/0'/0/0` names one position in that tree. Same seed, same path, same key, on any machine, which is how one 32-byte value stands behind any number of accounts with nothing stored per account. (BIP stands for Bitcoin Improvement Proposal; several of these documents were adopted as standards well beyond Bitcoin.)

## Seed phrases

BIP-39 maps entropy to a phrase of common words and back: 128 bits become 12 words, 256 bits become 24. The phrase is an encoding for backup and interoperability, and it adds no security of its own; whoever reads the phrase holds the entropy.

The phrase is also an exit path that does not depend on any one library or app. A wallet app that follows the same standards (MetaMask and Phantom are two) turns an imported phrase back into the same seed, the same tree, and the same accounts.

## Where mera fits

Every step above is pure computation over 32 unpredictable bytes. mera produces those bytes: a passkey ceremony returns 32 bytes of PRF output, and the app treats them as the root entropy for the pipeline on this page. Derivation, paths, and phrases stay app-owned; the library returns entropy and signs.

## See also

- [Passkeys and the PRF extension](/concepts/passkeys-and-prf/): where the 32 bytes come from and why they are stable.
- [Passkey accounts](/concepts/passkey-accounts/): the default pattern built on this pipeline.
- [Create passkey accounts](/recipes/create-passkey-accounts/): the pipeline in code.
- [Getting started](/getting-started/): the shortest path from ceremony to signature.
