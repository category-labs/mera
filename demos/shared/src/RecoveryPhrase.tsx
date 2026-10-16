import type { ReactElement, ReactNode } from "react";
import { useCopyButton } from "./hooks";

type RecoveryPhraseProps = {
  phrase: string;
  onHide: () => void;
  /** Notices shown above the copy button. */
  children?: ReactNode;
};

/**
 * The recovery phrase, shown in place of the account card. Only the caller's
 * state holds the phrase; JS strings cannot be zeroed, so dropping it on Hide
 * is the tightest lifetime available.
 */
function RecoveryPhrase({
  phrase,
  onHide,
  children,
}: RecoveryPhraseProps): ReactElement {
  const { copied, copy } = useCopyButton();
  const words = phrase
    .split(" ")
    .map((word, index) => ({ position: index + 1, word }));
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
      {children}
      <button type="button" className="btn" onClick={() => void copy(phrase)}>
        {copied ? "Copied" : "Copy phrase"}
      </button>
    </section>
  );
}

export { RecoveryPhrase };
