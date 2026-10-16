import { AccountChip } from "@category-labs/mera-demo-shared/AccountChip";
import {
  type AccountState,
  accountAddress,
  loadCachedAccount,
} from "@category-labs/mera-demo-shared/account";
import { useEvmContext } from "@category-labs/mera-demo-shared/hooks";
import { DEMO_RPC_URL } from "@category-labs/mera-demo-shared/network";
import { type ReactElement, useState } from "react";
import { TradingPanel } from "./TradingPanel";

function App(): ReactElement {
  const { evm, evmError } = useEvmContext(DEMO_RPC_URL);
  const [account, setAccount] = useState<AccountState>(() => {
    const cached = loadCachedAccount();
    return cached ? { status: "locked", ...cached } : { status: "none" };
  });

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
        onAccountChange={setAccount}
      />
    </main>
  );
}

export { App };
