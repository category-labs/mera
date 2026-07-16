import {
  type Ed25519SigningSession,
  isSolanaAddress,
} from "@category-labs/mera";
import type { Connection } from "@solana/web3.js";
import { formatDecimalAmount, parseDecimalAmount } from "./amount";
import type { ChainAdapter } from "./ChainAccountCard";
import { getSolBalance, signSolTransfer } from "./chains/solana";
import { bytesToBase64 } from "./ui";

// Solana charges 5000 lamports per signature; a basic transfer needs one.
const TRANSFER_FEE_LAMPORTS = 5000n;
const SOL_DECIMALS = 9;

/**
 * Builds the Solana `ChainAdapter` for one account: balance reads from the
 * connection with a flat per-signature fee reserve, passkey signing, and
 * raw-transaction broadcast.
 */
function createSolanaAdapter(
  session: Ed25519SigningSession,
  address: string,
  connection: Connection,
): ChainAdapter {
  return {
    chainName: "Solana",
    badgeClassName: "badge chain-solana",
    // The private network's native token; both demo networks use the same
    // play-money symbol.
    symbol: "DEMON",
    recipientPlaceholder: "Solana address…",
    balanceTooLowError: "Balance is too low to cover the fee.",
    isValidRecipient: isSolanaAddress,
    parseAmount: (text) => parseDecimalAmount(text, SOL_DECIMALS),
    formatAmount: (amount) => formatDecimalAmount(amount, SOL_DECIMALS),
    async fetchBalance() {
      return {
        balance: await getSolBalance(connection, address),
        feeReserve: TRANSFER_FEE_LAMPORTS,
      };
    },
    async signTransfer(to, lamports) {
      const serialized = await signSolTransfer({
        connection,
        session,
        fromAddress: address,
        toAddress: to,
        lamports,
      });
      return {
        signed: bytesToBase64(serialized),
        broadcast: () => connection.sendRawTransaction(serialized),
      };
    },
  };
}

export { createSolanaAdapter };
