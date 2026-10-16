import { AccountHoldings } from "@category-labs/mera-demo-shared/AccountHoldings";
import {
  type AccountState,
  accountAddress,
  type CachedAccount,
  clearCachedAccount,
  saveCachedAccount,
} from "@category-labs/mera-demo-shared/account";
import {
  type ConnectedWallet,
  walletFromPrf,
} from "@category-labs/mera-demo-shared/connect";
import { costBasisStorage } from "@category-labs/mera-demo-shared/costBasisStorage";
import { describeError } from "@category-labs/mera-demo-shared/errors";
import { prfOutputToMnemonic } from "@category-labs/mera-demo-shared/hd";
import { useNow, usePosition } from "@category-labs/mera-demo-shared/hooks";
import {
  type Fill,
  LOW_CASH_WEI,
  type Order,
  type Portfolio,
  placeOrder,
  priceAt,
  readPortfolio,
  type TradeDraft,
} from "@category-labs/mera-demo-shared/market";
import {
  type EvmContext,
  fundAccount,
} from "@category-labs/mera-demo-shared/network";
import { RecoveryPhrase } from "@category-labs/mera-demo-shared/RecoveryPhrase";
import { StockOverview } from "@category-labs/mera-demo-shared/StockOverview";
import { TradeForm } from "@category-labs/mera-demo-shared/TradeForm";
import { CASH_SYMBOL } from "@category-labs/mera-demo-shared/ui";
import {
  type ReactElement,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { passkeyTabOpen, requestPrf } from "./passkey";

const RECOVERY_VISIBLE_MS = 60_000;

type Props = {
  evm: EvmContext | null;
  evmError: string | null;
  account: AccountState;
  onAccountChange(next: AccountState): void;
};

type Pending =
  | "create"
  | "signin"
  | "opening:create"
  | "opening:signin"
  | "recovery";

const clearedDraft = (draft: TradeDraft): TradeDraft => ({
  kind: "amount",
  side: draft.side,
  text: "",
});

const cachedAccount = (wallet: ConnectedWallet): CachedAccount => ({
  mode: "passkey",
  address: wallet.address,
  credential: wallet.credential,
});

/**
 * The side panel's trading surface. The account locks whenever the panel
 * hides, and every ceremony, trade, or reveal still running across a lock
 * drops its result, so a hidden panel never holds a live signing session or
 * shows a recovery phrase.
 */
function TradingPanel({
  evm,
  evmError,
  account,
  onAccountChange,
}: Props): ReactElement {
  const now = useNow();
  // The mirror equals the on-chain price by construction.
  const price = priceAt(BigInt(now));
  const { position, loaded, stage, funding, fund, adopt, trade } = usePosition(
    evm,
    accountAddress(account),
    costBasisStorage,
  );
  const [draft, setDraft] = useState<TradeDraft>({
    kind: "amount",
    side: "buy",
    text: "",
  });
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fill, setFill] = useState<Fill | null>(null);
  const [recoveryWarning, setRecoveryWarning] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);
  // Counts locks, so an operation can tell whether one happened since it began.
  const locks = useRef(0);
  // The unlocked wallet, kept outside render so a lock that lands before the
  // next render still ends its session.
  const unlocked = useRef<ConnectedWallet | null>(null);
  const busy = pending !== null || funding || stage === "sending";
  const statusError = error ?? position.readError;

  function unlockWith(wallet: ConnectedWallet): void {
    unlocked.current = wallet;
    onAccountChange({ status: "unlocked", wallet });
  }

  function lock(): void {
    locks.current += 1;
    setRecoveryWarning(false);
    setPhrase(null);
    const wallet = unlocked.current;
    if (wallet === null) return;
    unlocked.current = null;
    wallet.session.end();
    onAccountChange({ status: "locked", ...cachedAccount(wallet) });
  }

  const lockOnHide = useEffectEvent(lock);
  useEffect(() => {
    // The passkey tab hides the panel while its ceremony runs.
    function onVisibilityChange(): void {
      if (document.visibilityState === "hidden" && !passkeyTabOpen()) {
        lockOnHide();
      }
    }
    function onPageHide(): void {
      lockOnHide();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      // Unmounting counts as hiding, so no session or pending result outlives
      // the panel.
      lockOnHide();
    };
  }, []);

  useEffect(() => {
    if (phrase === null) return;
    const timer = setTimeout(() => setPhrase(null), RECOVERY_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [phrase]);

  // The fill and the error describe the draft they came from.
  function editDraft(next: TradeDraft): void {
    setDraft(next);
    setFill(null);
    setError(null);
  }

  async function connect(action: "create" | "signin"): Promise<void> {
    if (evm === null) return;
    const started = locks.current;
    setPending(action);
    setError(null);
    let wallet: ConnectedWallet | undefined;
    try {
      wallet = walletFromPrf(
        await requestPrf(action === "create" ? "create" : "get"),
      );
      if (locks.current !== started) return;
      // Fund and read the account first, so the connect buttons give way to
      // settled balances.
      setPending(`opening:${action}`);
      let portfolio: Portfolio | null = null;
      try {
        await fundAccount(evm, wallet.address);
        portfolio = await readPortfolio(evm, wallet.address);
      } catch {
        // Show the account anyway; the balance reads report the failure.
      }
      if (locks.current !== started) return;
      saveCachedAccount(cachedAccount(wallet));
      if (portfolio !== null) adopt(wallet.address, portfolio);
      unlockWith(wallet);
      setDraft(clearedDraft);
      setFill(null);
      // The account owns the session now.
      wallet = undefined;
    } catch (caught) {
      if (locks.current === started) setError(describeError(caught));
    } finally {
      wallet?.session.end();
      setPending(null);
    }
  }

  function connectLabel(action: "create" | "signin", idle: string): string {
    if (pending === action) return "Waiting for passkey…";
    if (pending === `opening:${action}`) return "Opening account…";
    return idle;
  }

  // Restores the cached account's session with a ceremony pinned to its
  // credential; null when a lock happened during the ceremony.
  async function unlock(
    locked: CachedAccount,
    started: number,
  ): Promise<ConnectedWallet | null> {
    const wallet = walletFromPrf(await requestPrf("get", locked.credential));
    if (locks.current !== started || wallet.address !== locked.address) {
      wallet.session.end();
      if (locks.current !== started) return null;
      clearCachedAccount();
      throw new Error("The passkey does not match the cached account.");
    }
    unlockWith(wallet);
    return wallet;
  }

  async function submit(order: Order): Promise<void> {
    if (loaded === null || evm === null || account.status === "none") return;
    const started = locks.current;
    setError(null);
    setFill(null);
    try {
      const filled = await trade(async () => {
        const wallet =
          account.status === "unlocked"
            ? account.wallet
            : await unlock(account, started);
        if (wallet === null) return null;
        return placeOrder({
          session: wallet.session,
          evm,
          order,
          price,
          heldShares: loaded.shares,
        });
      });
      // A lock during the trade keeps its fill in the position, but not on
      // screen.
      if (filled === null || locks.current !== started) return;
      setFill(filled);
      setDraft(clearedDraft);
    } catch (caught) {
      if (locks.current === started) setError(describeError(caught));
    }
  }

  async function revealPhrase(): Promise<void> {
    if (account.status === "none") return;
    const started = locks.current;
    const credential =
      account.status === "unlocked"
        ? account.wallet.credential
        : account.credential;
    setPending("recovery");
    setError(null);
    try {
      const { prfOutput } = await requestPrf("recovery", credential);
      const revealed = prfOutputToMnemonic(prfOutput);
      if (locks.current !== started) return;
      setPhrase(revealed);
      setRecoveryWarning(false);
    } catch (caught) {
      if (locks.current === started) setError(describeError(caught));
    } finally {
      setPending(null);
    }
  }

  async function addFunds(): Promise<void> {
    setError(null);
    try {
      await fund();
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  function signOut(): void {
    unlocked.current?.session.end();
    unlocked.current = null;
    clearCachedAccount();
    onAccountChange({ status: "none" });
    setDraft(clearedDraft);
    setFill(null);
    setError(null);
  }

  if (phrase !== null) {
    return (
      <div className="account-shell">
        <RecoveryPhrase phrase={phrase} onHide={() => setPhrase(null)}>
          <p className="status error">The phrase hides after 60 seconds.</p>
          <p className="hint">
            Copying exposes the phrase to applications that can read the
            clipboard.
          </p>
        </RecoveryPhrase>
        <div className="account-links">
          <button className="link" type="button" onClick={lock}>
            Lock account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="account-shell">
      <section className="card">
        <StockOverview now={now} />
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
                  disabled={pending !== null || funding}
                  onSubmit={(order) => void submit(order)}
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
              {funding ? "Adding funds…" : `Add 10,000 ${CASH_SYMBOL}`}
            </button>
          )}
          <button
            className="link"
            type="button"
            onClick={lock}
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
              onClick={() => void revealPhrase()}
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
