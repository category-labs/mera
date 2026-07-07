---
title: Derive accounts from one passkey
description: Numbered EVM and Solana accounts from a single ceremony, with credential pinning.
---

This recipe extends [Getting started](/getting-started/) to a real multi-account setup: one passkey ceremony per session, numbered accounts on two curves, a stored credential record so sign-in pins the right passkey, and a clean lock at the end. The pattern is adapted from the demo app and is app-side code throughout; mera contributes the ceremonies and the signing sessions.

Prerequisites: `@category-labs/mera`, `@scure/bip32`, `@scure/bip39`, and `@noble/hashes` installed, plus a PRF-capable authenticator ([authenticator support](/concepts/authenticator-support/)).

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

A fresh device has no record and that is fine: sign-in falls back to a discoverable ceremony, and the synced passkey still produces the same accounts.

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

## Hold a master seed, not the PRF output

One ceremony per session is the whole point. Turn the PRF output into a BIP-39 master seed once, zero the output, and keep the seed in memory for the session. Deriving account 3 later is pure HD math with no further prompt.

```ts
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
prfOutput.fill(0);
```

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

Both derivations are the demo's choice, and the choice is deliberate: the same phrase imported into a wallet app that speaks these standards (MetaMask and Phantom are two) reproduces the same addresses, so accounts keep an exit path that does not depend on mera.

## Lock everything

```ts
for (const account of accounts) {
  account.session.lock();
}
seed.fill(0);
```

Sessions zero their own key copies on `lock()`. The master seed is the app's buffer, so zeroing it is the app's job.

## Pitfalls

- **The mapping is consensus-critical.** PRF output to mnemonic, and the two derivation paths: change any of it after launch and every address changes. Ship it once.
- **Zero the PRF output as soon as the seed exists**, and the seed on lock. Between those two moments, a compromised runtime can read them; the [security model](/concepts/security-model/) draws that boundary precisely.
- **Accounts reproduce only under the same rpId.** A domain migration silently orphans them; give accounts an export path first ([Reveal a recovery phrase](/recipes/reveal-a-recovery-phrase/)).
