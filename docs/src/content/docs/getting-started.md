---
title: Getting started
description: Install the library, create a passkey, and make a first signature.
---

mera runs in the browser. It needs a secure context (HTTPS, or `localhost` during development) and a passkey authenticator that supports the WebAuthn PRF extension. [Authenticator support](/concepts/authenticator-support/) lists the combinations known to work; 1Password and iCloud Keychain are safe first picks.

## Install

```sh
npm install @category-labs/mera
```

This walkthrough also uses `@scure/bip32` and `@scure/bip39`. They are app dependencies: mera hands the app entropy, and the app decides how keys come out of it.

```sh
npm install @scure/bip32 @scure/bip39
```

## Create a passkey

`createPasskeyWithPrfOutput` creates a discoverable passkey and evaluates its PRF in one call.

```ts
import {
  createPasskeyWithPrfOutput,
  getDeterministicPrfSaltV1,
} from "@category-labs/mera";

const rpId = "account.example.com";

const { prfOutput } = await createPasskeyWithPrfOutput({
  rp: { id: rpId, name: "Example" },
  user: { name: "account@example.com", displayName: "Example account" },
  prfSalt: getDeterministicPrfSaltV1(),
});
```

Expect one authenticator prompt, sometimes two: authenticators that do not evaluate PRF at create time get a follow-up assertion with the same salt.

The salt here is mera's fixed deterministic one, and that choice is what makes the rest of this page repeatable. The same passkey, relying party, and salt always produce the same 32 bytes, on this device and on any device the passkey syncs to. The result also carries the credential's ID; [Derive accounts from one passkey](/recipes/derive-accounts/) shows how to store it and pin later sign-ins to this exact passkey.

## Derive an account

The PRF output is entropy. What happens next is the app's decision. This walkthrough uses the same mapping as the demo, BIP-39 and BIP-32, so the account it produces can be imported into wallet apps that speak those standards.

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

Any key-derivation scheme works here. This one is the demo's choice, and it is deliberate: interoperable standards mean the account has an exit path that does not depend on mera.

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

The next visit needs no stored secret. Rerun the assertion with the same salt and the same 32 bytes come back, and with them the same account.

```ts
import {
  getDeterministicPrfSaltV1,
  getPasskeyPrfOutput,
} from "@category-labs/mera";

const { prfOutput } = await getPasskeyPrfOutput({
  rpId,
  prfSalt: getDeterministicPrfSaltV1(),
});
```

With no `credential` in the call, the browser offers any discoverable passkey it holds for the relying party. That is fine for a first run; apps with returning users usually pin the stored credential ID instead.

## Where next

- [Derive accounts from one passkey](/recipes/derive-accounts/) extends this walkthrough: numbered accounts, credential pinning, Solana keys.
- [Derived and wrapped modes](/concepts/derived-and-wrapped/) explains when to reach for an encrypted vault instead of derivation.
- The [API reference](/reference/) covers every function used on this page.
