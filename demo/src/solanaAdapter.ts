import {
  type Ed25519SigningSession,
  isSolanaAddress,
} from "@category-labs/mera";
import type { Connection } from "@solana/web3.js";
import { formatDecimalAmount, parseDecimalAmount } from "./amount";
import type { ChainAdapter } from "./ChainAccountCard";
import {
  airdropSol,
  getSolBalance,
  hasSignatureHistory,
  signSolTransfer,
} from "./chains/solana";
import { createFundingGate } from "./funding";
import { bytesToBase64 } from "./ui";

// Solana charges 5000 lamports per signature; a basic transfer needs one.
const TRANSFER_FEE_LAMPORTS = 5000n;
const SOL_DECIMALS = 9;
// Balances below 10 DEMON are topped up with a 100 DEMON airdrop, but only
// while the address has no transaction history. The airdrop itself creates
// history, so an address is funded at most once per ledger; validator
// restarts reset the ledger and re-arm funding.
const MIN_BALANCE_LAMPORTS = 10n * 10n ** 9n;
const TOP_UP_LAMPORTS = 100n * 10n ** 9n;

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
  const ensureFunded = createFundingGate({
    minBalance: MIN_BALANCE_LAMPORTS,
    hasActivity: () => hasSignatureHistory(connection, address),
    fund: () => airdropSol(connection, address, TOP_UP_LAMPORTS),
    readBalance: () => getSolBalance(connection, address),
  });
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
      const balance = await getSolBalance(connection, address);
      return {
        balance: await ensureFunded(balance),
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
