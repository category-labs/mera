import type { EvmAddress, Secp256k1SigningSession } from "mera";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { formatEther, getAddress, isAddress, parseEther } from "viem";
import { toPasskeyAccount } from "./account";
import {
  createTransactionClient,
  type EthereumContext,
  explorerTxUrl,
} from "./chains/ethereum";
import { type AccountMode, describeError } from "./connect";
import { QrCode } from "./QrCode";
import { shorten, trimAmount } from "./ui";
import { useCopyButton } from "./useCopyButton";

const BALANCE_REFRESH_MS = 10_000;
const DEMO_SEND_AMOUNT = "0.01";
const MONAD_FAUCET_URL = "https://faucet.monad.xyz/";

type EthereumAccountCardProps = {
  session: Secp256k1SigningSession;
  address: EvmAddress;
  mode: AccountMode;
  ethereum: EthereumContext;
  isTestnet: boolean;
  /** A self-owned recipient to pre-fill (testnet, derived mode); absent otherwise. */
  suggestedRecipient?: string;
  suggestedLabel?: string;
  /** Reveals the suggested recipient account after a send (switch to it or add it). */
  onRevealRecipient?: () => void;
  onLock: () => void;
};

/** Account view for an Ethereum passkey session: address, balance, receive QR, send form. */
function EthereumAccountCard({
  session,
  address,
  mode,
  ethereum,
  isTestnet,
  suggestedRecipient,
  suggestedLabel,
  onRevealRecipient,
  onLock,
}: EthereumAccountCardProps): ReactElement {
  const { chain, publicClient, rpcUrl } = ethereum;
  const account = useMemo(() => toPasskeyAccount(session), [session]);

  const { copied, copy } = useCopyButton();
  const [balance, setBalance] = useState<string | null>(null);
  // Wei to reserve for a 21k-gas native transfer, refreshed with the balance so
  // the funding check accounts for gas, not just the amount.
  const [gasReserve, setGasReserve] = useState<bigint>(0n);
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
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showChip = Boolean(suggestedRecipient) && !manual;
  const amountValid = /^\d*\.?\d+$/.test(amount) && Number(amount) > 0;
  const amountWei = amountValid ? parseEther(amount) : 0n;
  const balanceWei = balance !== null ? parseEther(balance) : null;
  // Testnet gates Send on a *known* balance that covers amount + gas, and
  // prompts the faucet when it doesn't. Mainnet is unchanged: send on a valid
  // form. `covered` is false while the balance is still null (loading/failed),
  // so Send stays disabled until we actually know there are funds.
  const covered = balanceWei !== null && balanceWei >= amountWei + gasReserve;
  const needsFunds = isTestnet && balanceWei !== null && !covered;
  const canSend =
    isAddress(to) && amountValid && !busy && (!isTestnet || covered);

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
      const [wei, fees] = await Promise.all([
        publicClient.getBalance({ address }),
        publicClient.estimateFeesPerGas(),
      ]);
      setBalance(formatEther(wei));
      // 21000 gas is the base cost of a native transfer to an EOA.
      setGasReserve(21000n * fees.maxFeePerGas);
    } catch {
      setBalance(null);
    }
  }, [publicClient, address]);

  useEffect(() => {
    setBalance(null);
    setSigned(null);
    setTxHash(null);
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
    setTxHash(null);
    try {
      const transactionClient = createTransactionClient(account, chain, rpcUrl);
      const request = await transactionClient.prepareTransactionRequest({
        to: getAddress(to),
        value: parseEther(amount),
      });
      const serializedTransaction =
        await transactionClient.signTransaction(request);
      setSigned(serializedTransaction);
      const hash = await publicClient.sendRawTransaction({
        serializedTransaction,
      });
      setTxHash(hash);
      void refreshBalance();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function sendMax() {
    if (balance === null || busy) return;
    setError(null);
    try {
      const balanceWei = parseEther(balance);
      const { maxFeePerGas } = await publicClient.estimateFeesPerGas();
      // 21000 gas is the base cost of a native ETH transfer to an EOA.
      const gasCost = 21000n * maxFeePerGas;
      if (balanceWei <= gasCost) {
        setError("Balance is too low to cover gas");
        return;
      }
      setAmount(formatEther(balanceWei - gasCost));
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  const explorer = txHash ? explorerTxUrl(chain, txHash) : undefined;

  return (
    <section className="card">
      <div className="card-head">
        <span className="badge chain-ethereum">Ethereum · {mode}</span>
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
          {balance === null ? "…" : trimAmount(balance)}
        </span>
        <span className="symbol">{chain.nativeCurrency.symbol}</span>
        {needsFunds && (
          <a
            className="faucet"
            href={MONAD_FAUCET_URL}
            target="_blank"
            rel="noreferrer"
          >
            Get testnet {chain.nativeCurrency.symbol} ↗
          </a>
        )}
      </div>

      <div className="qr-frame">
        <QrCode value={address} />
      </div>
      <p className="hint center">Scan to receive on {chain.name}</p>

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
              placeholder="0x…"
              spellCheck={false}
              onChange={(event) => setTo(event.target.value)}
              disabled={busy}
            />
          )}
        </div>

        <div className="send-row">
          <label className="field grow">
            <span className="field-head">
              Amount ({chain.nativeCurrency.symbol})
              <button
                type="button"
                className="link small"
                onClick={() => void sendMax()}
                disabled={busy || balance === null}
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

        {txHash && (
          <p className="status ok">
            Broadcast:{" "}
            {explorer ? (
              <a href={explorer} target="_blank" rel="noreferrer">
                {shorten(txHash)}
              </a>
            ) : (
              <span className="mono">{shorten(txHash)}</span>
            )}
          </p>
        )}

        {txHash && showChip && onRevealRecipient && (
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

export { EthereumAccountCard };
