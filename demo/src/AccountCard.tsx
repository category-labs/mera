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
import { WalletBackup } from "./WalletBackup";

type AccountCardProps = {
  wallet: ConnectedWallet;
  accounts: AccountSlot[];
  activeIndex: number;
  onSwitch: (index: number) => void;
  onAddAccount: () => void;
  evm: EvmContext | null;
  evmError: string | null;
  onLock: () => void;
};

/**
 * Account view: an account selector (passkey mode only), then the card for
 * the active account.
 *
 * Switching accounts never triggers a passkey ceremony because every account
 * was derived from the one seed the wallet already holds.
 */
function AccountCard({
  wallet,
  accounts,
  activeIndex,
  onSwitch,
  onAddAccount,
  evm,
  evmError,
  onLock,
}: AccountCardProps): ReactElement {
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

  // Shapes the suggestion for the card, picking the suggested EVM address.
  const cardSuggestion: RecipientSuggestion | undefined = suggestion
    ? {
        address: suggestion.slot.evm.address,
        label: suggestion.label,
        onReveal: () => revealAccount(suggestion.index),
      }
    : undefined;

  const evmAdapter = useMemo(
    () =>
      evm
        ? createEvmAdapter(active.evm.session, active.evm.address, evm)
        : null,
    [active, evm],
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

      {evmAdapter ? (
        <ChainAccountCard
          key={active.index}
          adapter={evmAdapter}
          address={active.evm.address}
          mode={wallet.mode}
          suggestion={cardSuggestion}
          onLock={onLock}
        />
      ) : evmError ? (
        <p className="status error">The network is unavailable: {evmError}</p>
      ) : (
        <p className="status">The demo is connecting to the network…</p>
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
