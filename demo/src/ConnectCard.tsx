import { type ReactElement, useState } from "react";
import {
  type AccountMode,
  type ConnectResult,
  connect,
  DEFAULT_USER,
  describeError,
} from "./connect";
import { createMnemonic, isValidMnemonic } from "./hd";

const MODES: { id: AccountMode; label: string; hint: string }[] = [
  {
    id: "derived",
    label: "Derived",
    hint: "Accounts derived from your passkey — nothing is stored, and a synced passkey can restore them on another device.",
  },
  {
    id: "wrapped",
    label: "Wrapped",
    hint: "A seed phrase you generate or import, encrypted into a vault only the passkey can open.",
  },
];

type Busy = "create" | "signin" | null;

type ConnectCardProps = {
  mode: AccountMode;
  onModeChange: (mode: AccountMode) => void;
  onConnected: (result: ConnectResult) => void;
};

/** Connect view: pick a mode, then create or sign in with a single passkey ceremony. */
function ConnectCard({
  mode,
  onModeChange,
  onConnected,
}: ConnectCardProps): ReactElement {
  const [username, setUsername] = useState(DEFAULT_USER);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const activeMode = MODES.find((entry) => entry.id === mode) ?? MODES[0];

  const trimmedSecret = secret.trim();
  const secretValid = isValidMnemonic(trimmedSecret);

  function generate() {
    setSecret(createMnemonic());
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
    <section className="card">
      <div className="segmented" role="tablist" aria-label="Account mode">
        {MODES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === mode}
            className={entry.id === mode ? "segment active" : "segment"}
            onClick={() => onModeChange(entry.id)}
            disabled={busy !== null}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <p className="hint">{activeMode.hint}</p>

      {mode === "wrapped" && (
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
              placeholder="Generate one, or paste an existing wallet's phrase"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(event) => setSecret(event.target.value)}
              disabled={busy !== null}
            />
          </label>

          {trimmedSecret.length > 0 && !secretValid && (
            <p className="status error">That's not a valid recovery phrase.</p>
          )}

          <p className="hint">
            Generated on your device, or imported — whoever holds the phrase
            controls the account.
          </p>
        </div>
      )}

      <label className="field">
        <span>Account name</span>
        <input
          value={username}
          autoComplete="username"
          spellCheck={false}
          onChange={(event) => setUsername(event.target.value)}
          disabled={busy !== null}
        />
      </label>

      <div className="actions">
        <button
          type="button"
          className="btn primary"
          onClick={() => run("create")}
          disabled={busy !== null || (mode === "wrapped" && !secretValid)}
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
  );
}

export { ConnectCard };
