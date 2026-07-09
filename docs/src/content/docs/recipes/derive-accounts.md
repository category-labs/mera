---
title: Derive accounts from one passkey
description: Numbered EVM and Solana accounts from a single ceremony, with credential pinning.
---

This recipe extends [Getting started](/getting-started/) to a real multi-account setup: one passkey ceremony per session, numbered accounts on two curves, a stored credential record so sign-in pins the right passkey, and a clean lock at the end. The code is app-side throughout; mera provides the ceremonies and the signing sessions. Prerequisites: `@category-labs/mera`, `@scure/bip32`, `@scure/bip39`, and `@noble/hashes` installed, plus a PRF-capable authenticator ([authenticator support](/concepts/authenticator-support/)).

## Create the passkey

```ts
import {
  createPasskeyWithPrfOutput,
  getDeterministicPrfSaltV1,
} from "@category-labs/mera";

const rpId = location.hostname;

const created = await createPasskeyWithPrfOutput({
  rp: { id: rpId, name: "Example" },
  user: { name: "account@example.com", displayName: "Example account" },
  prfSalt: getDeterministicPrfSaltV1(),
});

// The seed comes from the sign-in assertion below, so this flow never uses
// the create-time PRF output; zero it right away.
created.prfOutput.fill(0);
```

`user.id` is left to its default, a fresh 32-byte random handle, so every create call makes a distinct, parallel passkey rather than silently overwriting an existing one.

## Remember the credential

Store the credential metadata. It holds no key material; its only job is letting the next sign-in pin the exact passkey instead of showing every discoverable credential for the domain.

```ts
localStorage.setItem(
  "app.derivedCredential",
  JSON.stringify({
    credentialId: created.credentialId,
    transports: created.transports,
  }),
);
```

`transports` is optional and only a hint: the browser uses it to reach the authenticator directly (a platform prompt for a platform passkey, a QR flow for a phone) instead of offering every option. Sign-in works the same without it.

A fresh device has no record; sign-in falls back to a discoverable ceremony, and the synced passkey still produces the same accounts.

## Sign in

```ts
import {
  getDeterministicPrfSaltV1,
  getPasskeyPrfOutput,
} from "@category-labs/mera";

const stored = localStorage.getItem("app.derivedCredential");
const known = stored ? JSON.parse(stored) : undefined;

const { prfOutput, credentialId } = await getPasskeyPrfOutput({
  rpId,
  credential: known,
  prfSalt: getDeterministicPrfSaltV1(),
});

// The ceremony reports which credential was actually used. Keep the record
// honest: the person may have picked a different passkey than the stored one.
const record =
  known?.credentialId === credentialId ? known : { credentialId };
localStorage.setItem("app.derivedCredential", JSON.stringify(record));
```

## Hold a master seed for the session

Turn the PRF output into a BIP-39 master seed once, zero the output, and keep the seed in memory for the session; deriving account 3 later is pure HD math with no further prompt.

```ts
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
prfOutput.fill(0);
```

`entropyToMnemonic` creates a phrase string on the way to the seed, and strings cannot be zeroed ([security model](/concepts/security-model/#strings-cannot-be-zeroed)); the phrase stays in memory until garbage collection.

## Derive numbered accounts

EVM accounts follow BIP-32 over the BIP-44 Ethereum path, the MetaMask convention:

```ts
import {
  createSecp256k1SigningSession,
  getEvmAddress,
} from "@category-labs/mera";
import { HDKey } from "@scure/bip32";

function deriveEvmAccount(seed: Uint8Array, index: number) {
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
  if (node.privateKey === null) throw new Error("derivation produced no key");
  const session = createSecp256k1SigningSession({
    // Copy out of the HDKey so the session can own and later zero it.
    consumePrivateKey: new Uint8Array(node.privateKey),
  });
  return { session, address: getEvmAddress(session.publicKey) };
}
```

Solana uses SLIP-0010 hardened Ed25519 derivation on `m/44'/501'/{index}'/0'`, the path Phantom and Solflare use. Ed25519 supports only hardened steps, so the implementation is a short HMAC chain:

```ts
import {
  createEd25519SigningSession,
  getSolanaAddress,
} from "@category-labs/mera";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

function deriveSolanaSeed(seed: Uint8Array, index: number): Uint8Array {
  let i = hmac(sha512, utf8ToBytes("ed25519 seed"), seed);
  for (const step of [44, 501, index, 0]) {
    const data = new Uint8Array(1 + 32 + 4);
    data.set(i.slice(0, 32), 1);
    new DataView(data.buffer).setUint32(33, (step + 0x80000000) >>> 0, false);
    i = hmac(sha512, i.slice(32), data);
  }
  return i.slice(0, 32);
}

function deriveSolanaAccount(seed: Uint8Array, index: number) {
  const session = createEd25519SigningSession({
    consumePrivateKey: deriveSolanaSeed(seed, index),
  });
  return { session, address: getSolanaAddress(session.publicKey) };
}
```

The derivation paths are an app choice; these two are the shared wallet conventions. A phrase imported into a wallet app that speaks them (MetaMask and Phantom are two) reproduces the same addresses, so accounts keep an exit path that does not depend on mera.

Build the account list from these helpers:

```ts
const accounts = [deriveEvmAccount(seed, 0), deriveSolanaAccount(seed, 0)];
```

## Lock everything

```ts
for (const account of accounts) {
  account.session.lock();
}
seed.fill(0);
```

Sessions zero their own key copies on `lock()`. The master seed is the app's buffer, so zeroing it is the app's job.

## Pitfalls

- **The derivation must never change after launch.** Every step between the PRF output and an address (the mnemonic mapping and the two derivation paths) is permanent: change any step and every account gets a different address.
- **Zero the PRF output as soon as the seed exists**, and the seed on lock. Between those two moments a compromised runtime can read them ([security model](/concepts/security-model/)).
- **Accounts reproduce only under the same rpId.** A domain migration silently orphans them; give accounts an export path first ([Reveal a recovery phrase](/recipes/reveal-a-recovery-phrase/)).
