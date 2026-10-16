import { AccountHoldings } from "@category-labs/mera-demo-shared/AccountHoldings";
import {
  type AccountState,
  accountAddress,
  clearCachedAccount,
} from "@category-labs/mera-demo-shared/account";
import {
  type AccountMode,
  type ConnectedWallet,
  connect,
  revealMnemonic,
} from "@category-labs/mera-demo-shared/connect";
import { costBasisStorage } from "@category-labs/mera-demo-shared/costBasisStorage";
import { describeError } from "@category-labs/mera-demo-shared/errors";
import { useNow, usePosition } from "@category-labs/mera-demo-shared/hooks";
import {
  type Fill,
  LOW_CASH_WEI,
  type Order,
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
import { type ReactElement, useState } from "react";
import { ConnectPanel } from "./ConnectPanel";

type TradingCardProps = {
  evm: EvmContext | null;
  evmError: string | null;
  account: AccountState;
  onAccountChange: (next: AccountState) => void;
};

const clearedDraft = (draft: TradeDraft): TradeDraft => ({
  kind: "amount",
  side: draft.side,
  text: "",
});

/**
 * The trading surface. The stock renders for everyone; the area below it
 * depends on the account. Trades sign without a prompt; a passkey prompt
 * appears only at connect, at the first trade after a reload, and when
 * exporting the recovery phrase.
 */
function TradingCard({
  evm,
  evmError,
  account,
  onAccountChange,
}: TradingCardProps): ReactElement {
  const now = useNow();
  // The mirror equals the on-chain price by construction.
  const price = priceAt(BigInt(now));
  const { position, loaded, stage, funding, fund, adopt, trade } = usePosition(
    evm,
    accountAddress(account),
    costBasisStorage,
  );
  const [connectMode, setConnectMode] = useState<AccountMode>("passkey");
  const [connecting, setConnecting] = useState(false);
  const [draft, setDraft] = useState<TradeDraft>({
    kind: "amount",
    side: "buy",
    text: "",
  });
  const [fill, setFill] = useState<Fill | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  // Revealed by a fresh passkey ceremony and never persisted.
  const [phrase, setPhrase] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Switches to `next` and drops everything scoped to the previous account.
  function switchAccount(next: AccountState): void {
    onAccountChange(next);
    setDraft(clearedDraft);
    setFill(null);
    setTradeError(null);
    setBackupError(null);
  }

  // The fill and the error describe the draft they came from.
  function editDraft(next: TradeDraft): void {
    setDraft(next);
    setFill(null);
    setTradeError(null);
  }

  async function openAccount(wallet: ConnectedWallet): Promise<void> {
    // Fund and read the account first, so the connect panel gives way to
    // settled balances.
    if (evm !== null) {
      try {
        await fundAccount(evm, wallet.address);
        adopt(wallet.address, await readPortfolio(evm, wallet.address));
      } catch {
        // Show the account anyway; the balance reads report the failure.
      }
    }
    switchAccount({ status: "unlocked", wallet });
  }

  async function submit(order: Order): Promise<void> {
    if (loaded === null || evm === null || account.status === "none") return;
    setTradeError(null);
    setFill(null);
    try {
      const filled = await trade(async () => {
        let wallet: ConnectedWallet;
        if (account.status === "unlocked") {
          wallet = account.wallet;
        } else {
          // The ceremony must be the first await, so the click's user
          // activation still covers the WebAuthn prompt (Safari enforces it).
          wallet = await connect(account.mode, "signin");
          if (wallet.address !== account.address) {
            // The amount was checked against the old portfolio.
            switchAccount({ status: "unlocked", wallet });
            throw new Error(
              "That passkey opens a different account; its balances are shown now.",
            );
          }
          onAccountChange({ status: "unlocked", wallet });
        }
        return placeOrder({
          session: wallet.session,
          evm,
          order,
          price,
          heldShares: loaded.shares,
        });
      });
      setFill(filled);
      setDraft(clearedDraft);
    } catch (caught) {
      setTradeError(describeError(caught));
    }
  }

  async function addFunds(): Promise<void> {
    setTradeError(null);
    try {
      await fund();
    } catch (caught) {
      setTradeError(describeError(caught));
    }
  }

  async function revealBackup(): Promise<void> {
    if (account.status === "none") return;
    setRevealing(true);
    setBackupError(null);
    try {
      setPhrase(
        await revealMnemonic(
          account.status === "unlocked" ? account.wallet : account,
        ),
      );
    } catch (caught) {
      setBackupError(describeError(caught));
    } finally {
      setRevealing(false);
    }
  }

  function signOut(): void {
    if (account.status === "unlocked") account.wallet.session.end();
    clearCachedAccount();
    switchAccount({ status: "none" });
  }

  // The phrase takes over the card slot, keeping the embedded demo compact.
  if (phrase !== null) {
    return (
      <div className="account-shell">
        <RecoveryPhrase phrase={phrase} onHide={() => setPhrase(null)} />
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
