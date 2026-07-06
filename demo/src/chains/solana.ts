import type { Ed25519SigningSession } from "@category-labs/mera";
import {
  type Cluster,
  Connection,
  clusterApiUrl,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
// biome-ignore lint/style/useNodejsImportProtocol: Vite maps the bare "buffer" specifier to the browser Buffer polyfill; "node:buffer" would bypass the alias.
import { Buffer } from "buffer";
import { cachePerNetwork, type NetworkMode } from "../network";

const SOLANA_MAINNET_RPC_URL = "https://solana-rpc.publicnode.com";

// Each Solana cluster the demo recognizes, keyed by genesis hash and tagged
// with the network mode it belongs to. Resolution looks the RPC's genesis hash
// up here and requires the mode to match, so the "Testnet"/"Mainnet" toggle can
// never disagree with the cluster that is signed for and broadcast to. Mirrors
// the chain-id table in `ethereum.ts`.
//
// The genesis hash identifies the cluster from the RPC itself rather than
// guessing from the URL — many providers (Helius, publicnode, …) host every
// cluster under hostnames that don't contain the cluster name.
const KNOWN_CLUSTERS: Record<string, { cluster: Cluster; mode: NetworkMode }> =
  {
    "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d": {
      cluster: "mainnet-beta",
      mode: "mainnet",
    },
    EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG: {
      cluster: "devnet",
      mode: "testnet",
    },
    "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY": {
      cluster: "testnet",
      mode: "testnet",
    },
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
  const known = KNOWN_CLUSTERS[genesis];
  if (!known) {
    throw new Error(
      `The ${networkMode} RPC is on genesis hash ${genesis}, which the demo doesn't recognize.`,
    );
  }
  if (known.mode !== networkMode) {
    throw new Error(
      `The ${networkMode} RPC is on the ${known.cluster} cluster, which belongs to ${known.mode}.`,
    );
  }
  return { cluster: known.cluster, connection, rpcUrl, symbol: "SOL" };
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

/** Full display name for the cluster (e.g. "Solana Devnet"). */
function clusterDisplayName(cluster: Cluster): string {
  if (cluster === "mainnet-beta") return "Solana Mainnet";
  if (cluster === "devnet") return "Solana Devnet";
  return "Solana Testnet";
}

export type { SolanaContext };
export {
  clusterDisplayName,
  explorerTxUrl,
  getSolanaContext,
  getSolBalance,
  sendSol,
};
