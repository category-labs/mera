---
title: Send a transaction with viem
description: Sign in with a passkey, derive the first EVM account, and send a transaction through viem.
---

This recipe turns a passkey sign-in into a sent transaction. [viem](https://viem.sh) is a TypeScript client library for [EVM](/concepts/entropy-keys-and-accounts/) chains; [toViemAccount](/reference/to-viem-account/) adapts a [signing session](/concepts/signing-sessions/) into the account shape viem accepts, so viem signs and broadcasts while the key stays in the session.

Prerequisites:

- `@category-labs/mera`, `viem`, `@scure/bip32`, and `@scure/bip39` installed.
- A [PRF](/concepts/passkeys-and-prf/)-capable authenticator ([authenticator support](/authenticator-support/)).
- An existing passkey ([Create passkey accounts](/recipes/create-passkey-accounts/) covers the first visit).
- Test funds on the sending address.

## Sign in

```ts
import { getPasskeyPrfOutput } from "@category-labs/mera";

const rpId = location.hostname;

const { prfOutput } = await getPasskeyPrfOutput({ rpId });
```

The call runs one ceremony, the only prompt in this recipe. [Create passkey accounts](/recipes/create-passkey-accounts/) shows pinning the sign-in to a stored credential ID.

## Derive the key

The seed and path come from the same mapping [Create passkey accounts](/recipes/create-passkey-accounts/) uses ([Entropy, keys, and accounts](/concepts/entropy-keys-and-accounts/) introduces the standards).

```ts
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const firstEthereumAccountPath = "m/44'/60'/0'/0/0";

const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
prfOutput.fill(0);

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
seed.fill(0);

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

session.lock();
```

`http()` with no URL uses the chain's default public RPC endpoint. Production apps pass a dedicated RPC URL.

`sendTransaction` fills the missing transaction fields from the RPC, signs through the session, broadcasts, and resolves to the transaction hash. Confirmation is a separate query. viem's `waitForTransactionReceipt` on a public client covers it.

## Pitfalls

- **The derivation must match the app's other sign-in paths.** A different mapping or path reaches a different address.
- **A locked session rejects every viem signing method** with [`SESSION_LOCKED`](/reference/errors/#session_locked): the account holds no key of its own and cannot sign without the session.
- **Concurrent transactions can be assigned the same nonce**, the per-account counter that orders transactions, and the chain accepts only one of them. viem's nonce manager assigns nonces in sequence. Pass it through [toViemAccount](/reference/to-viem-account/) options.

## See also

- [toViemAccount](/reference/to-viem-account/): every signing method the account implements, and the adapter contract.
- [Create passkey accounts](/recipes/create-passkey-accounts/): the first visit, credential pinning, and numbered accounts.
- [Signing sessions](/concepts/signing-sessions/): how a session owns the key and how long to hold one.
