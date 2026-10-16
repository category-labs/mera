import { AccountHoldings } from "@category-labs/mera-demo-shared/AccountHoldings";
import {
  type AccountState,
  accountAddress,
  clearCachedAccount,
} from "@category-labs/mera-demo-shared/account";
import { CHART_WINDOW_SECONDS } from "@category-labs/mera-demo-shared/chart";
import {
  type AccountMode,
  type ConnectedWallet,
  connect,
  describeError,
  revealMnemonic,
} from "@category-labs/mera-demo-shared/connect";
import {
  loadCostBasis,
  saveCostBasis,
} from "@category-labs/mera-demo-shared/costBasisStorage";
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
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { ConnectPanel } from "./ConnectPanel";
import { RPC_URL } from "./config";
import { WalletBackup } from "./WalletBackup";

type TradingCardProps = {
  evm: EvmContext | null;
  evmError: string | null;
  account: AccountState;
  onAccountChange: (next: AccountState) => void;
};

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

/**
 * The always-on trading surface: the stock's price, chart, and fake newsroom
 * render for everyone (history comes from the price mirror, so they need no
 * network); the area below them depends on the account state. Unlocked
 * trades sign silently; a passkey prompt appears only at connect, at the
 * first trade after a reload, and when exporting the recovery phrase.
 */
function TradingCard({
  evm,
  evmError,
  account,
  onAccountChange,
}: TradingCardProps): ReactElement {
  const [connectMode, setConnectMode] = useState<AccountMode>("passkey");
  const [connecting, setConnecting] = useState(false);

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
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const [draft, setDraft] = useState<TradeDraft>({
    kind: "amount",
    side: "buy",
    text: "",
  });
  const [fill, setFill] = useState<Fill | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);

  // Recovery phrase, revealed on demand by a fresh passkey ceremony. It lives
  // only here while shown and replaces the card (Hide drops it); the demo
  // never persists it.
  const [phrase, setPhrase] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

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
    setTradeError(null);
    setBackupError(null);
  }

  // The last fill and trade error describe the draft they came from.
  function editDraft(next: TradeDraft): void {
    setDraft(next);
    setFill(null);
    setTradeError(null);
  }

  useEffect(() => {
    const current = position.address;
    const value = position.basis;
    if (current !== null && value !== null) saveCostBasis(current, value);
  }, [position.address, position.basis]);

  const refresh = useCallback(async () => {
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
  }, [evm, address]);

  // Funding needs only an address and the guard no-ops above its threshold,
  // so cached accounts refill after a network reset too. The address-keyed
  // ref also absorbs StrictMode's double mount.
  const funded = useRef<string | null>(null);
  useEffect(() => {
    if (address === null || funded.current === address) return;
    funded.current = address;
    setFunding(true);
    fundAccount(RPC_URL, address)
      .catch(() => {
        // A failed top-up surfaces through the balance read; the button
        // below offers a retry once the network is back.
      })
      .finally(() => {
        setFunding(false);
        void refresh();
      });
  }, [address, refresh]);

  // Funds and reads a freshly connected account before adopting it, so the
  // connect panel gives way to settled balances instead of placeholders that
  // fill in one network round trip at a time. On failure the account is
  // adopted without a portfolio and the poll's read error reports the cause.
  async function openAccount(wallet: ConnectedWallet): Promise<void> {
    let portfolio: Portfolio | null = null;
    const nextAddress = wallet.account.address;
    if (evm !== null) {
      funded.current = nextAddress; // the auto-fund effect must not repeat this
      try {
        await fundAccount(RPC_URL, nextAddress);
        portfolio = await readPortfolio(evm, nextAddress);
      } catch {
        // Adopt anyway; the account exists even when the network misbehaves.
      }
    }
    adoptAccount({ status: "unlocked", wallet }, portfolio);
  }

  useEffect(() => {
    const tick = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1_000,
    );
    return () => window.clearInterval(tick);
  }, []);

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

  // The quote is the mirror at the current second: it equals the on-chain
  // price by construction and ticks without network reads.
  const price = priceAt(BigInt(now));
  const delta = price - priceAt(BigInt(now - CHART_WINDOW_SECONDS));

  async function submit(order: Order): Promise<void> {
    if (loaded === null || evm === null || account.status === "none") return;
    const tradeId = ++operationId.current;
    dispatch({ type: "tradeStarted", tradeId });
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
        onAccountChange({ status: "unlocked", wallet });
      } else {
        wallet = account.wallet;
      }
      const result = await placeOrder({
        session: wallet.account.session,
        evm,
        order,
        price,
        heldShares: loaded.shares,
      });
      setFill(result);
      dispatch({ type: "tradeConfirmed", tradeId, fill: result });
      setDraft((current) => ({ kind: "amount", side: current.side, text: "" }));
      await refresh();
    } catch (caught) {
      setTradeError(describeError(caught));
    } finally {
      dispatch({ type: "tradeFinished", tradeId });
    }
  }

  async function addFunds(): Promise<void> {
    if (address === null) return;
    setFunding(true);
    setTradeError(null);
    try {
      await fundAccount(RPC_URL, address);
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
      const target = account.status === "unlocked" ? account.wallet : account;
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
          <ConnectPanel
            key={connectMode}
            mode={connectMode}
            onConnected={openAccount}
            onBusyChange={setConnecting}
          />
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
                  onSubmit={(order) => void submit(order)}
                />
              </>
            )}
            {tradeError && <p className="status error">{tradeError}</p>}
            {position.readError && (
              <p className="status error">{position.readError}</p>
            )}
          </>
        )}
      </section>

      {account.status !== "none" && (
        <>
          <div className="account-links">
            {loaded !== null && loaded.cash < LOW_CASH_WEI && (
              <button
                type="button"
                className="link"
                onClick={() => void addFunds()}
                disabled={funding}
              >
                {funding ? "Adding funds…" : `Add 10,000 ${CASH_SYMBOL}`}
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
            <button
              type="button"
              className="link"
              onClick={signOut}
              disabled={stage === "sending" || revealing}
            >
              Sign out
            </button>
          </div>
          {backupError && <p className="status error">{backupError}</p>}
        </>
      )}

      <div className="shell-footer">
        {account.status === "none" && (
          <button
            type="button"
            className="mode-switch"
            disabled={connecting}
            onClick={() =>
              setConnectMode(connectMode === "passkey" ? "vault" : "passkey")
            }
          >
            {connectMode === "passkey"
              ? "Import existing secret →"
              : "← Back to passkey accounts"}
          </button>
        )}
        <p className="disclaimer">
          Runs on a demo network. Everything traded is fictional.
        </p>
      </div>
    </div>
  );
}

export { TradingCard };
