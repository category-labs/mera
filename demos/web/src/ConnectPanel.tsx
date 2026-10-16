import {
  type AccountMode,
  type ConnectedWallet,
  connect,
} from "@category-labs/mera-demo-shared/connect";
import { describeError } from "@category-labs/mera-demo-shared/errors";
import {
  createMnemonic,
  isValidMnemonic,
} from "@category-labs/mera-demo-shared/hd";
import { type ReactElement, useRef, useState } from "react";

type ConnectAction = "create" | "signin";

type ConnectPanelProps = {
  mode: AccountMode;
  onConnected: (wallet: ConnectedWallet) => Promise<void>;
  /**
   * Called with true at the click and false once the attempt settles, even
   * after the panel unmounts, so the parent can block a mode switch whose new
   * panel would race this one.
   */
  onBusyChange: (busy: boolean) => void;
};

/**
 * Create and sign-in actions under the market data. Vault mode adds the
 * recovery phrase the new account is encrypted from. The panel stays busy
 * until `onConnected` settles, so the parent can load the account before the
 * panel gives way. Mount with `key={mode}` so switching modes resets it.
 */
function ConnectPanel({
  mode,
  onConnected,
  onBusyChange,
}: ConnectPanelProps): ReactElement {
  const [secret, setSecret] = useState("");
  // The ceremony, then the awaited `onConnected`.
  const [busy, setBusy] = useState<{
    action: ConnectAction;
    phase: "passkey" | "opening";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The phrase input is uncontrolled: React copies a controlled input's value
  // into its `value` attribute, where CSS attribute selectors and DOM
  // snapshots can read it.
  const secretInput = useRef<HTMLInputElement>(null);

  const trimmedSecret = secret.trim();
  const secretValid = isValidMnemonic(trimmedSecret);

  function generate(): void {
    const phrase = createMnemonic();
    if (secretInput.current) secretInput.current.value = phrase;
    setSecret(phrase);
    setError(null);
  }

  async function run(action: ConnectAction): Promise<void> {
    setBusy({ action, phase: "passkey" });
    setError(null);
    onBusyChange(true);
    try {
      const wallet = await connect(mode, action, secret);
      setBusy({ action, phase: "opening" });
      await onConnected(wallet);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
      onBusyChange(false);
    }
  }

  function actionLabel(action: ConnectAction, idle: string): string {
    if (busy?.action !== action) return idle;
    return busy.phase === "passkey"
      ? "Waiting for passkey…"
      : "Opening account…";
  }

  return (
    <div className="connect-cta">
      {mode === "vault" && (
        <>
          <p className="hint">
            The demo encrypts a recovery phrase in a vault that opens with the
            passkey. Generate a fresh one rather than importing a phrase that
            holds funds.
          </p>
          <div className="field">
            <span className="field-head">
              <label htmlFor="recovery-phrase">Recovery phrase</label>
              <button
                type="button"
                className="link small"
                onClick={generate}
                disabled={busy !== null}
              >
                Generate
              </button>
            </span>
            <input
              id="recovery-phrase"
              ref={secretInput}
              placeholder="Generate a recovery phrase, or paste one from a wallet app"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(event) => setSecret(event.target.value)}
              disabled={busy !== null}
            />
          </div>
          {trimmedSecret.length > 0 && !secretValid && (
            <p className="status error">That is not a valid recovery phrase.</p>
          )}
        </>
      )}
      <div className="actions">
        <button
          type="button"
          className="btn primary"
          onClick={() => void run("create")}
          disabled={busy !== null || (mode === "vault" && !secretValid)}
        >
          {actionLabel(
            "create",
            mode === "vault" ? "Open account" : "Create account",
          )}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void run("signin")}
          disabled={busy !== null}
        >
          {actionLabel("signin", "Sign in")}
        </button>
      </div>
      {error && <p className="status error">{error}</p>}
    </div>
  );
}

export { ConnectPanel };
