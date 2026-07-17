import { type ReactElement, useEffect, useState } from "react";
import { AccountCard } from "./AccountCard";
import { ConnectCard } from "./ConnectCard";
import { type EvmContext, resolveEvmContext } from "./chains/evm";
import {
  type AccountSlot,
  type ConnectedWallet,
  type ConnectResult,
  describeError,
} from "./connect";
import { setPasskeyAccountCount } from "./passkeyWallet";

const RESOLVE_RETRY_MS = 5_000;

/**
 * Resolves a chain context, retrying on failure until stopped. Each failure
 * is surfaced through `onError` while the retries continue, because the demo
 * networks come back empty but reachable after a restart, which can take up
 * to a minute. Returns a stop function for effect cleanup.
 */
function retryingResolve<T>(
  resolve: () => Promise<T>,
  onResolved: (value: T) => void,
  onError: (message: string) => void,
): () => void {
  let stopped = false;
  let timer: number | undefined;
  function attempt(): void {
    resolve().then(
      (value) => {
        if (!stopped) onResolved(value);
      },
      (error: unknown) => {
        if (stopped) return;
        onError(describeError(error));
        timer = window.setTimeout(attempt, RESOLVE_RETRY_MS);
      },
    );
  }
  attempt();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}

/** Root component: holds the connected wallet + accounts, fetches network info. */
function App(): ReactElement {
  const [evmContext, setEvmContext] = useState<EvmContext | null>(null);
  const [evmError, setEvmError] = useState<string | null>(null);

  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [accounts, setAccounts] = useState<AccountSlot[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(
    () => retryingResolve(resolveEvmContext, setEvmContext, setEvmError),
    [],
  );

  function handleConnected(result: ConnectResult) {
    setWallet(result.wallet);
    // Passkey wallets start with two accounts so transfers between demo accounts
    // work immediately: the second pill is visible and the recipient chip points
    // at a real account. Vault mode has a single account.
    const count =
      result.wallet.mode === "passkey"
        ? Math.max(result.accountCount, 2)
        : result.accountCount;
    setAccounts(
      Array.from({ length: count }, (_, index) =>
        result.wallet.deriveAccount(index),
      ),
    );
    setActiveIndex(0);
    if (result.wallet.mode === "passkey" && count !== result.accountCount) {
      setPasskeyAccountCount(count);
    }
  }

  function handleAddAccount() {
    if (wallet?.mode !== "passkey") return;
    const next = wallet.deriveAccount(accounts.length);
    const updated = [...accounts, next];
    setAccounts(updated);
    setActiveIndex(next.index);
    setPasskeyAccountCount(updated.length);
  }

  function handleLock() {
    wallet?.lock();
    setWallet(null);
    setAccounts([]);
    setActiveIndex(0);
  }

  return (
    <main className="app">
      <header className="brand">
        <div className="brand-lockup">
          <div className="mark" aria-hidden="true">
            ◈
          </div>
          <div>
            <h1>Mera Demo</h1>
          </div>
        </div>
      </header>

      {wallet && accounts.length > 0 ? (
        <AccountCard
          wallet={wallet}
          accounts={accounts}
          activeIndex={activeIndex}
          onSwitch={setActiveIndex}
          onAddAccount={handleAddAccount}
          evm={evmContext}
          evmError={evmError}
          onLock={handleLock}
        />
      ) : (
        <ConnectCard onConnected={handleConnected} />
      )}
    </main>
  );
}

export { App };
