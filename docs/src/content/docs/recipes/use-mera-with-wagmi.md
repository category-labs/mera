---
title: Use mera with wagmi
description: Connect a passkey account to a wagmi app.
---

The [`mera`](/reference/mera/) connector turns a [passkey account](/concepts/passkey-accounts/) into a wagmi connection, so wagmi's actions and hooks sign with it as they do with a wallet app.

Prerequisites:

- `@category-labs/mera`, `@wagmi/core` 3, and `viem` installed. React apps install `wagmi`, which brings `@wagmi/core`.
- A [PRF](/concepts/passkeys-and-prf/)-capable authenticator ([authenticator support](/authenticator-support/)).

## Add the connector

```ts
import { mera } from "@category-labs/mera/wagmi";
import { createConfig, http } from "@wagmi/core";
import { sepolia } from "viem/chains";

const rpId = "account.example.com";

export const config = createConfig({
  chains: [sepolia],
  connectors: [mera({ rp: { id: rpId, name: "Example" } })],
  transports: { [sepolia.id]: http() },
});

export const [passkey] = config.connectors;
```

## Create an account

`connect` with `create` creates a passkey and connects its account:

```ts
import type { mera } from "@category-labs/mera/wagmi";
import type { Config, Connector } from "@wagmi/core";

declare const config: Config;
declare const passkey: Connector<ReturnType<typeof mera>>;

// ---cut---
import { connect } from "@wagmi/core";

const { accounts } = await connect(config, {
  connector: passkey,
  create: {
    user: { name: "account@example.com", displayName: "Example account" },
  },
});
```

A returning visitor connects without `create`, and the browser offers the passkeys it holds for the relying party:

```ts
import type { mera } from "@category-labs/mera/wagmi";
import type { Config, Connector } from "@wagmi/core";

declare const config: Config;
declare const passkey: Connector<ReturnType<typeof mera>>;

// ---cut---
import { connect } from "@wagmi/core";

await connect(config, { connector: passkey });
```

## Sign and send

Signing works through wagmi's usual actions, and each one asks for the passkey:

```ts
import type { Config } from "@wagmi/core";

declare const config: Config;

// ---cut---
import { sendTransaction, signMessage } from "@wagmi/core";
import { parseEther } from "viem";

const signature = await signMessage(config, { message: "Sign in to Example" });

const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const hash = await sendTransaction(config, {
  to: recipient,
  value: parseEther("0.01"),
});
```

After a page load, `reconnect`, which wagmi's React provider runs on mount, restores the account without a prompt.

## Handle a dismissed prompt

A dismissed or timed-out prompt rejects with viem's `UserRejectedRequestError`, the error a wallet app gives when the person declines. Other failures reject with a [`MeraError`](/reference/errors/#meraerror), such as [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable) for an authenticator without PRF:

```ts
import type { mera } from "@category-labs/mera/wagmi";
import type { Config, Connector } from "@wagmi/core";

declare const config: Config;
declare const passkey: Connector<ReturnType<typeof mera>>;

// ---cut---
import { MeraError } from "@category-labs/mera";
import { connect } from "@wagmi/core";
import { UserRejectedRequestError } from "viem";

try {
  await connect(config, { connector: passkey });
} catch (error) {
  if (error instanceof UserRejectedRequestError) {
    // The person closed the prompt, or had no passkey to offer.
  } else if (error instanceof MeraError && error.code === "PRF_UNAVAILABLE") {
    // Point at a PRF-capable authenticator.
  } else {
    throw error;
  }
}
```

## Pad gas estimates

The connector sends transactions through viem with the config's chain, so a chain's `prepareTransactionRequest` hook applies to them. On a chain that charges the full gas limit, such as Monad, the hook can add a margin to each estimate:

```ts
import { defineChain } from "viem";
import { monad as monadBase } from "viem/chains";

const monad = defineChain({
  ...monadBase,
  prepareTransactionRequest: [
    async (request) => ({
      ...request,
      gas: request.gas === undefined ? undefined : (request.gas * 11n) / 10n,
    }),
    { runAt: ["afterFillParameters"] },
  ],
});
```

## Disconnect

`disconnect(config)` deletes the stored account, so the next page load does not reconnect.

## See also

- [mera](/reference/mera/): every provider method the connector answers, and its limits.
- [Send a transaction with viem](/recipes/send-a-transaction-with-viem/): the same account in an app without wagmi.
- [Signing sessions](/concepts/signing-sessions/): how long a session holds the key, and the trade-off.
