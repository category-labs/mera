import { AccountChip } from "@category-labs/mera-demo-shared/AccountChip";
import {
  type AccountState,
  accountAddress,
  loadCachedAccount,
} from "@category-labs/mera-demo-shared/account";
import { describeError } from "@category-labs/mera-demo-shared/connect";
import {
  type EvmContext,
  resolveEvmContext,
  retryingResolve,
} from "@category-labs/mera-demo-shared/network";
import { type ReactElement, useEffect, useState } from "react";
import { RPC_URL } from "./config";
import { TradingCard } from "./TradingCard";

function App(): ReactElement {
  const [evmContext, setEvmContext] = useState<EvmContext | null>(null);
  const [evmError, setEvmError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountState>(() => {
    const cached = loadCachedAccount();
    return cached ? { status: "locked", ...cached } : { status: "none" };
  });

  useEffect(
    () =>
      retryingResolve(
        () => resolveEvmContext({ rpcUrl: RPC_URL }),
        (context) => {
          setEvmContext(context);
          // Clear the failure once a retry lands, or the error line would
          // outlive the outage it reported.
          setEvmError(null);
        },
        (error) => setEvmError(describeError(error)),
      ),
    [],
  );

  return (
    <main className="app">
      <header className="app-head">
        <h1>mera demo</h1>
        <AccountChip
          address={accountAddress(account)}
          connected={evmContext !== null}
        />
      </header>
      <TradingCard
        evm={evmContext}
        evmError={evmError}
        account={account}
        onAccountChange={setAccount}
      />
    </main>
  );
}

export { App };
