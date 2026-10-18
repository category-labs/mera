---
title: Send a transaction with viem
description: Send an EVM transaction from a passkey account with viem.
---

[toViemAccount](/reference/to-viem-account/) adapts a [signing session](/concepts/signing-sessions/) into the account shape [viem](https://viem.sh) accepts, so viem signs and broadcasts while the session owns the key.

## Sign in

```ts
import { getPasskeyPrfOutput } from "@category-labs/mera";

const rpId = location.hostname;

const { prfOutput } = await getPasskeyPrfOutput({ rpId });
```

## Derive the key

[deriveEvmPrivateKey](/reference/derive-evm-private-key/) derives the key of the first EVM account.

```ts
declare const prfOutput: Uint8Array;

// ---cut---
import { deriveEvmPrivateKey } from "@category-labs/mera";

const privateKey = deriveEvmPrivateKey({ prfOutput, accountIndex: 0 });
```

## Create the viem account

`toViemAccount` lives in the `@category-labs/mera/viem` entry point, which requires the optional `viem` peer dependency.

```ts
declare const privateKey: Uint8Array;

// ---cut---
import { createSecp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";

const session = createSecp256k1SigningSession({ privateKey });

const account = toViemAccount(session);
```

## Send the transaction

```ts
import type { Secp256k1SigningSession } from "@category-labs/mera";
import type { LocalAccount } from "viem";

declare const account: LocalAccount;
declare const session: Secp256k1SigningSession;

// ---cut---
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
