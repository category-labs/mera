---
title: Signing sessions
description: How a session owns its private key, why signing never prompts, and what locking destroys.
---

A signing session holds one private key and signs with it until it is locked. It is the last step in mera's flow: a ceremony produces PRF output, the app turns that output into a private key, and the session does the signing.

Two constructors exist, one per curve: [createSecp256k1SigningSession](/reference/create-secp256k1-signing-session/) signs 32-byte digests and [createEd25519SigningSession](/reference/create-ed25519-signing-session/) signs arbitrary-length messages. The custody model is the same for both.

## Independent of passkeys

A session's input is a raw private key, derived from PRF output, unwrapped from a vault, or imported from elsewhere; the session does not record where the key came from and never contacts an authenticator. The step in between, turning 32 bytes of entropy into a chain-specific private key, is app-owned by design. [Derived and wrapped modes](/concepts/derived-and-wrapped/) compares the two common patterns.

This is why signing never prompts. The user-verification prompt belongs to the ceremony that produced the entropy; once a session exists, it signs as often as the app asks with no further WebAuthn involvement, so one prompt is enough for any number of signatures.

## The lifecycle

A session begins unlocked and ends locked, and each transition zeroes a copy of the key.

Construction consumes the key: the session keeps the only library-side copy and zeroes the caller's input buffer, even when construction throws. Locking zeroes the session's copy and is permanent: a locked session throws on signing, and there is no unlock. New signatures require a new session built from fresh key material. An unlock path would mean the key still existed somewhere after `lock()`; permanence is what makes the lock meaningful.

Sessions also support `using` declarations: disposal calls `lock()` when the scope exits, so a session can be bound to a block instead of a manual call.

## The open window

Between construction and lock, anything that can run script on the page can request signatures. The session exposes no way to read the key back, but a compromised runtime does not need the key if it can sign. Locking is the only thing that closes the window, so sessions are best created late and locked as soon as the signing work is done. The [security model](/concepts/security-model/#what-a-compromised-runtime-sees) covers the runtime trust boundary in full.

## Why sessions exist

A signing function that took the key as an argument on every call would spread copies across every caller and make zeroing each one the app's job. The session shape keeps the key in one place with one owner, and it makes key lifetime visible in the code: the lifetime spans the line that creates the session and the line that locks it.

## See also

- [createSecp256k1SigningSession](/reference/create-secp256k1-signing-session/) and [createEd25519SigningSession](/reference/create-ed25519-signing-session/): the exact copy, zeroing, and locking semantics.
- [Sign with viem](/recipes/sign-with-viem/) and [Sign Solana transactions](/recipes/sign-solana-transactions/): sessions in transaction flows.
- [Getting started](/getting-started/): the ceremony-to-signature path in code.
