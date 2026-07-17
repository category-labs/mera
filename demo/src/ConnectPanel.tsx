import { isMeraError } from "@category-labs/mera";
import { type ReactElement, useState } from "react";
import {
  type AccountMode,
  type ConnectedWallet,
  connect,
  describeError,
} from "./connect";
import { createMnemonic, isValidMnemonic } from "./hd";

type ConnectPanelProps = {
  mode: AccountMode;
  onConnected: (wallet: ConnectedWallet) => void;
};

/**
 * The connect area under the market data. Passkey mode is a single button:
 * it tries a discoverable sign-in and flips to offering a fresh account when
 * that fails, because WebAuthn reports "no passkey" and "cancelled" as the
 * same error. Vault mode imports or creates a phrase-backed account. Mount
 * with `key={mode}` so switching modes resets the local state.
 */
function ConnectPanel({ mode, onConnected }: ConnectPanelProps): ReactElement {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerCreate, setOfferCreate] = useState(false);

  const trimmedSecret = secret.trim();
  const secretValid = isValidMnemonic(trimmedSecret);

  function generate() {
    setSecret(createMnemonic());
    setError(null);
  }

  async function run(action: "create" | "signin") {
    setBusy(true);
    setError(null);
    try {
      onConnected(await connect(mode, action, secret));
    } catch (caught) {
      if (
        mode === "passkey" &&
        action === "signin" &&
        isMeraError(caught) &&
        caught.code === "PASSKEY_OPERATION_FAILED"
      ) {
        setOfferCreate(true);
      } else {
        setError(describeError(caught));
      }
    } finally {
      setBusy(false);
    }
  }

  if (mode === "vault") {
    return (
      <div className="connect-cta">
        <p className="hint">
          The demo encrypts a generated or imported recovery phrase in a vault
          that opens with the passkey.
        </p>
        <label className="field">
          <span className="field-head">
            Recovery phrase
            <button
              type="button"
              className="link small"
              onClick={generate}
              disabled={busy}
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
            disabled={busy}
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
            disabled={busy || !secretValid}
          >
            {busy ? "Waiting for passkey…" : "Open account"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void run("signin")}
            disabled={busy}
          >
            Sign in
          </button>
        </div>
        {error && <p className="status error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="connect-cta">
      {offerCreate && (
        <p className="hint">
          No passkey for this demo on the device. Create a new one to start.
        </p>
      )}
      <button
        type="button"
        className="btn primary"
        onClick={() => void run(offerCreate ? "create" : "signin")}
        disabled={busy}
      >
        {busy
          ? "Waiting for passkey…"
          : offerCreate
            ? "Create account"
            : "Sign in with a passkey"}
      </button>
      {offerCreate && (
        <button
          type="button"
          className="link"
          onClick={() => {
            setOfferCreate(false);
            setError(null);
          }}
          disabled={busy}
        >
          Try sign-in again
        </button>
      )}
      {error && <p className="status error">{error}</p>}
    </div>
  );
}

export { ConnectPanel };
