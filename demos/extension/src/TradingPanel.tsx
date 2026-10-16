import type { PasskeyCredentialMetadata } from "@category-labs/mera";
import { AccountHoldings } from "@category-labs/mera-demo-shared/AccountHoldings";
import { CHART_WINDOW_SECONDS } from "@category-labs/mera-demo-shared/chart";
import { prfOutputToMnemonic } from "@category-labs/mera-demo-shared/hd";
import {
  COMPANY_NAME,
  type Fill,
  LOW_CASH_WEI,
  type Order,
  type Portfolio,
  placeOrder,
  priceAt,
  REFRESH_MS,
  readPortfolio,
  TICKER,
  type TradeDraft,
} from "@category-labs/mera-demo-shared/market";
import { NewsTicker } from "@category-labs/mera-demo-shared/NewsTicker";
import {
  DEMO_RPC_URL,
  type EvmContext,
  fundAccount,
} from "@category-labs/mera-demo-shared/network";
import { PriceChart } from "@category-labs/mera-demo-shared/PriceChart";
import {
  initialPositionState,
  loadedPosition,
  positionReducer,
} from "@category-labs/mera-demo-shared/position";
import { TradeForm } from "@category-labs/mera-demo-shared/TradeForm";
import {
  CASH_SYMBOL,
  formatCash,
  formatSignedCash,
} from "@category-labs/mera-demo-shared/ui";
import {
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { isAddressEqual } from "viem";
import { type AccountState, accountAddress } from "./account";
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

// The switch to `next`, with the cost basis this device stored for it.
function accountChanged(
  next: AccountState,
  portfolio: Portfolio | null,
): positionReducer.Event {
  const nextAddress = accountAddress(next);
  return {
    type: "accountChanged",
    address: nextAddress,
    basis: nextAddress === null ? null : loadCostBasis(nextAddress),
    portfolio,
  };
}

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
  | "opening:create"
  | "opening:signin"
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
  const address = accountAddress(account);
  const [position, dispatch] = useReducer(
    positionReducer,
    initialPositionState,
  );
  // Reset during render rather than in an effect, so no frame shows the
  // previous account's position.
  if (position.address !== address) dispatch(accountChanged(account, null));
  const loaded = loadedPosition(position);
  const stage = position.trade?.stage ?? null;
  const [draft, setDraft] = useState<TradeDraft>({
    kind: "amount",
    side: "buy",
    text: "",
  });
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const statusError = error ?? position.readError;
  const [fill, setFill] = useState<Fill | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [recoveryWarning, setRecoveryWarning] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const funded = useRef<string | null>(null);
  const busy = pending !== null || stage === "sending";

  const operationId = useRef(0);

  // Switches to `next` and drops everything scoped to the previous account.
  function adoptAccount(
    next: AccountState,
    portfolio: Portfolio | null = null,
  ): void {
    onAccountChange(next);
    dispatch(accountChanged(next, portfolio));
    setDraft((current) => ({ kind: "amount", side: current.side, text: "" }));
    setFill(null);
    setError(null);
  }

  // The last fill and error describe the draft they came from.
  function editDraft(next: TradeDraft): void {
    setDraft(next);
    setFill(null);
    setError(null);
  }

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
    const requestId = ++operationId.current;
    dispatch({ type: "readStarted", address, requestId });
    try {
      const read = await readPortfolio(evm, address);
      dispatch({ type: "portfolioLoaded", requestId, portfolio: read });
    } catch (caught) {
      dispatch({
        type: "refreshFailed",
        requestId,
        error: describeError(caught),
      });
    }
  }, [address, evm]);

  useEffect(() => {
    const current = position.address;
    const value = position.basis;
    if (current === null || value === null) return;
    try {
      saveCostBasis(current, value);
    } catch (caught) {
      setError(describeError(caught));
    }
  }, [position.address, position.basis]);

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
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

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
    // The network context can resolve while a user action is already
    // pending; the functional updates leave such an action's state alone.
    setPending((current) => current ?? "funding");
    void fundAccount(DEMO_RPC_URL, address)
      .then(refresh)
      .catch(reportError)
      .finally(() =>
        setPending((current) => (current === "funding" ? null : current)),
      );
  }, [address, evm, refresh, reportError]);

  useEffect(() => {
    if (phrase === null) return;
    const timer = window.setTimeout(hideRecovery, RECOVERY_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [hideRecovery, phrase]);

  const price = priceAt(BigInt(now));
  const delta = price - priceAt(BigInt(now - CHART_WINDOW_SECONDS));
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
      // Fund and read the account before adopting it, so the connect buttons
      // give way to settled balances instead of placeholders that fill in
      // one network round trip at a time.
      setPending(`opening:${action}`);
      funded.current = wallet.address; // the auto-fund effect must not repeat this
      let portfolio: Portfolio | null = null;
      try {
        await fundAccount(DEMO_RPC_URL, wallet.address);
        portfolio = await readPortfolio(evm, wallet.address);
      } catch {
        // Adopt anyway; the account exists even when the network misbehaves.
      }
      if (!operationIsCurrent(epoch, viaTab)) {
        wallet.lock();
        return;
      }
      saveAccount({ address: wallet.address, credential: wallet.credential });
      adoptAccount({ status: "unlocked", wallet }, portfolio);
    } catch (caught) {
      wallet?.lock();
      if (operationIsCurrent(epoch, viaTab)) setError(describeError(caught));
    } finally {
      setPending(null);
    }
  }

  function connectLabel(action: "create" | "signin", idle: string): string {
    if (pending === action) return "Waiting for passkey…";
    if (pending === `opening:${action}`) return "Opening account…";
    return idle;
  }

  async function trade(order: Order): Promise<void> {
    if (loaded === null || evm === null || account.status === "none") return;
    const epoch = operationEpoch.current;
    const viaTab = isSidePanel() && account.status === "locked";
    const tradeId = ++operationId.current;
    dispatch({ type: "tradeStarted", tradeId });
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
      const result = await placeOrder({
        session: wallet.session,
        evm,
        order,
        price,
        heldShares: loaded.shares,
      });
      // The trade is on chain even when the panel hid or locked meanwhile,
      // and locking keeps the account, so its position still counts the fill.
      dispatch({ type: "tradeConfirmed", tradeId, fill: result });
      if (!operationIsCurrent(epoch, viaTab)) {
        wallet.lock();
        return;
      }
      setFill(result);
      setDraft((current) => ({ kind: "amount", side: current.side, text: "" }));
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
      dispatch({ type: "tradeFinished", tradeId });
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
      adoptAccount({ status: "none" });
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
              {formatSignedCash(delta)} · 30m
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
                {connectLabel("create", "Create account")}
              </button>
              <button
                className="btn"
                type="button"
                disabled={busy || evm === null}
                onClick={() => void connect("signin")}
              >
                {connectLabel("signin", "Sign in")}
              </button>
            </div>
            {statusError && <p className="status error">{statusError}</p>}
          </div>
        ) : (
          <>
            {loaded === null ? (
              <div className="holdings">
                <p className="hint">Loading balances…</p>
              </div>
            ) : (
              <>
                <AccountHoldings
                  position={loaded}
                  price={price}
                  settling={stage === "settling"}
                />
                <TradeForm
                  draft={draft}
                  onDraftChange={editDraft}
                  portfolio={loaded}
                  price={price}
                  stage={stage}
                  locked={account.status === "locked"}
                  fill={fill}
                  disabled={pending !== null}
                  onSubmit={(order) => void trade(order)}
                />
              </>
            )}
            {statusError && <p className="status error">{statusError}</p>}
          </>
        )}
      </section>

      {account.status !== "none" && (
        <div className="account-links">
          {loaded !== null && loaded.cash < LOW_CASH_WEI && (
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
