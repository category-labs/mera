import { type ReactElement, useCallback, useEffect, useState } from "react";
import { type AccountMode, describeError } from "./connect";
import { QrCode } from "./QrCode";
import { shorten, trimAmount } from "./ui";
import { useCopyButton } from "./useCopyButton";

/**
 * Chain-specific behavior behind an account card. Amounts are bigints in the
 * chain's smallest unit (wei, lamports); `parseAmount` and `formatAmount`
 * convert to and from the decimal strings shown in the UI.
 */
type ChainAdapter = {
  /** Chain label for the card badge, e.g. "Ethereum". */
  chainName: string;
  badgeClassName: string;
  symbol: string;
  /** Network display name for the receive hint, e.g. "Solana Devnet". */
  networkName: string;
  faucetUrl: string;
  /** Faucet link text, e.g. "Get testnet MON ↗". */
  faucetText: string;
  recipientPlaceholder: string;
  /** How often the balance is re-fetched while the card is mounted. */
  balanceRefreshMs: number;
  /** Decimal amount pre-filled alongside a suggested recipient, e.g. "0.01". */
  suggestedSendAmount: string;
  /** Error shown when Max is pressed but the balance cannot cover the fee reserve. */
  balanceTooLowError: string;
  isValidRecipient: (to: string) => boolean;
  /** Parses a decimal amount string, or `null` if invalid or non-positive. */
  parseAmount: (text: string) => bigint | null;
  /** Formats an amount as a decimal string (used to fill the input on Max). */
  formatAmount: (amount: bigint) => string;
  /**
   * Reads the current balance together with the amount to reserve for one
   * send's network fee; the funding gate and Max both subtract the reserve.
   */
  fetchBalance: () => Promise<{ balance: bigint; feeReserve: bigint }>;
  /**
   * Signs and broadcasts a transfer, resolving with the chain's transaction
   * identifier. Passes the signed transaction to `onSigned` as soon as it is
   * available, so it stays on screen even when the broadcast then fails.
   */
  send: (
    to: string,
    amount: bigint,
    onSigned: (signed: string) => void,
  ) => Promise<string>;
  explorerTxUrl: (id: string) => string | undefined;
};

type ChainAccountCardProps = {
  /**
   * Chain behavior for the card. Build it with `useMemo`: the card resets and
   * refetches whenever the adapter identity changes.
   */
  adapter: ChainAdapter;
  address: string;
  mode: AccountMode;
  isTestnet: boolean;
  /** A self-owned recipient to pre-fill (testnet, derived mode); absent otherwise. */
  suggestedRecipient?: string;
  suggestedLabel?: string;
  /** Reveals the suggested recipient account after a send (switch to it or add it). */
  onRevealRecipient?: () => void;
  onLock: () => void;
};

/** Account view for one chain: address, balance, receive QR, send form. */
function ChainAccountCard({
  adapter,
  address,
  mode,
  isTestnet,
  suggestedRecipient,
  suggestedLabel,
  onRevealRecipient,
  onLock,
}: ChainAccountCardProps): ReactElement {
  const { copied, copy } = useCopyButton();
  // Balance plus the fee reserve for one send, in the chain's smallest unit;
  // null while unknown (loading or failed).
  const [funds, setFunds] = useState<{
    balance: bigint;
    feeReserve: bigint;
  } | null>(null);
  // Pre-fill a one-click self-transfer when a suggested recipient is offered
  // (testnet, derived). The card remounts per account, so these initializers
  // re-seed on every account switch.
  const [to, setTo] = useState(() => suggestedRecipient ?? "");
  const [amount, setAmount] = useState(() =>
    suggestedRecipient ? adapter.suggestedSendAmount : "",
  );
  const [manual, setManual] = useState(() => !suggestedRecipient);
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState<string | null>(null);
  const [broadcastId, setBroadcastId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showChip = Boolean(suggestedRecipient) && !manual;
  const sendAmount = adapter.parseAmount(amount);
  // Testnet gates Send on a *known* balance that covers amount + fee reserve,
  // and prompts the faucet when it doesn't. Mainnet is unchanged: send on a
  // valid form. `covered` is false while the balance is still unknown, so Send
  // stays disabled until we actually know there are funds.
  const covered =
    funds !== null && funds.balance >= (sendAmount ?? 0n) + funds.feeReserve;
  const needsFunds = isTestnet && funds !== null && !covered;
  const canSend =
    adapter.isValidRecipient(to) &&
    sendAmount !== null &&
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
      setFunds(await adapter.fetchBalance());
    } catch {
      setFunds(null);
    }
  }, [adapter]);

  useEffect(() => {
    setFunds(null);
    setSigned(null);
    setBroadcastId(null);
    setError(null);
    void refreshBalance();
    const interval = window.setInterval(() => {
      void refreshBalance();
    }, adapter.balanceRefreshMs);
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
  }, [refreshBalance, adapter.balanceRefreshMs]);

  async function send(): Promise<void> {
    if (sendAmount === null) return;
    setBusy(true);
    setError(null);
    setSigned(null);
    setBroadcastId(null);
    try {
      setBroadcastId(await adapter.send(to, sendAmount, setSigned));
      void refreshBalance();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  function sendMax(): void {
    if (funds === null || busy) return;
    setError(null);
    if (funds.balance <= funds.feeReserve) {
      setError(adapter.balanceTooLowError);
      return;
    }
    setAmount(adapter.formatAmount(funds.balance - funds.feeReserve));
  }

  const explorer = broadcastId ? adapter.explorerTxUrl(broadcastId) : undefined;

  return (
    <section className="card">
      <div className="card-head">
        <span className={adapter.badgeClassName}>
          {adapter.chainName} · {mode}
        </span>
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
          {funds === null
            ? "…"
            : trimAmount(adapter.formatAmount(funds.balance))}
        </span>
        <span className="symbol">{adapter.symbol}</span>
        {needsFunds && (
          <a
            className="faucet"
            href={adapter.faucetUrl}
            target="_blank"
            rel="noreferrer"
          >
            {adapter.faucetText}
          </a>
        )}
      </div>

      <div className="qr-frame">
        <QrCode value={address} />
      </div>
      <p className="hint center">Scan to receive on {adapter.networkName}</p>

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
                {showChip ? "Change" : `${suggestedLabel}`}
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
              placeholder={adapter.recipientPlaceholder}
              spellCheck={false}
              onChange={(event) => setTo(event.target.value)}
              disabled={busy}
            />
          )}
        </div>

        <div className="send-row">
          <label className="field grow">
            <span className="field-head">
              Amount ({adapter.symbol})
              <button
                type="button"
                className="link small"
                onClick={sendMax}
                disabled={busy || funds === null}
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

        {broadcastId && (
          <p className="status ok">
            Broadcast:{" "}
            {explorer ? (
              <a href={explorer} target="_blank" rel="noreferrer">
                {shorten(broadcastId)}
              </a>
            ) : (
              <span className="mono">{shorten(broadcastId)}</span>
            )}
          </p>
        )}

        {broadcastId && showChip && onRevealRecipient && (
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

export type { ChainAdapter };
export { ChainAccountCard };
