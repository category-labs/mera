import type { Ed25519SigningSession } from "@category-labs/mera";
import {
  type Cluster,
  Connection,
  clusterApiUrl,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { cachePerNetwork, type NetworkMode } from "../network";

const SOLANA_MAINNET_RPC_URL = "https://solana-rpc.publicnode.com";

// Genesis hashes uniquely identify each Solana cluster. Mirrors the chain-id
// probe in `getEthereumContext` so the cluster is resolved from the RPC itself
// rather than guessed from the URL — many providers (Helius, publicnode, …)
// host all clusters under hostnames that don't contain the cluster name.
const GENESIS_HASH_TO_CLUSTER: Record<string, Cluster> = {
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d": "mainnet-beta",
  EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG: "devnet",
  "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY": "testnet",
};

type SolanaContext = {
  cluster: Cluster;
  connection: Connection;
  rpcUrl: string;
  symbol: "SOL";
};

function rpcUrlForMode(networkMode: NetworkMode): string {
  if (networkMode === "mainnet") {
    return (
      import.meta.env.VITE_SOLANA_MAINNET_RPC_URL ?? SOLANA_MAINNET_RPC_URL
    );
  }
  return import.meta.env.VITE_SOLANA_TESTNET_RPC_URL ?? clusterApiUrl("devnet");
}

async function resolveSolanaContext(
  networkMode: NetworkMode,
): Promise<SolanaContext> {
  const rpcUrl = rpcUrlForMode(networkMode);
  const connection = new Connection(rpcUrl, "confirmed");
  const genesis = await connection.getGenesisHash();
  const fallbackCluster: Cluster =
    networkMode === "mainnet" ? "mainnet-beta" : "devnet";
  const cluster = GENESIS_HASH_TO_CLUSTER[genesis] ?? fallbackCluster;
  return { cluster, connection, rpcUrl, symbol: "SOL" };
}

/**
 * Resolves the Solana cluster by reading the genesis hash from the configured
 * RPC, then caches it; reused on later calls for the same network.
 */
const getSolanaContext = cachePerNetwork(resolveSolanaContext);

/** Reads the SOL balance for a base58 address in lamports. */
async function getSolBalance(
  connection: Connection,
  address: string,
): Promise<bigint> {
  const balance = await connection.getBalance(new PublicKey(address));
  return BigInt(balance);
}

type SendSolOptions = {
  connection: Connection;
  session: Ed25519SigningSession;
  fromAddress: string;
  toAddress: string;
  lamports: bigint;
};

/**
 * Builds, signs, and broadcasts a SOL transfer using the passkey-derived Ed25519 session.
 *
 * The serialized signed transaction is returned alongside the signature so the demo
 * can show "signed locally" alongside the broadcast result.
 */
async function sendSol({
  connection,
  session,
  fromAddress,
  toAddress,
  lamports,
}: SendSolOptions): Promise<{ signature: string; serialized: Uint8Array }> {
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
  const serialized = transaction.serialize();
  const sig = await connection.sendRawTransaction(serialized);

  return { signature: sig, serialized };
}

/** Builds a Solana Explorer URL for a transaction signature. */
function explorerTxUrl(cluster: Cluster, signature: string): string {
  if (cluster === "mainnet-beta") {
    return `https://explorer.solana.com/tx/${signature}`;
  }
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

/** Full display name for the cluster, including the "Solana" prefix (e.g. "Solana Devnet"). */
function clusterDisplayName(cluster: Cluster): string {
  return `Solana ${clusterShortName(cluster)}`;
}

/** Short cluster name without the "Solana" prefix (e.g. "Devnet"). */
function clusterShortName(cluster: Cluster): string {
  if (cluster === "mainnet-beta") return "Mainnet";
  if (cluster === "devnet") return "Devnet";
  return "Testnet";
}

export type { SolanaContext };
export {
  clusterDisplayName,
  clusterShortName,
  explorerTxUrl,
  getSolanaContext,
  getSolBalance,
  sendSol,
};
