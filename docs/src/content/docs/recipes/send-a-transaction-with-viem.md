---
title: Send a transaction with viem
description: Sign in with a passkey, derive the first EVM account, and send a transaction through viem.
---

This recipe turns a passkey sign-in into a sent transaction. Prerequisites: `@category-labs/mera`, `viem`, `@scure/bip32`, and `@scure/bip39` installed, a PRF-capable authenticator ([authenticator support](/authenticator-support/)), an existing passkey ([Create passkey accounts](/recipes/create-passkey-accounts/) covers the first visit), and test funds on the sending address. PRF is the [WebAuthn](https://www.w3.org/TR/webauthn-3/) extension that makes a passkey return deterministic secret bytes; [Passkeys and PRF](/concepts/passkeys-and-prf/) explains the mechanism.

[viem](https://viem.sh) is a TypeScript client library for EVM chains (chains that run the Ethereum Virtual Machine); [toViemAccount](/reference/to-viem-account/) adapts a [signing session](/concepts/signing-sessions/) into the account shape viem accepts, so viem signs and broadcasts while the key stays in the session. Derivation and client setup are app-owned; mera provides the ceremony, the session, and the adapter.

## Sign in

```ts
import { getPasskeyPrfOutput } from "@category-labs/mera";

const rpId = location.hostname;

const { prfOutput } = await getPasskeyPrfOutput({ rpId });
```

The call runs one ceremony with one user-verification prompt, the only prompt in this recipe. Without `credential`, the browser offers every discoverable passkey for the domain; [Create passkey accounts](/recipes/create-passkey-accounts/) shows pinning the stored credential ID.

## Derive the key

The seed comes from the same mapping [Create passkey accounts](/recipes/create-passkey-accounts/) uses: the PRF output becomes [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) entropy, the seed feeds [BIP-32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki), and `m/44'/60'/0'/0/0` is the [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki) Ethereum path ([Entropy, keys, and accounts](/concepts/entropy-keys-and-accounts/) introduces the standards). Matching that recipe exactly means both flows reach the same address.

```ts
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
prfOutput.fill(0);

const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
if (node.privateKey === null) throw new Error("derivation produced no key");
```

`entropyToMnemonic` creates a phrase string on the way to the seed, and strings cannot be zeroed ([security model](/concepts/security-model/#strings-cannot-be-zeroed)); the buffers are [zeroed](/concepts/security-model/#what-the-library-handles) as soon as each one has served its purpose.

## Create the viem account

`toViemAccount` lives in the `@category-labs/mera/viem` entry point, which requires the optional `viem` peer dependency; the root entry point does not use viem.

```ts
import { createSecp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";

const session = createSecp256k1SigningSession({
  consumePrivateKey: node.privateKey,
});
seed.fill(0);

const account = toViemAccount(session);
```

Construction consumes the private key and zeroes the input buffer. The returned account signs transactions, messages, and typed data through `session.signDigest`; the [toViemAccount reference](/reference/to-viem-account/) documents each method.

## Send the transaction

```ts
import { createWalletClient, http, parseEther } from "viem";
import { sepolia } from "viem/chains";

const client = createWalletClient({
  account,
  chain: sepolia,
  transport: http(),
});

const hash = await client.sendTransaction({
  to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // stand-in for a recipient address
  value: parseEther("0.01"),
});

session.lock();
```

`sepolia` is Ethereum's Sepolia test network, and `http()` with no URL uses the chain's default public RPC endpoint (RPC, remote procedure call, is the HTTP API a chain node exposes for queries and transactions); production apps pass a dedicated RPC URL. Signing shows no passkey prompt: the one prompt happened at sign-in, and the session covers every signature until it is locked.

`sendTransaction` fills the missing transaction fields from the RPC, signs through the session, broadcasts, and resolves to the transaction hash. Confirmation is a separate query; viem's `waitForTransactionReceipt` on a public client covers it.

## Pitfalls

- **The derivation must match the app's other sign-in paths.** This recipe repeats the mapping and path from [Create passkey accounts](/recipes/create-passkey-accounts/); a different mapping or path reaches a different address.
- **A locked session rejects every viem signing method** with [`SESSION_LOCKED`](/reference/errors/#session_locked), and the account has no key of its own. Keep the session for the active burst of work, lock it when the burst ends, and build a new session from a fresh ceremony for the next one ([Signing sessions](/concepts/signing-sessions/)).
- **Concurrent transactions can be assigned the same nonce**, the per-account counter that orders transactions, and the chain accepts only one of them. viem's nonce manager assigns nonces in sequence; pass it through [toViemAccount](/reference/to-viem-account/) options.

## See also

- [toViemAccount](/reference/to-viem-account/): every signing method the account implements, and the adapter contract.
- [Create passkey accounts](/recipes/create-passkey-accounts/): the first visit, credential pinning, and numbered accounts.
- [Signing sessions](/concepts/signing-sessions/): the custody model and how long to hold a session.
