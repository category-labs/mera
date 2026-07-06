import {
  type Ed25519SigningSession,
  isSolanaAddress,
} from "@category-labs/mera";
import { type ReactElement, useCallback, useState } from "react";
import { AccountCardShell } from "./AccountCardShell";
import {
  type SuggestedRecipientProps,
  useBalancePolling,
  useSuggestedRecipient,
} from "./accountCardShared";
import {
  clusterDisplayName,
  explorerTxUrl,
  getSolBalance,
  type SolanaContext,
  sendSol,
} from "./chains/solana";
import { type AccountMode, describeError } from "./connect";
import { formatSol, parseSolAmount } from "./solanaAmount";
import { bytesToBase64, trimAmount } from "./ui";

// Solana charges 5000 lamports per signature; a basic transfer needs one.
const TRANSFER_FEE_LAMPORTS = 5000n;
const SOLANA_FAUCET_URL = "https://faucet.solana.com/";

type SolanaAccountCardProps = SuggestedRecipientProps & {
  session: Ed25519SigningSession;
  address: string;
  mode: AccountMode;
  solana: SolanaContext;
  isTestnet: boolean;
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
  // Lamports as the source of truth: parseSolAmount rejects "0" (it's a send
  // validator), which would misread a funded-but-empty account as unknown.
  const [balanceLamports, setBalanceLamports] = useState<bigint | null>(null);
  const {
    to,
    setTo,
    amount,
    setAmount,
    showChip,
    switchToManual,
    restoreSuggestion,
  } = useSuggestedRecipient(suggestedRecipient);
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendLamports = parseSolAmount(amount);
  // Testnet gates Send on a *known* balance that covers amount + the transfer
  // fee, and prompts the faucet when it doesn't. Mainnet is unchanged. `covered`
  // is false while the balance is still null (loading/failed), so Send stays
  // disabled until we actually know there are funds.
  const covered =
    balanceLamports !== null &&
    balanceLamports >= (sendLamports ?? 0n) + TRANSFER_FEE_LAMPORTS;
  const needsFunds = isTestnet && balanceLamports !== null && !covered;
  const canSend =
    isSolanaAddress(to) &&
    sendLamports !== null &&
    !busy &&
    (!isTestnet || covered);

  const refreshBalance = useCallback(async () => {
    try {
      setBalanceLamports(await getSolBalance(solana.connection, address));
    } catch {
      setBalanceLamports(null);
    }
  }, [solana.connection, address]);

  const resetBalanceState = useCallback(() => {
    setBalanceLamports(null);
    setSigned(null);
    setTxSignature(null);
    setError(null);
  }, []);

  useBalancePolling(refreshBalance, resetBalanceState);

  async function send() {
    setBusy(true);
    setError(null);
    setSigned(null);
    setTxSignature(null);
    try {
      if (sendLamports === null) return;
      const { signature, serialized } = await sendSol({
        connection: solana.connection,
        session,
        fromAddress: address,
        toAddress: to,
        lamports: sendLamports,
      });
      setSigned(bytesToBase64(serialized));
      setTxSignature(signature);
      void refreshBalance();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  function sendMax() {
    if (balanceLamports === null || busy) return;
    setError(null);
    if (balanceLamports <= TRANSFER_FEE_LAMPORTS) {
      setError("Balance is too low to cover the fee");
      return;
    }
    setAmount(formatSol(balanceLamports - TRANSFER_FEE_LAMPORTS));
  }

  const explorer = txSignature
    ? explorerTxUrl(solana.cluster, txSignature)
    : undefined;
  const networkName = clusterDisplayName(solana.cluster);

  return (
    <AccountCardShell
      badgeClassName="badge chain-solana"
      badgeText={`Solana · ${mode}`}
      onLock={onLock}
      address={address}
      balanceText={
        balanceLamports === null ? "…" : trimAmount(formatSol(balanceLamports))
      }
      symbol={solana.symbol}
      needsFunds={needsFunds}
      faucetUrl={SOLANA_FAUCET_URL}
      faucetText={`Get devnet ${solana.symbol} ↗`}
      networkName={networkName}
      recipientPlaceholder="Solana address…"
      suggestedRecipient={suggestedRecipient}
      suggestedLabel={suggestedLabel}
      onRevealRecipient={onRevealRecipient}
      to={to}
      setTo={setTo}
      amount={amount}
      setAmount={setAmount}
      showChip={showChip}
      switchToManual={switchToManual}
      restoreSuggestion={restoreSuggestion}
      busy={busy}
      canSend={canSend}
      onSend={() => void send()}
      onSendMax={sendMax}
      maxDisabled={busy || balanceLamports === null}
      signed={signed}
      broadcastId={txSignature}
      explorerUrl={explorer}
      error={error}
    />
  );
}

export { SolanaAccountCard };
