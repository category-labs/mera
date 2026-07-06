import type { ReactElement } from "react";
import type { SuggestedRecipientProps } from "./accountCardShared";
import { QrCode } from "./QrCode";
import { shorten } from "./ui";
import { useCopyButton } from "./useCopyButton";

type AccountCardShellProps = SuggestedRecipientProps & {
  badgeClassName: string;
  badgeText: string;
  onLock: () => void;
  address: string;
  balanceText: string;
  symbol: string;
  needsFunds: boolean;
  faucetUrl: string;
  faucetText: string;
  networkName: string;
  recipientPlaceholder: string;
  to: string;
  setTo: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  showChip: boolean;
  switchToManual: () => void;
  restoreSuggestion: () => void;
  busy: boolean;
  canSend: boolean;
  onSend: () => void;
  onSendMax: () => void;
  maxDisabled: boolean;
  signed: string | null;
  broadcastId: string | null;
  explorerUrl?: string;
  error: string | null;
};

function AccountCardShell({
  badgeClassName,
  badgeText,
  onLock,
  address,
  balanceText,
  symbol,
  needsFunds,
  faucetUrl,
  faucetText,
  networkName,
  recipientPlaceholder,
  suggestedRecipient,
  suggestedLabel,
  onRevealRecipient,
  to,
  setTo,
  amount,
  setAmount,
  showChip,
  switchToManual,
  restoreSuggestion,
  busy,
  canSend,
  onSend,
  onSendMax,
  maxDisabled,
  signed,
  broadcastId,
  explorerUrl,
  error,
}: AccountCardShellProps): ReactElement {
  const { copied, copy } = useCopyButton();

  return (
    <section className="card">
      <div className="card-head">
        <span className={badgeClassName}>{badgeText}</span>
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
        <span className="amount">{balanceText}</span>
        <span className="symbol">{symbol}</span>
        {needsFunds && (
          <a
            className="faucet"
            href={faucetUrl}
            target="_blank"
            rel="noreferrer"
          >
            {faucetText}
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
          if (canSend) onSend();
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
              placeholder={recipientPlaceholder}
              spellCheck={false}
              onChange={(event) => setTo(event.target.value)}
              disabled={busy}
            />
          )}
        </div>

        <div className="send-row">
          <label className="field grow">
            <span className="field-head">
              Amount ({symbol})
              <button
                type="button"
                className="link small"
                onClick={onSendMax}
                disabled={maxDisabled}
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
            {explorerUrl ? (
              <a href={explorerUrl} target="_blank" rel="noreferrer">
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

export { AccountCardShell };
