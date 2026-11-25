import type {
  AccountMode,
  ConnectedWallet,
} from "@category-labs/mera-demo-shared/connect";
import { connect } from "@category-labs/mera-demo-shared/connect";
import { describeError } from "@category-labs/mera-demo-shared/errors";
import {
  createMnemonic,
  isValidMnemonic,
} from "@category-labs/mera-demo-shared/hd";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

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
  // The first action is the primary one. Vault sign-in opens only a vault this
  // browser saved, so sign-in leads only in passkey mode, where any passkey
  // for the site can answer.
  const actions: ConnectAction[] =
    mode === "passkey" ? ["signin", "create"] : ["create", "signin"];

  function generate(): void {
    const phrase = createMnemonic();
    if (secretInput.current) {
      secretInput.current.value = phrase;
    }
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

  function actionLabel(action: ConnectAction): string {
    if (busy?.action === action) {
      return busy.phase === "passkey"
        ? "Waiting for passkey…"
        : "Opening account…";
    }
    if (action === "signin") {
      return "Sign in with a passkey";
    }
    return mode === "vault" ? "Create a vault" : "Create a new wallet";
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
                className="link small"
                disabled={busy !== null}
                onClick={generate}
                type="button"
              >
                Generate
              </button>
            </span>
            <input
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              disabled={busy !== null}
              id="recovery-phrase"
              onChange={(event) => setSecret(event.target.value)}
              placeholder="Generate a recovery phrase, or paste one from a wallet app"
              ref={secretInput}
              spellCheck={false}
            />
          </div>
          {trimmedSecret.length > 0 && !secretValid && (
            <p className="status error">That is not a valid recovery phrase.</p>
          )}
        </>
      )}
      <div className="actions">
        {actions.map((action, index) => (
          <button
            className={index === 0 ? "btn primary" : "btn"}
            disabled={
              busy !== null ||
              (action === "create" && mode === "vault" && !secretValid)
            }
            key={action}
            onClick={() => void run(action)}
            type="button"
          >
            {actionLabel(action)}
          </button>
        ))}
      </div>
      {error !== null && <p className="status error">{error}</p>}
    </div>
  );
}

export { ConnectPanel };
