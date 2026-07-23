import type { ReactElement } from "react";
import { useCopyButton } from "./useCopyButton";

type WalletBackupProps = {
  /** The revealed recovery phrase to display (12 or 24 words). */
  phrase: string;
  /** Return to the account view, dropping the phrase reference. */
  onHide: () => void;
};

/**
 * Recovery-phrase display, shown in place of the account card.
 *
 * The phrase is held only by the caller's state while shown. `Hide`, or
 * unmounting on lock, drops it. JS strings cannot be zeroed, so this is the
 * tightest lifetime achievable. Fresh user verification gates access while the
 * phrase is hidden.
 */
function WalletBackup({ phrase, onHide }: WalletBackupProps): ReactElement {
  const { copied, copy } = useCopyButton();
  const words = phrase
    .trim()
    .split(/\s+/)
    .map((word, index) => ({
      position: index + 1,
      word,
    }));

  return (
    <section className="backup">
      <div className="backup-head">
        <span className="backup-title">Recovery phrase</span>
        <button type="button" className="link" onClick={onHide}>
          Hide
        </button>
      </div>
      <p className="hint">
        Anyone with these {words.length} words controls the funds. Compatible
        wallet apps, such as MetaMask, can recover the same addresses.
      </p>
      <ol className="mnemonic-grid">
        {words.map(({ position, word }) => (
          <li key={position}>
            <span className="num">{position}</span>
            <span className="mono">{word}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="btn" onClick={() => void copy(phrase)}>
        {copied ? "Copied" : "Copy phrase"}
      </button>
    </section>
  );
}

export { WalletBackup };
