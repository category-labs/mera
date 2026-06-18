import { type ReactElement, useMemo, useState } from "react";
import type { EthereumContext } from "./chains/ethereum";
import type { SolanaContext } from "./chains/solana";
import {
  type AccountSlot,
  type ConnectedWallet,
  describeError,
  revealMnemonic,
} from "./connect";
import { EthereumAccountCard } from "./EthereumAccountCard";
import type { NetworkMode } from "./network";
import { SolanaAccountCard } from "./SolanaAccountCard";
import { WalletBackup } from "./WalletBackup";

type ChainKind = "ethereum" | "solana";

const CHAINS: { id: ChainKind; label: string }[] = [
  { id: "ethereum", label: "Ethereum" },
  { id: "solana", label: "Solana" },
];

type AccountCardProps = {
  wallet: ConnectedWallet;
  accounts: AccountSlot[];
  activeIndex: number;
  networkMode: NetworkMode;
  onSwitch: (index: number) => void;
  onAddAccount: () => void;
  ethereum: EthereumContext | null;
  ethereumError: string | null;
  solana: SolanaContext | null;
  solanaError: string | null;
  onLock: () => void;
};

/**
 * Account view: an account selector (derived mode only), then a chain toggle,
 * then the chain-specific card for the active account.
 *
 * Switching accounts or chains never triggers a passkey ceremony — every
 * account was derived from the one master seed the wallet already holds.
 */
function AccountCard({
  wallet,
  accounts,
  activeIndex,
  networkMode,
  onSwitch,
  onAddAccount,
  ethereum,
  ethereumError,
  solana,
  solanaError,
  onLock,
}: AccountCardProps): ReactElement {
  const [chain, setChain] = useState<ChainKind>("ethereum");
  const active = accounts[activeIndex] ?? accounts[0];

  // Recovery phrase, revealed on demand by a fresh passkey ceremony. It lives
  // only here while shown and replaces the account card (Hide drops it); the
  // demo never persists it.
  const [phrase, setPhrase] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  async function revealBackup(): Promise<void> {
    setRevealing(true);
    setBackupError(null);
    try {
      setPhrase(await revealMnemonic(wallet));
    } catch (caught) {
      setBackupError(describeError(caught));
    } finally {
      setRevealing(false);
    }
  }

  // On testnet, suggest sending to another of the user's own HD accounts — a
  // self-owned recipient that needs no second address. Deriving it here is free
  // (cached) and invisible: no pill or registry bump until the user reveals it.
  const isTestnet = networkMode === "testnet";
  const suggestion = useMemo(() => {
    if (!isTestnet || wallet.mode !== "derived") return null;
    const index = active.index === 0 ? 1 : 0;
    return {
      index,
      slot: wallet.deriveAccount(index),
      label: `Account ${index + 1}`,
    };
  }, [isTestnet, wallet, active.index]);

  // Reveal the suggested recipient: switch to it if it already has a pill,
  // otherwise add it (which appends at accounts.length and switches).
  function revealAccount(index: number): void {
    if (index < accounts.length) onSwitch(index);
    else onAddAccount();
  }

  // The recovery phrase takes over the card slot rather than stacking a second
  // card below it — keeps the embedded demo compact.
  if (phrase !== null) {
    return (
      <div className="account-shell">
        <WalletBackup phrase={phrase} onHide={() => setPhrase(null)} />
      </div>
    );
  }

  return (
    <div className="account-shell">
      {wallet.mode === "derived" && (
        <div className="account-bar">
          <div className="account-pills" role="tablist" aria-label="Account">
            {accounts.map((slot) => (
              <button
                key={slot.index}
                type="button"
                role="tab"
                aria-selected={slot.index === active.index}
                className={
                  slot.index === active.index
                    ? "account-pill active"
                    : "account-pill"
                }
                onClick={() => onSwitch(slot.index)}
              >
                Account {slot.index + 1}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="link account-add"
            onClick={onAddAccount}
          >
            + Add
          </button>
        </div>
      )}

      <div className="segmented" role="tablist" aria-label="Chain">
        {CHAINS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === chain}
            className={entry.id === chain ? "segment active" : "segment"}
            onClick={() => setChain(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {chain === "ethereum" ? (
        ethereum ? (
          <EthereumAccountCard
            key={`eth-${active.index}-${networkMode}`}
            session={active.ethereum.session}
            address={active.ethereum.address}
            mode={wallet.mode}
            ethereum={ethereum}
            isTestnet={isTestnet}
            suggestedRecipient={suggestion?.slot.ethereum.address}
            suggestedLabel={suggestion?.label}
            onRevealRecipient={
              suggestion ? () => revealAccount(suggestion.index) : undefined
            }
            onLock={onLock}
          />
        ) : ethereumError ? (
          <p className="status error">Ethereum unavailable — {ethereumError}</p>
        ) : (
          <p className="status">Connecting to Ethereum…</p>
        )
      ) : solana ? (
        <SolanaAccountCard
          key={`sol-${active.index}-${networkMode}`}
          session={active.solana.session}
          address={active.solana.address}
          mode={wallet.mode}
          solana={solana}
          isTestnet={isTestnet}
          suggestedRecipient={suggestion?.slot.solana.address}
          suggestedLabel={suggestion?.label}
          onRevealRecipient={
            suggestion ? () => revealAccount(suggestion.index) : undefined
          }
          onLock={onLock}
        />
      ) : solanaError ? (
        <p className="status error">Solana unavailable — {solanaError}</p>
      ) : (
        <p className="status">Connecting to Solana…</p>
      )}

      <div className="backup-trigger">
        <button
          type="button"
          className="link"
          onClick={() => void revealBackup()}
          disabled={revealing}
        >
          {revealing ? "Waiting for passkey…" : "Reveal backup phrase"}
        </button>
        {backupError && <p className="status error">{backupError}</p>}
      </div>
    </div>
  );
}

export { AccountCard };
