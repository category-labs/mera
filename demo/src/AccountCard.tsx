import type { Connection } from "@solana/web3.js";
import { type ReactElement, useMemo, useState } from "react";
import { ChainAccountCard, type RecipientSuggestion } from "./ChainAccountCard";
import type { EvmContext } from "./chains/evm";
import {
  type AccountSlot,
  type ConnectedWallet,
  describeError,
  revealMnemonic,
} from "./connect";
import { createEvmAdapter } from "./evmAdapter";
import { createSolanaAdapter } from "./solanaAdapter";
import { WalletBackup } from "./WalletBackup";

type ChainKind = "evm" | "solana";

const CHAINS: { id: ChainKind; label: string }[] = [
  { id: "evm", label: "EVM" },
  { id: "solana", label: "Solana" },
];

type AccountCardProps = {
  wallet: ConnectedWallet;
  accounts: AccountSlot[];
  activeIndex: number;
  onSwitch: (index: number) => void;
  onAddAccount: () => void;
  evm: EvmContext | null;
  evmError: string | null;
  solana: Connection | null;
  solanaError: string | null;
  onLock: () => void;
};

/**
 * Account view: an account selector (passkey mode only), then a chain toggle,
 * then the chain-specific card for the active account.
 *
 * Switching accounts or chains never triggers a passkey ceremony because every
 * account was derived from the one seed the wallet already holds.
 */
function AccountCard({
  wallet,
  accounts,
  activeIndex,
  onSwitch,
  onAddAccount,
  evm,
  evmError,
  solana,
  solanaError,
  onLock,
}: AccountCardProps): ReactElement {
  const [chain, setChain] = useState<ChainKind>("evm");
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

  // Suggest sending to another HD account controlled by the same passkey.
  // Deriving it here is cached and invisible: no pill or stored-account
  // bump appears until the account is revealed.
  const suggestion = useMemo(() => {
    if (wallet.mode !== "passkey") return null;
    const index = active.index === 0 ? 1 : 0;
    return {
      index,
      slot: wallet.deriveAccount(index),
      label: `Account ${index + 1}`,
    };
  }, [wallet, active.index]);

  // Reveal the suggested recipient: switch to it if it already has a pill,
  // otherwise add it (which appends at accounts.length and switches).
  function revealAccount(index: number): void {
    if (index < accounts.length) onSwitch(index);
    else onAddAccount();
  }

  // Shapes the suggestion for one chain's card, picking that chain's address.
  function suggestionFor(kind: ChainKind): RecipientSuggestion | undefined {
    if (!suggestion) return undefined;
    return {
      address: suggestion.slot[kind].address,
      label: suggestion.label,
      onReveal: () => revealAccount(suggestion.index),
    };
  }

  const evmAdapter = useMemo(
    () =>
      evm
        ? createEvmAdapter(active.evm.session, active.evm.address, evm)
        : null,
    [active, evm],
  );
  const solanaAdapter = useMemo(
    () =>
      solana
        ? createSolanaAdapter(
            active.solana.session,
            active.solana.address,
            solana,
          )
        : null,
    [active, solana],
  );

  // The recovery phrase takes over the card slot rather than stacking a second
  // card below it, which keeps the embedded demo compact.
  if (phrase !== null) {
    return (
      <div className="account-shell">
        <WalletBackup phrase={phrase} onHide={() => setPhrase(null)} />
      </div>
    );
  }

  return (
    <div className="account-shell">
      {wallet.mode === "passkey" && (
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

      {chain === "evm" ? (
        evmAdapter ? (
          <ChainAccountCard
            key={`evm-${active.index}`}
            adapter={evmAdapter}
            address={active.evm.address}
            mode={wallet.mode}
            suggestion={suggestionFor("evm")}
            onLock={onLock}
          />
        ) : evmError ? (
          <p className="status error">EVM is unavailable: {evmError}</p>
        ) : (
          <p className="status">The demo is connecting to EVM…</p>
        )
      ) : solanaAdapter ? (
        <ChainAccountCard
          key={`sol-${active.index}`}
          adapter={solanaAdapter}
          address={active.solana.address}
          mode={wallet.mode}
          suggestion={suggestionFor("solana")}
          onLock={onLock}
        />
      ) : solanaError ? (
        <p className="status error">Solana is unavailable: {solanaError}</p>
      ) : (
        <p className="status">The demo is connecting to Solana…</p>
      )}

      <div className="backup-trigger">
        <button
          type="button"
          className="link"
          onClick={() => void revealBackup()}
          disabled={revealing}
        >
          {revealing ? "Waiting for passkey…" : "Reveal recovery phrase"}
        </button>
        {backupError && <p className="status error">{backupError}</p>}
      </div>
    </div>
  );
}

export { AccountCard };
