import { type ReactElement, useState } from "react";
import {
  type AccountMode,
  type ConnectResult,
  connect,
  DEFAULT_USER,
  describeError,
} from "./connect";
import { createMnemonic, isValidMnemonic } from "./hd";

const MODE_HINTS: Record<AccountMode, string> = {
  derived:
    "Accounts are derived from the passkey. A synced passkey can reproduce the same addresses on another device.",
  vault:
    "The demo encrypts a generated or imported recovery phrase in a vault that opens with the passkey.",
};

type Busy = "create" | "signin" | null;

type ConnectCardProps = {
  onConnected: (result: ConnectResult) => void;
};

/**
 * Connect view: create or sign in with a single passkey ceremony. Derived mode
 * is the default; a footer link below the card switches to vault mode for
 * importing an existing recovery phrase.
 */
function ConnectCard({ onConnected }: ConnectCardProps): ReactElement {
  const [mode, setMode] = useState<AccountMode>("derived");
  const [username, setUsername] = useState(DEFAULT_USER);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedSecret = secret.trim();
  const secretValid = isValidMnemonic(trimmedSecret);

  function generate() {
    setSecret(createMnemonic());
    setError(null);
  }

  function switchMode(next: AccountMode) {
    setMode(next);
    setError(null);
  }

  async function run(action: "create" | "signin") {
    setBusy(action);
    setError(null);
    try {
      onConnected(await connect(mode, action, username, secret));
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <section className="card">
        <p className="hint">{MODE_HINTS[mode]}</p>

        {mode === "vault" && (
          <div className="secret">
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
              <p className="status error">
                That is not a valid recovery phrase.
              </p>
            )}

            <p className="hint">
              The phrase is generated on the device or imported. Anyone with it
              controls the account.
            </p>
          </div>
        )}

        <label className="field">
          <span>Passkey name</span>
          <input
            value={username}
            autoComplete="username"
            spellCheck={false}
            onChange={(event) => setUsername(event.target.value)}
            disabled={busy !== null}
          />
        </label>
        <p className="hint">This name is used only when creating a passkey.</p>

        <div className="actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => run("create")}
            disabled={busy !== null || (mode === "vault" && !secretValid)}
          >
            {busy === "create" ? "Waiting for passkey…" : "Create account"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => run("signin")}
            disabled={busy !== null}
          >
            {busy === "signin" ? "Waiting for passkey…" : "Sign in"}
          </button>
        </div>

        {error && <p className="status error">{error}</p>}
      </section>

      {mode === "derived" ? (
        <button
          type="button"
          className="mode-switch"
          onClick={() => switchMode("vault")}
          disabled={busy !== null}
        >
          Import existing secret →
        </button>
      ) : (
        <button
          type="button"
          className="mode-switch"
          onClick={() => switchMode("derived")}
          disabled={busy !== null}
        >
          ← Back to passkey accounts
        </button>
      )}
    </>
  );
}

export { ConnectCard };
