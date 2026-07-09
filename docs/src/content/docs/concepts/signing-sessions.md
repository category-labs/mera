---
title: Signing sessions
description: How a session owns its private key, why signing never prompts, and what locking destroys.
---

A signing session holds one private key and signs with it until it is locked. It is the last step in mera's flow: a ceremony produces PRF output, the app turns that output into a private key, and the session does the signing.

Two constructors exist, one per curve: [createSecp256k1SigningSession](/reference/create-secp256k1-signing-session/) signs 32-byte digests and [createEd25519SigningSession](/reference/create-ed25519-signing-session/) signs arbitrary-length messages. The custody model is the same for both.

## Independent of passkeys

A session's input is a raw private key, derived from PRF output, unwrapped from a vault, or imported from elsewhere; the session does not record where the key came from. The step in between, turning 32 bytes of entropy into a chain-specific private key, is app-owned by design; [derived and wrapped modes](/concepts/derived-and-wrapped/) compares the two common patterns.

Because a session never contacts an authenticator, signing never prompts: the one user-verification prompt happened in the ceremony that produced the entropy, and it covers any number of signatures.

## The lifecycle

Construction consumes the key: the session keeps the only library-side copy and zeroes the caller's input buffer, even when construction throws. Locking zeroes the session's copy and is permanent: a locked session throws on signing, there is no unlock, and new signatures require a new session. An unlock path would mean the key still existed somewhere after `lock()`; permanence is what makes the lock meaningful.

Sessions also support `using` declarations: disposal calls `lock()` when the scope exits, so a session can be bound to a block instead of a manual call.

## The open window

Between construction and lock, anything that can run script on the page can request signatures. The session exposes no way to read the key back, but a compromised runtime does not need the key if it can sign. The [security model](/concepts/security-model/#what-a-compromised-runtime-sees) covers the runtime trust boundary in full.

## How long to keep a session

Locking is not free. Unless the app kept the key somewhere else, fresh key material means another passkey ceremony: reproducing a derived key and unwrapping a vault both start with one, so after `lock()` the next signature costs one more user-verification prompt. Session lifetime is a trade-off between that prompt and the open window.

Frequent signing justifies a held session. A high-frequency trading app that ran a fresh ceremony per order would prompt constantly, so it keeps one session for the active burst of work and locks it when the burst ends.

Apps that sign occasionally are better served by holding no session at all: derive the public key, identify the account by its address, and zero the private key right away; the next signature starts with a fresh ceremony. Key material then exists only in the moments that use it.

## Why sessions exist

A signing function that took the key as an argument on every call would spread copies across every caller and make zeroing each one the app's job. The session shape keeps the key in one place with one owner, and it makes key lifetime visible in the code: the lifetime spans the line that creates the session and the line that locks it.

## See also

- [createSecp256k1SigningSession](/reference/create-secp256k1-signing-session/) and [createEd25519SigningSession](/reference/create-ed25519-signing-session/): the exact copy, zeroing, and locking semantics.
- [Sign with viem](/recipes/sign-with-viem/): sessions in a transaction flow.
- [Getting started](/getting-started/): the ceremony-to-signature path in code.
