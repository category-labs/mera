import { AccountChip } from "@category-labs/mera-demo-shared/AccountChip";
import {
  type AccountState,
  accountAddress,
  loadCachedAccount,
} from "@category-labs/mera-demo-shared/account";
import { useEvmContext } from "@category-labs/mera-demo-shared/hooks";
import { DEMO_RPC_URL } from "@category-labs/mera-demo-shared/network";
import { type ReactElement, useState } from "react";
import { TradingCard } from "./TradingCard";

// Set in demos/web/.env to run against a local network.
const RPC_URL = import.meta.env.VITE_EVM_RPC_URL ?? DEMO_RPC_URL;

function App(): ReactElement {
  const { evm, evmError } = useEvmContext(RPC_URL);
  const [account, setAccount] = useState<AccountState>(() => {
    const cached = loadCachedAccount();
    return cached ? { status: "locked", ...cached } : { status: "none" };
  });

  return (
    <main className="app">
      <header className="app-head">
        <h1>mera demo</h1>
        <AccountChip
          address={accountAddress(account)}
          connected={evm !== null}
        />
      </header>
      <TradingCard
        evm={evm}
        evmError={evmError}
        account={account}
        onAccountChange={setAccount}
      />
    </main>
  );
}

export { App };
