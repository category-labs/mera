import type { PasskeyCredentialMetadata } from "@category-labs/mera";
import { describeError } from "@category-labs/mera-demo-shared/errors";
import {
  createPasskeyPrf,
  getPasskeyPrf,
  PASSKEY_TAB_CHANNEL,
  type PasskeyTabMessage,
} from "@category-labs/mera-demo-shared/passkey";
import { type ReactElement, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import favicon from "../../../docs/public/favicon.svg";
import "./styles.css";

const RP_ID = "mera.category.xyz";
// The "key" in the extension manifest fixes this ID, so the page posts PRF
// output only to the demo extension, never to whichever extension opened it.
const EXTENSION_ORIGIN = "chrome-extension://gdpogffgndjpbaflnmnpijiecdpbaiig";

const ACTIONS = {
  create: {
    title: "Create an account",
    destination: "for the mera demo extension",
    button: "Create account",
  },
  get: { title: "Sign in", destination: "to the extension", button: "Sign in" },
  recovery: {
    title: "Reveal the recovery phrase",
    destination: "for the mera demo extension",
    button: "Reveal phrase",
  },
};

type Action = keyof typeof ACTIONS;

const params = new URLSearchParams(location.search);
const action = params.get("action");
const credentialId = params.get("credentialId");
const transports = params.get("transports");
const credential: PasskeyCredentialMetadata | undefined =
  credentialId === null
    ? undefined
    : {
        credentialId,
        transports: transports
          ? (transports.split(",") as PasskeyCredentialMetadata["transports"])
          : undefined,
      };

function isAction(value: string | null): value is Action {
  return value === "create" || value === "get" || value === "recovery";
}

function postToExtension(message: PasskeyTabMessage): void {
  if (window.opener === null) {
    throw new Error("This tab was not opened from the extension.");
  }
  window.opener.postMessage(message, EXTENSION_ORIGIN);
}

function PasskeyPage({ action }: { action: Action }): ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const material =
        action === "create"
          ? await createPasskeyPrf(RP_ID)
          : await getPasskeyPrf(RP_ID, credential);
      postToExtension({ channel: PASSKEY_TAB_CHANNEL, kind: "prf", material });
      // postMessage sent a copy.
      material.prfOutput.fill(0);
    } catch (caught) {
      const message = describeError(caught);
      try {
        postToExtension({
          channel: PASSKEY_TAB_CHANNEL,
          kind: "error",
          message,
        });
      } catch {
        setError(message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card">
      <button
        className="btn primary"
        type="button"
        disabled={pending}
        onClick={() => void run()}
      >
        {pending ? "Waiting for passkey…" : ACTIONS[action].button}
      </button>
      {error && <p className="status error">{error}</p>}
    </section>
  );
}

const copy = isAction(action)
  ? ACTIONS[action]
  : { title: "mera demo extension", destination: "" };
document.title = `${copy.title} ${copy.destination}`.trim();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element.");
createRoot(root).render(
  <StrictMode>
    <main className="app signin">
      <header className="signin-brand">
        <img className="signin-mark" src={favicon} alt="" />
        <h1 className="signin-title">
          {copy.title}
          {copy.destination && (
            <span className="signin-to">{copy.destination}</span>
          )}
        </h1>
      </header>
      {isAction(action) && window.opener !== null ? (
        <PasskeyPage action={action} />
      ) : (
        <section className="card">
          <p className="status error">
            This passkey tab is missing its opener.
          </p>
        </section>
      )}
    </main>
  </StrictMode>,
);
