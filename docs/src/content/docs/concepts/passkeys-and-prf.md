---
title: Passkeys and the PRF extension
description: Where mera's 32 bytes come from and why they are stable.
---

A passkey is a WebAuthn credential: a key pair created at a website's request by an authenticator (a phone, a password manager, a hardware key). The private half never leaves the authenticator. "Discoverable" means the authenticator finds the credential for a domain on its own, so signing in needs no username and no stored identifier.

**Passkeys are bound to a relying party ID.** The `rpId` is a domain, and a credential created under one rpId cannot be used under another. The [security model](/concepts/security-model/) covers what this means for domain migrations.

**Passkeys sync.** Platform authenticators replicate credentials across a person's devices: iCloud Keychain across Apple devices, Google Password Manager across Android and Chrome, 1Password wherever it runs. Everything derived from the credential follows it to those devices.

## User verification

Every mera ceremony requires user verification, the authenticator's local check that the person is present and is the owner. The gesture depends on the platform: a biometric, a device PIN, a password.

The requirement is not configurable. Authenticators built on CTAP's `hmac-secret` keep two PRFs per credential, one for user-verified requests and one for the rest; WebAuthn exposes only the user-verified PRF and overrides a weaker `userVerification` setting when evaluating it. A setting could neither change the output nor skip the check, so mera does not offer one.

## The PRF extension

The [PRF extension](https://www.w3.org/TR/webauthn-3/#prf-extension) gives each credential a pseudorandom function. The caller passes a 32-byte salt with the ceremony and the authenticator returns 32 bytes.

The output is deterministic in exactly three inputs: the credential, the relying party ID, and the salt. Same three, same 32 bytes, on any device the passkey syncs to. Change the salt and the output is unrelated. Salts act as namespaces, which is why derived accounts share one [fixed salt](/reference/get-deterministic-prf-salt-v1/) while each wrapped secret gets a fresh random one.

## Account-grade entropy

32 stable bytes that appear only after user verification, exist outside the authenticator only as this evaluated output, and follow the passkey wherever it syncs: enough to root an account on.

Fed to a key-derivation scheme, the bytes root a hierarchy of accounts; used as key material, they open an encrypted vault. mera hands them over and stops there; [derived and wrapped modes](/concepts/derived-and-wrapped/) compares the two patterns.

## Ceremonies and prompts

A ceremony is one WebAuthn call and one user-verification prompt. mera runs three kinds:

- [createPasskey](/reference/create-passkey/) makes the credential, and can evaluate the PRF in the same ceremony when the authenticator supports it.
- [getPasskeyPrfOutput](/reference/get-passkey-prf-output/) asserts with an existing credential and returns the PRF output.
- [createPasskeyWithPrfOutput](/reference/create-passkey-with-prf-output/) chains the two: one prompt when the authenticator evaluates PRF at create time, two when it needs the follow-up assertion.

Signing itself never prompts: a ceremony's output backs key material in a [signing session](/reference/create-secp256k1-signing-session/), and the session signs until it is locked.

## See also

- [Authenticator support](/concepts/authenticator-support/): which stacks deliver PRF today.
- [Getting started](/getting-started/): the ceremony-to-signature path in code.
