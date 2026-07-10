import { type ReactElement, useCallback, useEffect, useState } from "react";
import { type AccountMode, describeError } from "./connect";
import { QrCode } from "./QrCode";
import { shorten, trimAmount } from "./ui";
import { useCopyButton } from "./useCopyButton";

const BALANCE_REFRESH_MS = 10_000;
// Decimal amount pre-filled alongside a suggested recipient.
const DEMO_SEND_AMOUNT = "0.01";

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
   * Builds and signs a transfer, returning the signed transaction for display
   * together with a `broadcast` function that submits it and resolves with
   * the chain's transaction identifier. Signing and broadcasting are separate
   * steps so the card shows the signed transaction even when the broadcast
   * then fails.
   */
  signTransfer: (
    to: string,
    amount: bigint,
  ) => Promise<{ signed: string; broadcast: () => Promise<string> }>;
  explorerTxUrl: (id: string) => string | undefined;
};

/** A self-owned recipient the card pre-fills for a one-click transfer. */
type RecipientSuggestion = {
  address: string;
  label: string;
  /** Reveals the suggested recipient account after a send (switch to it or add it). */
  onReveal: () => void;
};

type ChainAccountCardProps = {
  /**
   * Chain behavior for the card. Balance polling restarts when the adapter
   * identity changes; all other card state is seeded once per mount. The demo
   * remounts the card per account and network via `key`.
   */
  adapter: ChainAdapter;
  address: string;
  mode: AccountMode;
  isTestnet: boolean;
  suggestion?: RecipientSuggestion;
  onLock: () => void;
};

/** Account view for one chain: address, balance, receive QR, send form. */
function ChainAccountCard({
  adapter,
  address,
  mode,
  isTestnet,
  suggestion,
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
  const [to, setTo] = useState(() => suggestion?.address ?? "");
  const [amount, setAmount] = useState(() =>
    suggestion ? DEMO_SEND_AMOUNT : "",
  );
  const [manual, setManual] = useState(() => !suggestion);
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState<string | null>(null);
  const [broadcastId, setBroadcastId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The suggestion chip stays visible until manual entry is enabled.
  const shownSuggestion = manual ? undefined : suggestion;
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

  // Drop the pre-filled recipient and enable manual address entry.
  function switchToManual(): void {
    setManual(true);
    setTo("");
  }

  // Restore the suggested self-recipient after manual entry was enabled.
  function restoreSuggestion(): void {
    if (!suggestion) return;
    setManual(false);
    setTo(suggestion.address);
  }

  const refreshBalance = useCallback(async () => {
    try {
      setFunds(await adapter.fetchBalance());
    } catch {
      setFunds(null);
    }
  }, [adapter]);

  useEffect(() => {
    void refreshBalance();
    const interval = window.setInterval(() => {
      void refreshBalance();
    }, BALANCE_REFRESH_MS);
    // Refresh when the tab regains focus, such as after returning from the
    // faucet, so the new balance appears without a manual Refresh button.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshBalance();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshBalance]);

  async function send(): Promise<void> {
    if (sendAmount === null) return;
    setBusy(true);
    setError(null);
    setSigned(null);
    setBroadcastId(null);
    try {
      const { signed: signedTransaction, broadcast } =
        await adapter.signTransfer(to, sendAmount);
      setSigned(signedTransaction);
      setBroadcastId(await broadcast());
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
            {suggestion && (
              <button
                type="button"
                className="link small"
                onClick={shownSuggestion ? switchToManual : restoreSuggestion}
                disabled={busy}
              >
                {shownSuggestion ? "Change" : suggestion.label}
              </button>
            )}
          </span>
          {shownSuggestion ? (
            <div className="recipient-chip">
              <span className="recipient-name">{shownSuggestion.label}</span>
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
            <summary>
              {mode === "derived"
                ? "The transaction was signed locally with a passkey-derived key."
                : "The transaction was signed locally with a key derived from the recovery phrase."}
            </summary>
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

        {broadcastId && shownSuggestion && (
          <button
            type="button"
            className="link reveal-recipient"
            onClick={shownSuggestion.onReveal}
          >
            View {shownSuggestion.label} →
          </button>
        )}

        {error && <p className="status error">{error}</p>}
      </form>
    </section>
  );
}

export type { ChainAdapter, RecipientSuggestion };
export { ChainAccountCard };
