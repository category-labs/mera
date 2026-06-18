import { type Ed25519SigningSession, isSolanaAddress } from "mera";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import {
  clusterDisplayName,
  explorerTxUrl,
  getSolBalance,
  type SolanaContext,
  sendSol,
} from "./chains/solana";
import { type AccountMode, describeError } from "./connect";
import { QrCode } from "./QrCode";
import { formatSol, parseSolAmount } from "./solanaAmount";
import { bytesToBase64, shorten, trimAmount } from "./ui";
import { useCopyButton } from "./useCopyButton";

const BALANCE_REFRESH_MS = 10_000;
// Solana charges 5000 lamports per signature; a basic transfer needs one.
const TRANSFER_FEE_LAMPORTS = 5000n;
const DEMO_SEND_AMOUNT = "0.01";
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
  const { copied, copy } = useCopyButton();
  // Lamports as the source of truth: parseSolAmount rejects "0" (it's a send
  // validator), which would misread a funded-but-empty account as unknown.
  const [balanceLamports, setBalanceLamports] = useState<bigint | null>(null);
  // Pre-fill a one-click self-transfer when a suggested recipient is offered
  // (testnet, derived). The card remounts per account, so these initializers
  // re-seed on every account switch.
  const [to, setTo] = useState(() => suggestedRecipient ?? "");
  const [amount, setAmount] = useState(() =>
    suggestedRecipient ? DEMO_SEND_AMOUNT : "",
  );
  const [manual, setManual] = useState(() => !suggestedRecipient);
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showChip = Boolean(suggestedRecipient) && !manual;
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

  // Drop the pre-filled recipient and let the user type any address.
  function switchToManual(): void {
    setManual(true);
    setTo("");
  }

  // Re-apply the suggested self-recipient after the user switched to manual.
  function restoreSuggestion(): void {
    if (!suggestedRecipient) return;
    setManual(false);
    setTo(suggestedRecipient);
  }

  const refreshBalance = useCallback(async () => {
    try {
      setBalanceLamports(await getSolBalance(solana.connection, address));
    } catch {
      setBalanceLamports(null);
    }
  }, [solana.connection, address]);

  useEffect(() => {
    setBalanceLamports(null);
    setSigned(null);
    setTxSignature(null);
    setError(null);
    void refreshBalance();
    const interval = window.setInterval(() => {
      void refreshBalance();
    }, BALANCE_REFRESH_MS);
    // Refresh the moment the tab regains focus — e.g. returning from the
    // faucet — so the new balance shows without a manual Refresh button.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshBalance();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshBalance]);

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
    <section className="card">
      <div className="card-head">
        <span className="badge chain-solana">Solana · {mode}</span>
        <button type="button" className="link" onClick={onLock}>
          Lock
        </button>
      </div>

      <button
        type="button"
        className="address"
        onClick={() => void copy(address)}
        title={address}
      >
        <span className="mono">{shorten(address)}</span>
        <span className="copy">{copied ? "Copied" : "Copy"}</span>
      </button>

      <div className="balance">
        <span className="amount">
          {balanceLamports === null
            ? "…"
            : trimAmount(formatSol(balanceLamports))}
        </span>
        <span className="symbol">{solana.symbol}</span>
        {needsFunds && (
          <a
            className="faucet"
            href={SOLANA_FAUCET_URL}
            target="_blank"
            rel="noreferrer"
          >
            Get devnet {solana.symbol} ↗
          </a>
        )}
      </div>

      <div className="qr-frame">
        <QrCode value={address} />
      </div>
      <p className="hint center">Scan to receive on {networkName}</p>

      <form
        className="send"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) void send();
        }}
      >
        <div className="field">
          <span className="field-head">
            Recipient
            {suggestedRecipient && (
              <button
                type="button"
                className="link small"
                onClick={showChip ? switchToManual : restoreSuggestion}
                disabled={busy}
              >
                {showChip ? "Change" : `Use ${suggestedLabel}`}
              </button>
            )}
          </span>
          {showChip ? (
            <div className="recipient-chip">
              <span className="recipient-name">Your {suggestedLabel}</span>
              <span className="recipient-addr mono">{shorten(to)}</span>
            </div>
          ) : (
            <input
              aria-label="Recipient"
              value={to}
              placeholder="Solana address…"
              spellCheck={false}
              onChange={(event) => setTo(event.target.value)}
              disabled={busy}
            />
          )}
        </div>

        <div className="send-row">
          <label className="field grow">
            <span className="field-head">
              Amount ({solana.symbol})
              <button
                type="button"
                className="link small"
                onClick={sendMax}
                disabled={busy || balanceLamports === null}
              >
                Max
              </button>
            </span>
            <input
              value={amount}
              placeholder="0.001"
              inputMode="decimal"
              spellCheck={false}
              onChange={(event) => setAmount(event.target.value)}
              disabled={busy}
            />
          </label>
          <button
            type="submit"
            className="btn primary send-btn"
            disabled={!canSend}
          >
            {busy ? "Signing…" : "Send"}
          </button>
        </div>

        {signed && (
          <details className="reveal" open>
            <summary>Signed locally with your passkey-derived key</summary>
            <code className="mono break">{signed}</code>
          </details>
        )}

        {txSignature && (
          <p className="status ok">
            Broadcast:{" "}
            {explorer ? (
              <a href={explorer} target="_blank" rel="noreferrer">
                {shorten(txSignature)}
              </a>
            ) : (
              <span className="mono">{shorten(txSignature)}</span>
            )}
          </p>
        )}

        {txSignature && showChip && onRevealRecipient && (
          <button
            type="button"
            className="link reveal-recipient"
            onClick={onRevealRecipient}
          >
            View your {suggestedLabel} →
          </button>
        )}

        {error && <p className="status error">{error}</p>}
      </form>
    </section>
  );
}

export { SolanaAccountCard };
