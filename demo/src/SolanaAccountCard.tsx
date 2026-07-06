import {
  type Ed25519SigningSession,
  isSolanaAddress,
} from "@category-labs/mera";
import { type ReactElement, useMemo } from "react";
import { ChainAccountCard, type ChainAdapter } from "./ChainAccountCard";
import {
  clusterDisplayName,
  explorerTxUrl,
  getSolBalance,
  type SolanaContext,
  sendSol,
} from "./chains/solana";
import type { AccountMode } from "./connect";
import { formatSol, parseSolAmount } from "./solanaAmount";
import { bytesToBase64 } from "./ui";

// Solana charges 5000 lamports per signature; a basic transfer needs one.
const TRANSFER_FEE_LAMPORTS = 5000n;
const SOLANA_FAUCET_URL = "https://faucet.solana.com/";

type SolanaAccountCardProps = {
  session: Ed25519SigningSession;
  address: string;
  mode: AccountMode;
  solana: SolanaContext;
  isTestnet: boolean;
  /** A self-owned recipient to pre-fill (testnet, derived mode); absent otherwise. */
  suggestedRecipient?: string;
  suggestedLabel?: string;
  /** Reveals the suggested recipient account after a send (switch to it or add it). */
  onRevealRecipient?: () => void;
  onLock: () => void;
};

/** Account view for a Solana passkey session: address, balance, receive QR, send form. */
function SolanaAccountCard({
  session,
  address,
  mode,
  solana,
  isTestnet,
  suggestedRecipient,
  suggestedLabel,
  onRevealRecipient,
  onLock,
}: SolanaAccountCardProps): ReactElement {
  const adapter = useMemo<ChainAdapter>(
    () => ({
      chainName: "Solana",
      badgeClassName: "badge chain-solana",
      symbol: solana.symbol,
      networkName: clusterDisplayName(solana.cluster),
      faucetUrl: SOLANA_FAUCET_URL,
      faucetText: `Get devnet ${solana.symbol} ↗`,
      recipientPlaceholder: "Solana address…",
      balanceRefreshMs: 10_000,
      suggestedSendAmount: "0.01",
      balanceTooLowError: "Balance is too low to cover the fee",
      isValidRecipient: isSolanaAddress,
      parseAmount: parseSolAmount,
      formatAmount: formatSol,
      async fetchBalance() {
        return {
          balance: await getSolBalance(solana.connection, address),
          feeReserve: TRANSFER_FEE_LAMPORTS,
        };
      },
      async send(to, lamports, onSigned) {
        const { signature, serialized } = await sendSol({
          connection: solana.connection,
          session,
          fromAddress: address,
          toAddress: to,
          lamports,
        });
        onSigned(bytesToBase64(serialized));
        return signature;
      },
      explorerTxUrl: (signature) => explorerTxUrl(solana.cluster, signature),
    }),
    [session, address, solana],
  );

  return (
    <ChainAccountCard
      adapter={adapter}
      address={address}
      mode={mode}
      isTestnet={isTestnet}
      suggestedRecipient={suggestedRecipient}
      suggestedLabel={suggestedLabel}
      onRevealRecipient={onRevealRecipient}
      onLock={onLock}
    />
  );
}

export { SolanaAccountCard };
