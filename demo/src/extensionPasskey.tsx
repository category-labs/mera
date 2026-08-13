import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
} from "@category-labs/mera";
import { type ReactElement, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const RP_ID = "mera.category.xyz";
const CHANNEL = "mera-passkey";
// The "key" in the extension manifest fixes this ID, so the page posts PRF
// output only to the demo extension, never to whichever extension opened it.
const EXTENSION_ORIGIN = "chrome-extension://gdpogffgndjpbaflnmnpijiecdpbaiig";
const labelFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

type Action = "create" | "get" | "recovery";

type PrfMaterial = {
  prfOutput: Uint8Array;
  credential: PasskeyCredentialMetadata;
};

function parseAction(value: string | null): Action | null {
  if (value === "create" || value === "get" || value === "recovery") {
    return value;
  }
  return null;
}

function parseCredential(): PasskeyCredentialMetadata | undefined {
  const params = new URLSearchParams(location.search);
  const credentialId = params.get("credentialId");
  if (credentialId === null) return undefined;
  const transports = params.get("transports");
  return {
    credentialId,
    ...(transports === null || transports === ""
      ? {}
      : {
          transports: transports.split(",") as NonNullable<
            PasskeyCredentialMetadata["transports"]
          >,
        }),
  };
}

function describeError(error: unknown): string {
  if (isMeraError(error)) {
    if (error.code === "PRF_UNAVAILABLE") {
      return "This browser or authenticator doesn't support the WebAuthn PRF extension this demo needs.";
    }
    if (error.code === "PASSKEY_OPERATION_FAILED") {
      return "The passkey request was cancelled or failed.";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function postToExtension(
  message:
    | { channel: typeof CHANNEL; kind: "prf"; material: PrfMaterial }
    | { channel: typeof CHANNEL; kind: "error"; message: string },
): void {
  if (window.opener === null) {
    throw new Error("This tab was not opened from the extension.");
  }
  window.opener.postMessage(message, EXTENSION_ORIGIN);
  if (message.kind === "prf") message.material.prfOutput.fill(0);
}

async function requestPrf(
  action: Action,
  credential?: PasskeyCredentialMetadata,
): Promise<PrfMaterial> {
  if (action === "create") {
    const created = await createPasskeyWithPrfOutput({
      rp: { id: RP_ID, name: "mera demo" },
      user: {
        name: "nad",
        displayName: `Account ${labelFormat.format(new Date())}`,
      },
    });
    return {
      prfOutput: created.prfOutput,
      credential: {
        credentialId: created.credentialId,
        ...(created.transports === undefined
          ? {}
          : { transports: created.transports }),
      },
    };
  }
  const asserted = await getPasskeyPrfOutput({
    rpId: RP_ID,
    ...(credential === undefined ? {} : { credential }),
  });
  return {
    prfOutput: asserted.prfOutput,
    credential: {
      credentialId: asserted.credentialId,
      ...(credential?.transports === undefined
        ? {}
        : { transports: credential.transports }),
    },
  };
}

function ExtensionPasskeyPage(): ReactElement {
  const params = new URLSearchParams(location.search);
  const action = parseAction(params.get("action"));
  const opened = window.opener !== null;
  const credential = parseCredential();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    if (action === null) return;
    setPending(true);
    setError(null);
    try {
      postToExtension({
        channel: CHANNEL,
        kind: "prf",
        material: await requestPrf(action, credential),
      });
    } catch (caught) {
      const message = describeError(caught);
      try {
        postToExtension({ channel: CHANNEL, kind: "error", message });
      } catch {
        setError(message);
      }
    } finally {
      setPending(false);
    }
  }

  const label =
    action === "create"
      ? "Create account"
      : action === "recovery"
        ? "Reveal phrase"
        : "Continue";

  return (
    <main className="app">
      <header className="app-head">
        <h1>mera demo</h1>
      </header>
      <section className="card">
        <p>
          {action === "recovery"
            ? "The next passkey check reveals the recovery phrase."
            : "Use a passkey to continue."}
        </p>
        {action === null || !opened ? (
          <p className="status error">
            This passkey tab is missing its opener.
          </p>
        ) : (
          <button
            className="btn primary"
            type="button"
            disabled={pending}
            onClick={() => void run()}
          >
            {pending ? "Waiting for passkey…" : label}
          </button>
        )}
        {error && <p className="status error">{error}</p>}
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element.");
createRoot(root).render(
  <StrictMode>
    <ExtensionPasskeyPage />
  </StrictMode>,
);
