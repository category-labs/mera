import {
  createMnemonic,
  isValidMnemonic,
} from "@category-labs/mera-demo-shared/hd";
import { type ReactElement, useState } from "react";
import {
  type AccountMode,
  type ConnectedWallet,
  connect,
  describeError,
} from "./connect";

type ConnectPanelProps = {
  mode: AccountMode;
  onConnected: (wallet: ConnectedWallet) => Promise<void>;
};

// The action a click started, and how far it has come: the passkey ceremony,
// then the awaited `onConnected`.
type ConnectBusy = {
  action: "create" | "signin";
  phase: "passkey" | "opening";
};

/**
 * The connect area under the market data. Passkey mode offers explicit
 * create and sign-in actions; new passkeys are created under a fixed default
 * name. Vault mode imports or creates a phrase-backed account. The panel
 * stays busy until `onConnected` settles, so the parent can load the account
 * before this panel gives way to it. Mount with `key={mode}` so switching
 * modes resets the local state.
 */
function ConnectPanel({ mode, onConnected }: ConnectPanelProps): ReactElement {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<ConnectBusy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedSecret = secret.trim();
  const secretValid = isValidMnemonic(trimmedSecret);

  function generate() {
    setSecret(createMnemonic());
    setError(null);
  }

  async function run(action: "create" | "signin") {
    setBusy({ action, phase: "passkey" });
    setError(null);
    try {
      const wallet = await connect(mode, action, secret);
      setBusy({ action, phase: "opening" });
      await onConnected(wallet);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  function actionLabel(action: "create" | "signin", idle: string): string {
    if (busy === null || busy.action !== action) return idle;
    return busy.phase === "passkey"
      ? "Waiting for passkey…"
      : "Opening account…";
  }

  if (mode === "vault") {
    return (
      <div className="connect-cta">
        <p className="hint">
          The demo encrypts a recovery phrase in a vault that opens with the
          passkey. Generate a fresh one rather than importing a phrase that
          holds funds.
        </p>
        <label className="field">
          <span className="field-head">
            Recovery phrase
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
            value={secret}
            placeholder="Generate a recovery phrase, or paste one from a wallet app"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(event) => setSecret(event.target.value)}
            disabled={busy !== null}
          />
        </label>
        {trimmedSecret.length > 0 && !secretValid && (
          <p className="status error">That is not a valid recovery phrase.</p>
        )}
        <div className="actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => void run("create")}
            disabled={busy !== null || !secretValid}
          >
            {actionLabel("create", "Open account")}
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

  return (
    <div className="connect-cta">
      <div className="actions">
        <button
          type="button"
          className="btn primary"
          onClick={() => void run("create")}
          disabled={busy !== null}
        >
          {actionLabel("create", "Create account")}
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
