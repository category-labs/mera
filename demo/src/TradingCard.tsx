import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { clearCachedAccount, loadCachedAccount } from "./account";
import { parseDecimalAmount } from "./amount";
import { ConnectPanel } from "./ConnectPanel";
import { type EvmContext, fundAccount } from "./chains/evm";
import {
  type AccountMode,
  type ConnectedWallet,
  connect,
  describeError,
  revealMnemonic,
} from "./connect";
import {
  costBasisAfterBuy,
  costBasisAfterSell,
  loadCostBasis,
  saveCostBasis,
} from "./costBasis";
import {
  buyShares,
  COMPANY_NAME,
  type Fill,
  type Portfolio,
  priceAt,
  readPortfolio,
  sellShares,
  TICKER,
  UNIT,
} from "./market";
import { NewsTicker } from "./NewsTicker";
import { CHART_WINDOW_SECONDS, PriceChart } from "./PriceChart";
import { currentPasskeyWallet } from "./passkeyWallet";
import { formatShares, formatUsd } from "./ui";
import { WalletBackup } from "./WalletBackup";

const REFRESH_MS = 5_000;
// Cash kept out of Max buys so the account can always pay a trade's network
// fee; at the demo network's gas prices this covers hundreds of trades.
const FEE_RESERVE_WEI = 10n ** 16n;
// Cash below this offers the $10,000 top-up; the guard enforces the same
// threshold, so the button cannot inflate a healthy account.
const LOW_CASH_WEI = 100n * UNIT;
// One cent, the display resolution: sells that would leave less than this
// behind sell the whole position instead.
const CENT_WEI = 10n ** 16n;

type Side = "buy" | "sell";

/**
 * The account behind the trading surface. "locked" is a reloaded page: the
 * cached public identity shows the portfolio, and the first trade runs a
 * passkey ceremony to restore the signing session.
 */
type AccountState =
  | { status: "none" }
  | { status: "locked"; mode: AccountMode; address: `0x${string}` }
  | { status: "unlocked"; wallet: ConnectedWallet };

type TradingCardProps = {
  evm: EvmContext | null;
  evmError: string | null;
};

/**
 * The always-on trading surface: the stock's price, chart, and fake newsroom
 * render for everyone (history comes from the price mirror, so they need no
 * network); the area below them depends on the account state. Unlocked
 * trades sign silently; a passkey prompt appears only at connect, at the
 * first trade after a reload, and when exporting the recovery phrase.
 */
function TradingCard({ evm, evmError }: TradingCardProps): ReactElement {
  const [account, setAccount] = useState<AccountState>(() => {
    const cached = loadCachedAccount();
    return cached ? { status: "locked", ...cached } : { status: "none" };
  });
  const [connectMode, setConnectMode] = useState<AccountMode>("passkey");

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [sellAll, setSellAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fill, setFill] = useState<(Fill & { spent?: bigint }) | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);

  // Recovery phrase, revealed on demand by a fresh passkey ceremony. It lives
  // only here while shown and replaces the card (Hide drops it); the demo
  // never persists it.
  const [phrase, setPhrase] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  const address =
    account.status === "none"
      ? null
      : account.status === "locked"
        ? account.address
        : account.wallet.account.address;

  // Switches to `next` and drops everything scoped to the previous account.
  function adoptAccount(next: AccountState): void {
    setAccount(next);
    setPortfolio(null);
    setAmount("");
    setSellAll(false);
    setFill(null);
    setTradeError(null);
    setReadError(null);
  }

  // Cash invested in the open position; localStorage so P&L survives reloads.
  const [basis, setBasis] = useState(() =>
    address === null ? 0n : loadCostBasis(address),
  );
  useEffect(() => {
    setBasis(address === null ? 0n : loadCostBasis(address));
  }, [address]);
  function applyBasis(next: bigint): void {
    if (address === null) return;
    setBasis(next);
    saveCostBasis(address, next);
  }

  // A network restart wipes the chain, and with it the position; a basis
  // left behind would report a loss on shares that no longer exist. Skip the
  // reset while a trade is in flight: right after a buy mines, the basis is
  // already updated while `portfolio` still shows the pre-trade zero shares.
  useEffect(() => {
    if (!busy && address !== null && portfolio?.shares === 0n && basis !== 0n) {
      setBasis(0n);
      saveCostBasis(address, 0n);
    }
  }, [busy, portfolio, basis, address]);

  const refresh = useCallback(async () => {
    setNow(Math.floor(Date.now() / 1000));
    if (evm === null || address === null) return;
    try {
      setPortfolio(await readPortfolio(evm, address));
      setReadError(null);
    } catch (caught) {
      setReadError(describeError(caught));
    }
  }, [evm, address]);

  // Funding needs only an address and the guard no-ops above its threshold,
  // so cached accounts refill after a network reset too. The address-keyed
  // ref also absorbs StrictMode's double mount.
  const funded = useRef<string | null>(null);
  useEffect(() => {
    if (address === null || funded.current === address) return;
    funded.current = address;
    fundAccount(address)
      .catch(() => {
        // A failed top-up surfaces through the balance read; the button
        // below offers a retry once the network is back.
      })
      .finally(() => void refresh());
  }, [address, refresh]);

  useEffect(() => {
    // The immediate call covers the moments the poll would miss by up to a
    // tick: the network context resolving after mount, and account changes.
    void refresh();
    const interval = window.setInterval(() => void refresh(), REFRESH_MS);
    // Refresh when the tab regains focus, so state that changed while the
    // tab was hidden appears without waiting for the next tick.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // The mirror stands in for the live quote until the chain answers; the two
  // agree by construction, so the market renders at first paint.
  const price = portfolio?.price ?? priceAt(BigInt(now));
  const positionValue =
    portfolio === null ? null : (portfolio.shares * portfolio.price) / UNIT;
  const delta = price - priceAt(BigInt(now - CHART_WINDOW_SECONDS));

  // House credits change cash, never the basis, so refills cannot fake gains.
  const pnl =
    positionValue !== null && portfolio !== null && portfolio.shares > 0n
      ? positionValue - basis
      : null;
  const pnlPercent =
    pnl !== null && basis > 0n ? Number((pnl * 10_000n) / basis) / 100 : null;

  const amountWei = parseDecimalAmount(amount, 18);
  // Buys must leave the fee reserve behind; sells cannot exceed the position
  // (with a cent of slack for price movement between render and submit) and
  // still need the reserve for the trade's network fee.
  const covered =
    portfolio !== null &&
    amountWei !== null &&
    (side === "buy"
      ? amountWei + FEE_RESERVE_WEI <= portfolio.cash
      : positionValue !== null &&
        positionValue > 0n &&
        amountWei <= positionValue + CENT_WEI &&
        portfolio.cash >= FEE_RESERVE_WEI);
  const canTrade = covered && !busy;

  const estimatedShares =
    amountWei !== null ? (amountWei * UNIT) / price : null;

  // Wei to a plain decimal dollar string, floored to cents.
  function usdInput(wei: bigint): string {
    const cents = wei / CENT_WEI;
    return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
  }

  function fillMax(): void {
    if (portfolio === null) return;
    setTradeError(null);
    const wei =
      side === "buy"
        ? portfolio.cash > FEE_RESERVE_WEI
          ? portfolio.cash - FEE_RESERVE_WEI
          : 0n
        : (positionValue ?? 0n);
    setAmount(usdInput(wei));
    // Max on the sell side means the whole position: converting its stale
    // dollar figure back to shares at a moved price can strand dust.
    setSellAll(side === "sell");
  }

  async function submit(): Promise<void> {
    if (
      amountWei === null ||
      portfolio === null ||
      evm === null ||
      account.status === "none"
    )
      return;
    setBusy(true);
    setTradeError(null);
    setFill(null);
    try {
      let wallet: ConnectedWallet;
      if (account.status === "locked") {
        // The ceremony must be the first await so the click's user activation
        // still covers the WebAuthn prompt (Safari enforces this); the
        // signing afterwards is silent.
        wallet = await connect(account.mode, "signin");
        if (wallet.account.address !== account.address) {
          // A different passkey was chosen; the amount was validated against
          // the old portfolio, so adopt the new account instead of trading.
          adoptAccount({ status: "unlocked", wallet });
          setTradeError(
            "That passkey opens a different account; its balances are shown now.",
          );
          return;
        }
        setAccount({ status: "unlocked", wallet });
      } else {
        wallet = account.wallet;
      }
      const session = wallet.account.session;
      if (side === "buy") {
        const result = await buyShares(session, evm, amountWei);
        setFill({ ...result, spent: amountWei });
        applyBasis(costBasisAfterBuy(basis, amountWei));
      } else {
        let shares = (amountWei * UNIT) / portfolio.price;
        // A Max sell, or a typed amount within a cent of the whole position,
        // sells all of it, so no dust the display would round to $0.00 is
        // left behind.
        if (
          sellAll ||
          ((portfolio.shares - shares) * portfolio.price) / UNIT < CENT_WEI
        ) {
          shares = portfolio.shares;
        }
        const result = await sellShares(session, evm, shares);
        setFill(result);
        applyBasis(costBasisAfterSell(basis, result.shares, portfolio.shares));
      }
      setAmount("");
      setSellAll(false);
      await refresh();
    } catch (caught) {
      setTradeError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function addFunds(): Promise<void> {
    if (address === null) return;
    setFunding(true);
    setTradeError(null);
    try {
      await fundAccount(address);
      await refresh();
    } catch (caught) {
      setTradeError(describeError(caught));
    } finally {
      setFunding(false);
    }
  }

  async function revealBackup(): Promise<void> {
    if (account.status === "none") return;
    setRevealing(true);
    setBackupError(null);
    try {
      // In the locked state the reveal runs against the device's remembered
      // credential; picking a different discoverable passkey would show that
      // passkey's phrase, not the cached account's.
      const target =
        account.status === "unlocked"
          ? account.wallet
          : {
              mode: account.mode,
              credentialId: currentPasskeyWallet()?.credentialId,
            };
      setPhrase(await revealMnemonic(target));
    } catch (caught) {
      setBackupError(describeError(caught));
    } finally {
      setRevealing(false);
    }
  }

  function signOut(): void {
    if (account.status === "unlocked") account.wallet.lock();
    clearCachedAccount();
    adoptAccount({ status: "none" });
  }

  // The phrase takes over the card slot, keeping the embedded demo compact.
  if (phrase !== null) {
    return (
      <div className="account-shell">
        <WalletBackup phrase={phrase} onHide={() => setPhrase(null)} />
      </div>
    );
  }

  return (
    <div className="account-shell">
      <section className="card">
        <div className="stock-head">
          <div>
            <span className="stock-name">{COMPANY_NAME}</span>
            <span className="stock-symbol">{TICKER}</span>
          </div>
          <div className="stock-quote">
            <span className="stock-price">{formatUsd(price)}</span>
            <span
              className={delta < 0n ? "stock-delta down" : "stock-delta up"}
            >
              {delta < 0n ? "" : "+"}
              {formatUsd(delta)} · 30m
            </span>
          </div>
        </div>

        <PriceChart livePrice={price} now={now} />
        <NewsTicker now={now} />

        {evmError && (
          <p className="status error">The market is unavailable: {evmError}</p>
        )}

        {account.status === "none" ? (
          <ConnectPanel
            key={connectMode}
            mode={connectMode}
            onConnected={(wallet) =>
              adoptAccount({ status: "unlocked", wallet })
            }
          />
        ) : (
          <>
            <div className="holdings">
              <div className="holding-row">
                <span className="holding-label">Cash</span>
                <span className="holding-value">
                  {portfolio === null ? "…" : formatUsd(portfolio.cash)}
                </span>
              </div>
              <div className="holding-row">
                <span className="holding-label">{TICKER}</span>
                <span className="holding-value">
                  {portfolio === null || positionValue === null
                    ? "…"
                    : `${formatShares(portfolio.shares)} · ${formatUsd(positionValue)}`}
                </span>
              </div>
              {pnl !== null && (
                <div className="holding-row">
                  <span className="holding-label">P&L</span>
                  <span
                    className={
                      pnl < 0n ? "holding-value down" : "holding-value up"
                    }
                  >
                    {pnl < 0n ? "" : "+"}
                    {formatUsd(pnl)}
                    {pnlPercent !== null &&
                      ` · ${pnlPercent < 0 ? "" : "+"}${pnlPercent.toFixed(2)}%`}
                  </span>
                </div>
              )}
            </div>

            <div className="segmented" role="tablist" aria-label="Trade side">
              {(["buy", "sell"] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  role="tab"
                  aria-selected={entry === side}
                  className={entry === side ? "segment active" : "segment"}
                  onClick={() => {
                    setSide(entry);
                    setSellAll(false);
                    setTradeError(null);
                  }}
                >
                  {entry === "buy" ? "Buy" : "Sell"}
                </button>
              ))}
            </div>

            <form
              className="trade"
              onSubmit={(event) => {
                event.preventDefault();
                if (canTrade) void submit();
              }}
            >
              <div className="send-row">
                <label className="field grow">
                  <span className="field-head">
                    Amount (USD)
                    <button
                      type="button"
                      className="link small"
                      onClick={fillMax}
                      disabled={busy || portfolio === null}
                    >
                      Max
                    </button>
                  </span>
                  <input
                    value={amount}
                    placeholder="100.00"
                    inputMode="decimal"
                    spellCheck={false}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setSellAll(false);
                      // A new amount retires the last fill for the estimate.
                      setFill(null);
                    }}
                    disabled={busy}
                  />
                </label>
                <button
                  type="submit"
                  className="btn primary send-btn"
                  disabled={!canTrade}
                >
                  {busy
                    ? account.status === "locked"
                      ? "Waiting for passkey…"
                      : side === "buy"
                        ? "Buying…"
                        : "Selling…"
                    : side === "buy"
                      ? "Buy"
                      : "Sell"}
                </button>
              </div>

              {account.status === "locked" && (
                <p className="hint">
                  The first trade asks for the account's passkey.
                </p>
              )}

              {estimatedShares !== null && !fill && (
                <p className="hint">
                  ≈ {formatShares(estimatedShares)} {TICKER} at the current
                  price
                </p>
              )}

              {fill && (
                <p className="status ok">
                  {fill.side === "buy"
                    ? `Bought ${formatShares(fill.shares)} ${TICKER}${
                        fill.spent === undefined
                          ? ""
                          : ` for ${formatUsd(fill.spent)}`
                      }`
                    : `Sold ${formatShares(fill.shares)} ${TICKER}`}
                </p>
              )}

              {tradeError && <p className="status error">{tradeError}</p>}
              {readError && <p className="status error">{readError}</p>}
            </form>
          </>
        )}
      </section>

      {account.status === "none" ? (
        <button
          type="button"
          className="mode-switch"
          onClick={() =>
            setConnectMode(connectMode === "passkey" ? "vault" : "passkey")
          }
        >
          {connectMode === "passkey"
            ? "Import existing secret →"
            : "← Back to passkey accounts"}
        </button>
      ) : (
        <>
          <div className="account-links">
            {portfolio !== null && portfolio.cash < LOW_CASH_WEI && (
              <button
                type="button"
                className="link"
                onClick={() => void addFunds()}
                disabled={funding}
              >
                {funding ? "Adding funds…" : "Add $10,000"}
              </button>
            )}
            <button
              type="button"
              className="link"
              onClick={() => void revealBackup()}
              disabled={revealing}
            >
              {revealing ? "Waiting for passkey…" : "Export account"}
            </button>
            <button type="button" className="link" onClick={signOut}>
              Sign out
            </button>
          </div>
          {backupError && <p className="status error">{backupError}</p>}
        </>
      )}

      <p className="disclaimer">
        Runs on a demo network. Everything traded is fictional.
      </p>
    </div>
  );
}

export { TradingCard };
