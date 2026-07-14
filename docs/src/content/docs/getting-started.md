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

This walkthrough derives accounts with `@scure/bip32` and `@scure/bip39`; any derivation scheme works.

```sh
npm install @scure/bip32 @scure/bip39
```

## Create a passkey

`createPasskeyWithPrfOutput` creates a discoverable passkey and evaluates its PRF in one call. The PRF (pseudorandom function) is a function each passkey carries: pass it a salt, a 32-byte input that acts as a namespace, and it returns 32 bytes that are stable for that passkey and salt ([Passkeys and the PRF extension](/concepts/passkeys-and-prf/)).

```ts
import { createPasskeyWithPrfOutput } from "@category-labs/mera";

const rpId = "account.example.com";

const { prfOutput } = await createPasskeyWithPrfOutput({
  rp: { id: rpId, name: "Example" },
  user: { name: "account@example.com", displayName: "Example account" },
});
```

The call prompts once or twice when the authenticator needs a follow-up assertion to evaluate PRF.

mera uses its fixed v1 salt for this call. The `rpId` is the relying party ID, the domain the passkey is bound to. The same passkey and relying party produce the same 32 bytes on any device the passkey syncs to. The result also carries the credential ID; [Create passkey accounts](/recipes/create-passkey-accounts/) stores it to pin later sign-ins.

## Derive an account

The PRF output is entropy: 32 bytes an attacker cannot predict, strong enough to be the root of every account that follows ([Entropy, keys, and accounts](/concepts/entropy-keys-and-accounts/)). This walkthrough maps it through BIP-39, the standard that encodes entropy as a phrase of common words, and BIP-32, the standard that derives numbered keys from one seed, so the account can be imported into wallet apps that speak those standards.

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

`m/44'/60'/0'/0/0` is a BIP-44 derivation path, the address of one key in the tree BIP-32 grows from the seed; this one selects the first Ethereum account, the same key MetaMask derives first from an imported phrase.

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

- [Entropy, keys, and accounts](/concepts/entropy-keys-and-accounts/): the background for every term this page glossed in passing.
- [Create passkey accounts](/recipes/create-passkey-accounts/): numbered accounts, credential pinning, Solana keys.
- [Passkey accounts](/concepts/passkey-accounts/): why the same passkey reproduces the same accounts, and what losing it means.
- [Secret vaults](/concepts/secret-vaults/): encrypting a secret that already exists behind the passkey.
- [API reference](/reference/): every function used on this page.
