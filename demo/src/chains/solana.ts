import type { Ed25519SigningSession } from "@category-labs/mera";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
// biome-ignore lint/style/useNodejsImportProtocol: Vite maps the bare "buffer" specifier to the browser Buffer polyfill; "node:buffer" would bypass the alias.
import { Buffer } from "buffer";

// The demo's private Solana network. State is wiped on every restart, so
// nothing on it holds value. Override via demo/.env to run against a local
// network.
const RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL ??
  "https://solana-network-production.up.railway.app";

/**
 * Connects to the demo network. The version read probes connectivity, so an
 * unreachable endpoint fails here (and shows on the card) rather than in the
 * first balance read.
 */
async function resolveSolanaConnection(): Promise<Connection> {
  const connection = new Connection(RPC_URL, "confirmed");
  await connection.getVersion();
  return connection;
}

/** Reads the SOL balance for a base58 address in lamports. */
async function getSolBalance(
  connection: Connection,
  address: string,
): Promise<bigint> {
  const balance = await connection.getBalance(new PublicKey(address));
  return BigInt(balance);
}

type SignSolTransferOptions = {
  connection: Connection;
  session: Ed25519SigningSession;
  fromAddress: string;
  toAddress: string;
  lamports: bigint;
};

/**
 * Builds and signs a SOL transfer using the passkey-derived Ed25519 session,
 * returning the serialized signed transaction. Broadcasting is left to the
 * caller (via `Connection.sendRawTransaction`) so the signed transaction can
 * be shown even when the broadcast then fails.
 */
async function signSolTransfer({
  connection,
  session,
  fromAddress,
  toAddress,
  lamports,
}: SignSolTransferOptions): Promise<Uint8Array> {
  const fromPubkey = new PublicKey(fromAddress);
  const toPubkey = new PublicKey(toAddress);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  const transaction = new Transaction({
    feePayer: fromPubkey,
    blockhash,
    lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports,
    }),
  );

  const messageBytes = transaction.serializeMessage();
  const signature = await session.signMessage(messageBytes);

  transaction.addSignature(fromPubkey, Buffer.from(signature));
  return transaction.serialize();
}

export { getSolBalance, resolveSolanaConnection, signSolTransfer };
