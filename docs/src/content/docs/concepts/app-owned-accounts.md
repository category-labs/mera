---
title: App-owned accounts
description: What deriving accounts from a passkey gives the app that integrates it.
---

A blockchain app usually depends on an external wallet app for accounts: the user installs one, connects it, and onboarding, funding, and recovery all happen in that other product. mera puts the account inside the integrating app. Accounts derive from a passkey created under the app's own domain, so the app owns every account flow from the first visit on. "The app" here is any product that integrates the library; a wallet app can be one.

## Onboarding from a link

An app that requires an external wallet app cannot onboard a user who arrives with nothing: a shared link leads to an install and setup detour in another product before the first interaction. With [passkey accounts](/concepts/passkey-accounts/), the first interaction is a passkey prompt. The app decides everything around it: how the account is presented, how it is funded, and when to introduce export or backup.

## New platforms reuse the accounts

Passkeys sync across a person's devices, and the PRF output, the 32 secret bytes a passkey returns deterministically, is stable wherever the passkey syncs ([Passkeys and the PRF extension](/concepts/passkeys-and-prf/)). A native iOS or Android counterpart bound to the same domain runs the same ceremony and derives the same accounts, so launching on a new platform adds no account-connectivity layer.

## No hosted service

Hosted embedded-wallet services also give apps their own accounts, by keeping or splitting key material server-side; the account layer then depends on that service. mera is a library the app runs itself. Passkey providers store and sync the passkey, and the app needs no custody backend, no multi-party computation (MPC, splitting a key across parties so that no single party holds it), and no smart-account contracts (on-chain programs that stand in for a key pair).

## Software keys

App-owned accounts are software accounts. The PRF output and every key derived from it exist as ordinary values in the page's JavaScript memory while in use, so the guarantees match a wallet app that holds an imported seed phrase in page memory. A hardware wallet keeps the key out of the page; mera runs in the page. The [security model](/concepts/security-model/) states what the library protects and what stays with the app.

## See also

- [Getting started](/getting-started/): the passkey-to-signature path in code.
- [Passkey accounts](/concepts/passkey-accounts/): the mechanism behind the ownership.
- [Security model](/concepts/security-model/): the full trust boundary.
