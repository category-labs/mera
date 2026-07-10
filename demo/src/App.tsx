import { type ReactElement, useEffect, useState } from "react";
import { AccountCard } from "./AccountCard";
import { ConnectCard } from "./ConnectCard";
import { type EthereumContext, getEthereumContext } from "./chains/ethereum";
import { getSolanaContext, type SolanaContext } from "./chains/solana";
import {
  type AccountMode,
  type AccountSlot,
  type ConnectedWallet,
  type ConnectResult,
  describeError,
} from "./connect";
import { setDerivedAccountCount } from "./derivedWallet";
import type { NetworkMode } from "./network";

/** Root component: holds the connected wallet + accounts, fetches network info. */
function App(): ReactElement {
  const [ethereumContext, setEthereumContext] =
    useState<EthereumContext | null>(null);
  const [ethereumError, setEthereumError] = useState<string | null>(null);

  const [solanaContext, setSolanaContext] = useState<SolanaContext | null>(
    null,
  );
  const [solanaError, setSolanaError] = useState<string | null>(null);

  const [mode, setMode] = useState<AccountMode>("derived");
  const [networkMode, setNetworkMode] = useState<NetworkMode>("testnet");

  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [accounts, setAccounts] = useState<AccountSlot[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setEthereumContext(null);
    setEthereumError(null);
    setSolanaContext(null);
    setSolanaError(null);

    getEthereumContext(networkMode).then(
      (ctx) => {
        if (cancelled) return;
        setEthereumContext(ctx);
      },
      (error: unknown) => {
        if (cancelled) return;
        setEthereumError(describeError(error));
      },
    );
    getSolanaContext(networkMode).then(
      (ctx) => {
        if (cancelled) return;
        setSolanaContext(ctx);
      },
      (error: unknown) => {
        if (cancelled) return;
        setSolanaError(describeError(error));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [networkMode]);

  function handleConnected(result: ConnectResult) {
    setWallet(result.wallet);
    // Derived wallets start with two accounts so transfers between demo accounts
    // work immediately: the second pill is visible and the recipient chip points
    // at a real account. Wrapped mode has a single account.
    const count =
      result.wallet.mode === "derived"
        ? Math.max(result.accountCount, 2)
        : result.accountCount;
    setAccounts(
      Array.from({ length: count }, (_, index) =>
        result.wallet.deriveAccount(index),
      ),
    );
    setActiveIndex(0);
    if (result.wallet.mode === "derived" && count !== result.accountCount) {
      setDerivedAccountCount(count);
    }
  }

  function handleAddAccount() {
    if (wallet?.mode !== "derived") return;
    const next = wallet.deriveAccount(accounts.length);
    const updated = [...accounts, next];
    setAccounts(updated);
    setActiveIndex(next.index);
    setDerivedAccountCount(updated.length);
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

        <label className="network-toggle">
          <span>Testnet</span>
          <input
            type="checkbox"
            checked={networkMode === "testnet"}
            onChange={(event) =>
              setNetworkMode(
                event.currentTarget.checked ? "testnet" : "mainnet",
              )
            }
            aria-label="Use testnet networks"
          />
          <span className="network-switch" aria-hidden="true" />
        </label>
      </header>

      {wallet && accounts.length > 0 ? (
        <AccountCard
          wallet={wallet}
          accounts={accounts}
          activeIndex={activeIndex}
          networkMode={networkMode}
          onSwitch={setActiveIndex}
          onAddAccount={handleAddAccount}
          ethereum={ethereumContext}
          ethereumError={ethereumError}
          solana={solanaContext}
          solanaError={solanaError}
          onLock={handleLock}
        />
      ) : (
        <ConnectCard
          mode={mode}
          onModeChange={setMode}
          onConnected={handleConnected}
        />
      )}
    </main>
  );
}

export { App };
