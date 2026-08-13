import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AccountChip } from "./AccountChip";
import { type AccountState, accountAddress } from "./account";
import type { EvmContext } from "./network";
import { resolveEvmContext } from "./network";
import { loadAccount } from "./storage";
import { TradingPanel } from "./TradingPanel";
import { describeError } from "./wallet";

function App(): ReactElement {
  const [account, setAccount] = useState<AccountState>(() => {
    const stored = loadAccount();
    return stored === undefined
      ? { status: "none" }
      : { status: "locked", ...stored };
  });
  const [evm, setEvm] = useState<EvmContext | null>(null);
  const [evmError, setEvmError] = useState<string | null>(null);
  const accountRef = useRef(account);
  const operationEpoch = useRef(0);
  const suppressHideLock = useRef(false);
  accountRef.current = account;

  const replaceAccount = useCallback((next: AccountState): void => {
    const current = accountRef.current;
    if (
      current.status === "unlocked" &&
      (next.status !== "unlocked" || next.wallet !== current.wallet)
    ) {
      current.wallet.lock();
    }
    accountRef.current = next;
    setAccount(next);
  }, []);

  const lock = useCallback((): void => {
    operationEpoch.current += 1;
    const current = accountRef.current;
    if (current.status !== "unlocked") return;
    replaceAccount({
      status: "locked",
      address: current.wallet.address,
      credential: current.wallet.credential,
    });
  }, [replaceAccount]);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    async function connectNetwork(): Promise<void> {
      try {
        const context = await resolveEvmContext();
        if (!stopped) {
          setEvm(context);
          setEvmError(null);
        }
      } catch (error) {
        if (!stopped) {
          setEvm(null);
          setEvmError(describeError(error));
          lock();
          timer = window.setTimeout(() => void connectNetwork(), 5_000);
        }
      }
    }
    void connectNetwork();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [lock]);

  useEffect(() => {
    function hide(): void {
      if (document.visibilityState === "hidden" && !suppressHideLock.current) {
        lock();
      }
    }
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", lock);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", lock);
      operationEpoch.current += 1;
      const current = accountRef.current;
      if (current.status === "unlocked") current.wallet.lock();
    };
  }, [lock]);

  return (
    <main className="app extension-app">
      <header className="app-head">
        <h1>mera demo</h1>
        <AccountChip
          address={accountAddress(account)}
          connected={evm !== null}
        />
      </header>
      <TradingPanel
        account={account}
        evm={evm}
        evmError={evmError}
        onAccountChange={replaceAccount}
        onLock={lock}
        operationEpoch={operationEpoch}
        suppressHideLock={suppressHideLock}
      />
    </main>
  );
}

export { App };
