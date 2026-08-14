import type { PasskeyCredentialMetadata } from "@category-labs/mera";
import { parseDecimalAmount } from "@category-labs/mera-demo-shared/amount";
import { CHART_WINDOW_SECONDS } from "@category-labs/mera-demo-shared/chart";
import {
  costBasisAfterBuy,
  costBasisAfterSell,
} from "@category-labs/mera-demo-shared/costBasis";
import { prfOutputToMnemonic } from "@category-labs/mera-demo-shared/hd";
import {
  buyShares,
  COMPANY_NAME,
  coversTrade,
  type Fill,
  LOW_CASH_WEI,
  maxTradeInput,
  type Portfolio,
  priceAt,
  REFRESH_MS,
  readPortfolio,
  type Side,
  sellShares,
  sharesToSell,
  TICKER,
  UNIT,
} from "@category-labs/mera-demo-shared/market";
import { NewsTicker } from "@category-labs/mera-demo-shared/NewsTicker";
import {
  DEMO_RPC_URL,
  type EvmContext,
  fundAccount,
} from "@category-labs/mera-demo-shared/network";
import { PriceChart } from "@category-labs/mera-demo-shared/PriceChart";
import {
  CASH_SYMBOL,
  formatCash,
  formatShares,
} from "@category-labs/mera-demo-shared/ui";
import {
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { isAddressEqual } from "viem";
import type { AccountState } from "./account";
import { RECOVERY_VISIBLE_MS } from "./config";
import {
  isSidePanel,
  openPasskeyTab,
  waitForPasskeyTab,
} from "./passkey-window";
import {
  clearAccount,
  loadCostBasis,
  saveAccount,
  saveCostBasis,
} from "./storage";
import {
  createWallet,
  describeError,
  openWallet,
  revealPhrase,
  type Wallet,
  walletFromPrf,
} from "./wallet";

type Props = {
  evm: EvmContext | null;
  evmError: string | null;
  account: AccountState;
  onAccountChange(next: AccountState): void;
  onLock(): void;
  operationEpoch: RefObject<number>;
  suppressHideLock: RefObject<boolean>;
};

type PendingAction =
  | "create"
  | "signin"
  | "trade"
  | "recovery"
  | "funding"
  | null;

function TradingPanel({
  evm,
  evmError,
  account,
  onAccountChange,
  onLock,
  operationEpoch,
  suppressHideLock,
}: Props): ReactElement {
  const address =
    account.status === "none"
      ? null
      : account.status === "locked"
        ? account.address
        : account.wallet.address;
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [side, setSide] = useState<Side>("buy");
  const [sellAll, setSellAll] = useState(false);
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [fill, setFill] = useState<(Fill & { spent?: bigint }) | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [basis, setBasis] = useState(() =>
    address ? loadCostBasis(address) : 0n,
  );
  const [recoveryWarning, setRecoveryWarning] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const funded = useRef<string | null>(null);
  const busy = pending !== null;

  function operationIsCurrent(
    epoch: number,
    ignoreVisibility = false,
  ): boolean {
    return (
      operationEpoch.current === epoch &&
      (ignoreVisibility || document.visibilityState !== "hidden")
    );
  }

  async function withPasskeyTab<T>(run: () => Promise<T>): Promise<T> {
    suppressHideLock.current = true;
    try {
      return await run();
    } finally {
      suppressHideLock.current = false;
    }
  }

  async function walletFromPasskeyTab(
    action: "create" | "get",
    credential?: PasskeyCredentialMetadata,
  ): Promise<Wallet> {
    const tab = openPasskeyTab(action, credential);
    const message = await waitForPasskeyTab(tab);
    if (message.kind !== "prf") {
      throw new Error("The passkey tab returned no PRF output.");
    }
    return walletFromPrf(
      message.material.prfOutput,
      message.material.credential,
    );
  }

  async function phraseFromPasskeyTab(
    credential: PasskeyCredentialMetadata,
  ): Promise<string> {
    const tab = openPasskeyTab("recovery", credential);
    const message = await waitForPasskeyTab(tab);
    if (message.kind !== "prf") {
      throw new Error("The passkey tab returned no PRF output.");
    }
    try {
      return prfOutputToMnemonic(message.material.prfOutput);
    } finally {
      message.material.prfOutput.fill(0);
    }
  }

  const hideRecovery = useCallback((): void => {
    setRecoveryWarning(false);
    setPhrase(null);
    setCopied(false);
  }, []);

  const reportError = useCallback(
    (caught: unknown): void => {
      hideRecovery();
      setError(describeError(caught));
      onLock();
    },
    [hideRecovery, onLock],
  );

  const refresh = useCallback(async (): Promise<void> => {
    setNow(Math.floor(Date.now() / 1000));
    if (evm === null || address === null) return;
    setPortfolio(await readPortfolio(evm, address));
  }, [address, evm]);

  useEffect(() => {
    setBasis(address ? loadCostBasis(address) : 0n);
    setPortfolio(null);
    setAmount("");
    setSellAll(false);
    setFill(null);
    hideRecovery();
  }, [address, hideRecovery]);

  useEffect(() => {
    function hideWhenPanelHides(): void {
      if (document.visibilityState === "hidden") hideRecovery();
    }
    document.addEventListener("visibilitychange", hideWhenPanelHides);
    window.addEventListener("pagehide", hideRecovery);
    return () => {
      document.removeEventListener("visibilitychange", hideWhenPanelHides);
      window.removeEventListener("pagehide", hideRecovery);
    };
  }, [hideRecovery]);

  useEffect(() => {
    if (account.status !== "unlocked") hideRecovery();
  }, [account.status, hideRecovery]);

  useEffect(() => {
    void refresh().catch(reportError);
    const timer = window.setInterval(
      () => void refresh().catch(reportError),
      REFRESH_MS,
    );
    return () => window.clearInterval(timer);
  }, [refresh, reportError]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (address === null || funded.current === address || evm === null) return;
    funded.current = address;
    void fundAccount(DEMO_RPC_URL, address).then(refresh).catch(reportError);
  }, [address, evm, refresh, reportError]);

  useEffect(() => {
    if (!busy && address !== null && portfolio?.shares === 0n && basis !== 0n) {
      setBasis(0n);
      saveCostBasis(address, 0n);
    }
  }, [address, basis, busy, portfolio]);

  useEffect(() => {
    if (phrase === null) return;
    const timer = window.setTimeout(hideRecovery, RECOVERY_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [hideRecovery, phrase]);

  const price = priceAt(BigInt(now));
  const delta = price - priceAt(BigInt(now - CHART_WINDOW_SECONDS));
  const positionValue = portfolio ? (portfolio.shares * price) / UNIT : null;
  const pnl =
    portfolio !== null && portfolio.shares > 0n && positionValue !== null
      ? positionValue - basis
      : null;
  const pnlPercent =
    pnl !== null && basis > 0n ? Number((pnl * 10_000n) / basis) / 100 : null;
  const amountWei = parseDecimalAmount(amount, 18);
  const estimatedShares =
    amountWei === null ? null : (amountWei * UNIT) / price;
  const covered =
    amountWei !== null &&
    portfolio !== null &&
    coversTrade({ side, amountWei, price, portfolio });

  function fillMax(): void {
    if (portfolio === null) return;
    setAmount(maxTradeInput({ side, price, portfolio }));
    // Max on the sell side means the whole position: converting its stale
    // cash figure back to shares at a moved price can strand dust.
    setSellAll(side === "sell");
    setError(null);
  }

  function storeWallet(wallet: Wallet): void {
    saveAccount({ address: wallet.address, credential: wallet.credential });
    onAccountChange({ status: "unlocked", wallet });
  }

  async function connect(action: "create" | "signin"): Promise<void> {
    if (evm === null) return;
    const epoch = operationEpoch.current;
    const viaTab = isSidePanel();
    setPending(action);
    setError(null);
    let wallet: Wallet | undefined;
    try {
      wallet = viaTab
        ? await withPasskeyTab(() =>
            walletFromPasskeyTab(action === "create" ? "create" : "get"),
          )
        : action === "create"
          ? await createWallet()
          : await openWallet();
      if (!operationIsCurrent(epoch, viaTab)) {
        wallet.lock();
        return;
      }
      storeWallet(wallet);
    } catch (caught) {
      wallet?.lock();
      if (operationIsCurrent(epoch, viaTab)) setError(describeError(caught));
    } finally {
      setPending(null);
    }
  }

  function updateBasis(value: bigint): void {
    if (address === null) return;
    setBasis(value);
    saveCostBasis(address, value);
  }

  async function trade(): Promise<void> {
    if (
      amountWei === null ||
      portfolio === null ||
      evm === null ||
      account.status === "none"
    )
      return;
    const epoch = operationEpoch.current;
    const viaTab = isSidePanel() && account.status === "locked";
    setPending("trade");
    setError(null);
    setFill(null);
    let wallet: Wallet | undefined;
    try {
      if (account.status === "locked") {
        wallet = viaTab
          ? await withPasskeyTab(() =>
              walletFromPasskeyTab("get", account.credential),
            )
          : await openWallet(account.credential);
        if (!operationIsCurrent(epoch, viaTab)) {
          wallet.lock();
          return;
        }
        if (!isAddressEqual(wallet.address, account.address)) {
          wallet.lock();
          wallet = undefined;
          clearAccount();
          throw new Error("The passkey does not match the cached account.");
        }
        storeWallet(wallet);
      } else {
        wallet = account.wallet;
      }
      if (side === "buy") {
        const result = await buyShares(wallet.session, evm, amountWei);
        if (!operationIsCurrent(epoch, viaTab)) {
          wallet.lock();
          return;
        }
        setFill({ ...result, spent: amountWei });
        updateBasis(costBasisAfterBuy(basis, amountWei));
      } else {
        const shares = sharesToSell({
          amountWei,
          price,
          heldShares: portfolio.shares,
          sellAll,
        });
        const result = await sellShares(wallet.session, evm, shares);
        if (!operationIsCurrent(epoch, viaTab)) {
          wallet.lock();
          return;
        }
        setFill(result);
        updateBasis(costBasisAfterSell(basis, result.shares, portfolio.shares));
      }
      setAmount("");
      setSellAll(false);
      await refresh();
    } catch (caught) {
      if (!operationIsCurrent(epoch, viaTab)) {
        wallet?.lock();
        return;
      }
      if (wallet !== undefined) {
        wallet.lock();
        onAccountChange({
          status: "locked",
          address: wallet.address,
          credential: wallet.credential,
        });
      } else {
        onLock();
      }
      setError(describeError(caught));
    } finally {
      setPending(null);
    }
  }

  async function showPhrase(): Promise<void> {
    if (account.status === "none") return;
    const epoch = operationEpoch.current;
    const viaTab = isSidePanel();
    const credential =
      account.status === "locked"
        ? account.credential
        : account.wallet.credential;
    setPending("recovery");
    setError(null);
    try {
      const revealed = viaTab
        ? await withPasskeyTab(() => phraseFromPasskeyTab(credential))
        : await revealPhrase(credential);
      if (!operationIsCurrent(epoch, viaTab)) return;
      setPhrase(revealed);
      setRecoveryWarning(false);
    } catch (caught) {
      if (operationIsCurrent(epoch, viaTab)) reportError(caught);
    } finally {
      setPending(null);
    }
  }

  function signOut(): void {
    try {
      clearAccount();
    } finally {
      onAccountChange({ status: "none" });
    }
  }

  async function addFunds(): Promise<void> {
    if (address === null) return;
    setPending("funding");
    setError(null);
    try {
      await fundAccount(DEMO_RPC_URL, address);
      await refresh();
    } catch (caught) {
      reportError(caught);
    } finally {
      setPending(null);
    }
  }

  async function copyPhrase(): Promise<void> {
    if (phrase === null) return;
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
    } catch (caught) {
      hideRecovery();
      reportError(caught);
    }
  }

  if (phrase !== null) {
    const words = phrase.split(/\s+/).map((word, index) => ({
      position: index + 1,
      word,
    }));
    return (
      <div className="account-shell">
        <section className="backup" aria-live="polite">
          <div className="backup-head">
            <span className="backup-title">Recovery phrase</span>
            <button className="link" type="button" onClick={hideRecovery}>
              Hide
            </button>
          </div>
          <p className="hint">
            Anyone with these {words.length} words controls the funds.
            Compatible wallet apps, such as MetaMask, can recover the same
            addresses.
          </p>
          <p className="status error">The phrase hides after 60 seconds.</p>
          <ol className="mnemonic-grid">
            {words.map(({ position, word }) => (
              <li key={position}>
                <span className="num">{position}</span>
                <span className="mono">{word}</span>
              </li>
            ))}
          </ol>
          <p className="hint">
            Copying exposes the phrase to applications that can read the
            clipboard.
          </p>
          <button
            className="btn"
            type="button"
            onClick={() => void copyPhrase()}
          >
            {copied ? "Copied" : "Copy phrase"}
          </button>
          <button
            className="link"
            type="button"
            onClick={() => {
              hideRecovery();
              onLock();
            }}
          >
            Lock account
          </button>
        </section>
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
            <span className="stock-price">{formatCash(price)}</span>
            <span
              className={delta < 0n ? "stock-delta down" : "stock-delta up"}
            >
              {delta < 0n ? "" : "+"}
              {formatCash(delta)} · 30m
            </span>
          </div>
        </div>
        <PriceChart livePrice={price} now={now} />
        <NewsTicker now={now} />
        {evmError && (
          <p className="status error">The market is unavailable: {evmError}</p>
        )}

        {account.status === "none" ? (
          <div className="connect-cta">
            <div className="actions">
              <button
                className="btn primary"
                type="button"
                disabled={busy || evm === null}
                onClick={() => void connect("create")}
              >
                {pending === "create"
                  ? "Waiting for passkey…"
                  : "Create account"}
              </button>
              <button
                className="btn"
                type="button"
                disabled={busy || evm === null}
                onClick={() => void connect("signin")}
              >
                {pending === "signin" ? "Waiting for passkey…" : "Sign in"}
              </button>
            </div>
            {error && <p className="status error">{error}</p>}
          </div>
        ) : (
          <>
            <div className="holdings">
              <div className="holding-row">
                <span className="holding-label">{CASH_SYMBOL}</span>
                <span className="holding-value">
                  {portfolio ? formatCash(portfolio.cash) : "…"}
                </span>
              </div>
              {pnl !== null && (
                <div className="holding-row">
                  <span className="holding-label">P&amp;L</span>
                  <span
                    className={
                      pnl < 0n ? "holding-value down" : "holding-value up"
                    }
                  >
                    {pnl < 0n ? "" : "+"}
                    {formatCash(pnl)}
                    {pnlPercent !== null &&
                      ` · ${pnlPercent < 0 ? "" : "+"}${pnlPercent.toFixed(2)}%`}
                  </span>
                </div>
              )}
              <div className="holding-row">
                <span className="holding-label">{TICKER}</span>
                <span className="holding-value">
                  {portfolio && positionValue !== null
                    ? `${formatShares(portfolio.shares)} · ${formatCash(positionValue)}`
                    : "…"}
                </span>
              </div>
            </div>
            <div className="segmented" role="tablist" aria-label="Trade side">
              {(["buy", "sell"] as const).map((value) => (
                <button
                  key={value}
                  className={side === value ? "segment active" : "segment"}
                  type="button"
                  role="tab"
                  aria-selected={side === value}
                  disabled={busy}
                  onClick={() => {
                    setSide(value);
                    setSellAll(false);
                  }}
                >
                  {value === "buy" ? "Buy" : "Sell"}
                </button>
              ))}
            </div>
            <form
              className="trade"
              onSubmit={(event) => {
                event.preventDefault();
                if (covered && !busy) void trade();
              }}
            >
              <div className="send-row">
                <label className="field grow">
                  <span className="field-head">
                    Amount ({CASH_SYMBOL})
                    <button
                      type="button"
                      className="link small"
                      disabled={busy || portfolio === null}
                      onClick={fillMax}
                    >
                      Max
                    </button>
                  </span>
                  <input
                    value={amount}
                    inputMode="decimal"
                    placeholder="100.00"
                    disabled={busy}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setSellAll(false);
                    }}
                  />
                </label>
                <button
                  className="btn primary send-btn"
                  type="submit"
                  disabled={!covered || busy}
                >
                  {pending === "trade"
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
              {estimatedShares !== null && fill === null && (
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
                          : ` for ${formatCash(fill.spent)} ${CASH_SYMBOL}`
                      }`
                    : `Sold ${formatShares(fill.shares)} ${TICKER}`}
                </p>
              )}
              {error && <p className="status error">{error}</p>}
            </form>
          </>
        )}
      </section>

      {account.status !== "none" && (
        <div className="account-links">
          {portfolio && portfolio.cash < LOW_CASH_WEI && (
            <button
              className="link"
              type="button"
              disabled={busy}
              onClick={() => void addFunds()}
            >
              {pending === "funding"
                ? "Adding funds…"
                : `Add 10,000 ${CASH_SYMBOL}`}
            </button>
          )}
          <button
            className="link"
            type="button"
            onClick={onLock}
            disabled={account.status === "locked"}
          >
            Lock
          </button>
          <button
            className="link"
            type="button"
            disabled={busy}
            onClick={() => setRecoveryWarning(true)}
          >
            Export account
          </button>
          <button
            className="link"
            type="button"
            disabled={busy}
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      )}

      {recoveryWarning && (
        <section className="backup warning" role="alert">
          <p className="status error">
            The next passkey check reveals the recovery phrase. Anyone who sees
            or copies it can control the account.
          </p>
          <div className="actions">
            <button
              className="btn"
              type="button"
              onClick={() => setRecoveryWarning(false)}
            >
              Cancel
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={busy}
              onClick={() => void showPhrase()}
            >
              {pending === "recovery"
                ? "Waiting for passkey…"
                : "Reveal phrase"}
            </button>
          </div>
        </section>
      )}
      <p className="disclaimer">
        Runs on a demo network. Everything traded is fictional.
      </p>
    </div>
  );
}

export { TradingPanel };
