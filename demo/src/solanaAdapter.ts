import {
  type Ed25519SigningSession,
  isSolanaAddress,
} from "@category-labs/mera";
import { formatDecimalAmount, parseDecimalAmount } from "./amount";
import type { ChainAdapter } from "./ChainAccountCard";
import {
  clusterDisplayName,
  explorerTxUrl,
  getSolBalance,
  type SolanaContext,
  signSolTransfer,
} from "./chains/solana";
import { bytesToBase64 } from "./ui";

// Solana charges 5000 lamports per signature; a basic transfer needs one.
const TRANSFER_FEE_LAMPORTS = 5000n;
const SOLANA_FAUCET_URL = "https://faucet.solana.com/";
const SOL_DECIMALS = 9;

/**
 * Builds the Solana `ChainAdapter` for one account: balance reads from the
 * context's connection with a flat per-signature fee reserve, passkey signing,
 * and raw-transaction broadcast.
 */
function createSolanaAdapter(
  session: Ed25519SigningSession,
  address: string,
  solana: SolanaContext,
): ChainAdapter {
  return {
    chainName: "Solana",
    badgeClassName: "badge chain-solana",
    symbol: solana.symbol,
    networkName: clusterDisplayName(solana.cluster),
    faucetUrl: SOLANA_FAUCET_URL,
    faucetText: `Get devnet ${solana.symbol} ↗`,
    recipientPlaceholder: "Solana address…",
    balanceTooLowError: "Balance is too low to cover the fee",
    isValidRecipient: isSolanaAddress,
    parseAmount: (text) => parseDecimalAmount(text, SOL_DECIMALS),
    formatAmount: (amount) => formatDecimalAmount(amount, SOL_DECIMALS),
    async fetchBalance() {
      return {
        balance: await getSolBalance(solana.connection, address),
        feeReserve: TRANSFER_FEE_LAMPORTS,
      };
    },
    async signTransfer(to, lamports) {
      const serialized = await signSolTransfer({
        connection: solana.connection,
        session,
        fromAddress: address,
        toAddress: to,
        lamports,
      });
      return {
        signed: bytesToBase64(serialized),
        broadcast: () => solana.connection.sendRawTransaction(serialized),
      };
    },
    explorerTxUrl: (signature) => explorerTxUrl(solana.cluster, signature),
  };
}

export { createSolanaAdapter };
