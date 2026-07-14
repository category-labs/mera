import { type ReactElement, useEffect, useState } from "react";
import { AccountCard } from "./AccountCard";
import { ConnectCard } from "./ConnectCard";
import { type EthereumContext, getEthereumContext } from "./chains/ethereum";
import { getSolanaContext, type SolanaContext } from "./chains/solana";
import {
  type AccountSlot,
  type ConnectedWallet,
  type ConnectResult,
  describeError,
} from "./connect";
import type { NetworkMode } from "./network";
import { setPasskeyAccountCount } from "./passkeyWallet";

/** Root component: holds the connected wallet + accounts, fetches network info. */
function App(): ReactElement {
  const [ethereumContext, setEthereumContext] =
    useState<EthereumContext | null>(null);
  const [ethereumError, setEthereumError] = useState<string | null>(null);

  const [solanaContext, setSolanaContext] = useState<SolanaContext | null>(
    null,
  );
  const [solanaError, setSolanaError] = useState<string | null>(null);

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
        <ConnectCard onConnected={handleConnected} />
      )}
    </main>
  );
}

export { App };
