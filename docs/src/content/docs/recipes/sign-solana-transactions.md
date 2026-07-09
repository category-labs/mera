---
title: Sign Solana transactions
description: Plug an Ed25519 signing session into a web3.js transaction flow.
---

A Solana transaction is signed by Ed25519 over its serialized message, which is exactly what [signMessage](/reference/create-ed25519-signing-session/#signmessagemessage) signs: it takes the raw message bytes and returns the 64-byte signature. The session's public key doubles as the fee-payer address. Prerequisites: `@solana/web3.js` and `buffer` installed and an unlocked Ed25519 session ([Derive accounts from one passkey](/recipes/derive-accounts/) produces one). In the browser, web3.js needs a `Buffer` polyfill; the example imports it from the `buffer` package.

## Build, sign, serialize

Adapted from the demo's transfer flow:

```ts
import type { Ed25519SigningSession } from "@category-labs/mera";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";

async function signSolTransfer(options: {
  connection: Connection;
  session: Ed25519SigningSession;
  fromAddress: string;
  toAddress: string;
  lamports: bigint;
}): Promise<Uint8Array> {
  const { connection, session, fromAddress, toAddress, lamports } = options;
  const fromPubkey = new PublicKey(fromAddress);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  const transaction = new Transaction({
    feePayer: fromPubkey,
    blockhash,
    lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey: new PublicKey(toAddress),
      lamports,
    }),
  );

  const signature = await session.signMessage(transaction.serializeMessage());
  transaction.addSignature(fromPubkey, Buffer.from(signature));
  return transaction.serialize();
}
```

`fromAddress` is `getSolanaAddress(session.publicKey)`. The message bytes go to the session raw: Ed25519 hashes internally, so there is no digest step, and the signature comes back as 64 bytes ready for `addSignature`.

## Broadcast

```ts
import { getSolanaAddress } from "@category-labs/mera";
import { clusterApiUrl } from "@solana/web3.js";

async function sendSolTransfer(
  session: Ed25519SigningSession,
  recipient: string,
): Promise<string> {
  const connection = new Connection(clusterApiUrl("devnet"));
  const serialized = await signSolTransfer({
    connection,
    session,
    fromAddress: getSolanaAddress(session.publicKey),
    toAddress: recipient,
    lamports: 1_000_000n,
  });
  return connection.sendRawTransaction(serialized);
}
```

Signing and broadcasting stay separate: the app can show or persist the signed transaction even when the broadcast then fails, and retries re-send the same bytes instead of prompting for anything.

## Notes

- No passkey prompt happens here; the ceremony ran when the session was created, and signing is silent until `session.lock()`.
- `serialize()` verifies signatures against the message, so a wrong fee payer or a stale blockhash surfaces at signing time rather than on-chain.

## See also

- [createEd25519SigningSession](/reference/create-ed25519-signing-session/)
- [getSolanaAddress](/reference/get-solana-address/)
