---
title: Send a transaction with viem
description: Send an EVM transaction from a passkey account with viem.
---

mera exports an adapter function [toViemAccount](/reference/to-viem-account/) that adapts a [signing session](/concepts/signing-sessions/) into the account shape [viem](https://viem.sh) accepts, so viem signs and broadcasts while the key is owned by the session.

## Sign in

```ts
import { getPasskeyPrfOutput } from "@category-labs/mera";

const rpId = location.hostname;

const { prfOutput } = await getPasskeyPrfOutput({ rpId });
```

## Derive the key

The seed and path come from the same mapping [Create passkey accounts](/recipes/create-passkey-accounts/) uses ([Keys and accounts](/concepts/entropy-keys-and-accounts/) introduces the standards).

```ts
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const firstEthereumAccountPath = "m/44'/60'/0'/0/0";

const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));

const node = HDKey.fromMasterSeed(seed).derive(firstEthereumAccountPath);
if (node.privateKey === null) throw new Error("derivation produced no key");
```

## Create the viem account

`toViemAccount` lives in the `@category-labs/mera/viem` entry point, which requires the optional `viem` peer dependency.

```ts
import { createSecp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";

const session = createSecp256k1SigningSession({
  privateKey: node.privateKey,
});

const account = toViemAccount(session);
```

## Send the transaction

```ts
import { createWalletClient, http, parseEther } from "viem";
import { sepolia } from "viem/chains";

const client = createWalletClient({
  account,
  chain: sepolia,
  transport: http(),
});

const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const hash = await client.sendTransaction({
  to: recipient,
  value: parseEther("0.01"),
});

session.end();
```

`sendTransaction` fills the missing transaction fields from the RPC, signs through the session and broadcasts.

## See also

- [toViemAccount](/reference/to-viem-account/): every signing method the account implements, and the adapter contract.
- [Create passkey accounts](/recipes/create-passkey-accounts/): the first visit, credential pinning, and numbered accounts.
- [Signing sessions](/concepts/signing-sessions/): how a session owns the key and how long to hold one.
