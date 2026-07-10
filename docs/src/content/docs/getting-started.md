---
title: Getting started
description: Install the library, derive an account, and make a first signature.
---

Prerequisites:

- A browser with WebAuthn, in a secure context: HTTPS, or `localhost` during development.
- A passkey authenticator that supports the WebAuthn PRF extension. [Authenticator support](/concepts/authenticator-support/) lists the combinations known to work; 1Password and iCloud Keychain are safe first picks.

## Install

```sh
npm install @category-labs/mera
```

This walkthrough also uses `@scure/bip32` and `@scure/bip39` to derive accounts; any derivation scheme works.

```sh
npm install @scure/bip32 @scure/bip39
```

## Create a passkey

`createPasskeyWithPrfOutput` creates a discoverable passkey and evaluates its PRF in one call.

```ts
import { createPasskeyWithPrfOutput } from "@category-labs/mera";

const rpId = "account.example.com";

const { prfOutput } = await createPasskeyWithPrfOutput({
  rp: { id: rpId, name: "Example" },
  user: { name: "account@example.com", displayName: "Example account" },
});
```

Expect one authenticator prompt, sometimes two: authenticators that do not evaluate PRF at create time get a follow-up assertion with the same salt.

mera uses its fixed v1 salt for this call. The same passkey and relying party produce the same 32 bytes on any device the passkey syncs to. The result also carries the credential ID; [Derive accounts from one passkey](/recipes/derive-accounts/) stores it to pin later sign-ins.

## Derive an account

The PRF output is entropy. This walkthrough maps it through BIP-39 and BIP-32 so the account can be imported into wallet apps that speak those standards.

```ts
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

// App-owned derivation: the PRF output becomes BIP-39 entropy, so the same
// phrase imported into a standard wallet app reproduces the same account.
const mnemonic = entropyToMnemonic(prfOutput, wordlist);
const seed = mnemonicToSeedSync(mnemonic);
const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
if (node.privateKey === null) throw new Error("derivation produced no key");
```

## Sign

```ts
import {
  createSecp256k1SigningSession,
  getEvmAddress,
} from "@category-labs/mera";

const session = createSecp256k1SigningSession({
  // Copy out of the HDKey so the session can own and later zero the buffer.
  consumePrivateKey: new Uint8Array(node.privateKey),
});

const address = getEvmAddress(session.publicKey);

const digest = new Uint8Array(32); // stand-in: a real app signs a transaction or message hash
const signature = await session.signDigest(digest);

session.lock();
```

The session copies the key, zeroes the buffer it was given, and signs without further passkey prompts until `lock()` is called. Locking zeroes the session's copy too; after that, signing throws.

## Sign back in

A later visit needs no stored secret: the same assertion with the same salt returns the same 32 bytes, and with them the same account.

```ts
import { getPasskeyPrfOutput } from "@category-labs/mera";

const { prfOutput } = await getPasskeyPrfOutput({
  rpId,
});
```

Without `credential`, the browser offers any discoverable passkey it holds for the relying party; apps with returning users pin the stored credential ID instead.

## Where next

- [Derive accounts from one passkey](/recipes/derive-accounts/): numbered accounts, credential pinning, Solana keys.
- [Derived and wrapped modes](/concepts/derived-and-wrapped/): when to reach for an encrypted vault instead of derivation.
- [API reference](/reference/): every function used on this page.
