import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
} from "@category-labs/mera";
import { type ReactElement, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import favicon from "../../../docs/public/favicon.svg";
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

type SignInCopy = {
  title: string;
  destination: string;
  button: string;
  documentTitle: string;
};

function copyFor(action: Action | null): SignInCopy {
  switch (action) {
    case "create":
      return {
        title: "Create an account",
        destination: "for the mera demo extension",
        button: "Create account",
        documentTitle: "Create an account for the mera demo extension",
      };
    case "recovery":
      return {
        title: "Reveal the recovery phrase",
        destination: "for the mera demo extension",
        button: "Reveal phrase",
        documentTitle: "Reveal the recovery phrase",
      };
    case "get":
      return {
        title: "Sign in",
        destination: "to the extension",
        button: "Sign in",
        documentTitle: "Sign in to the extension",
      };
    case null:
      return {
        title: "mera demo extension",
        destination: "",
        button: "",
        documentTitle: "mera demo extension",
      };
  }
}

function ExtensionPasskeyPage(): ReactElement {
  const params = new URLSearchParams(location.search);
  const action = parseAction(params.get("action"));
  const opened = window.opener !== null;
  const credential = parseCredential();
  const copy = copyFor(action);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = action !== null && opened;

  useEffect(() => {
    document.title = copy.documentTitle;
  }, [copy.documentTitle]);

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

  return (
    <main className="app signin">
      <header className="signin-brand">
        <img className="signin-mark" src={favicon} alt="" />
        <h1 className="signin-title">
          {copy.title}
          {copy.destination !== "" && (
            <span className="signin-to">{copy.destination}</span>
          )}
        </h1>
      </header>
      <section className="card">
        {ready ? (
          <button
            className="btn primary"
            type="button"
            disabled={pending}
            onClick={() => void run()}
          >
            {pending ? "Waiting for passkey…" : copy.button}
          </button>
        ) : (
          <p className="status error">
            This passkey tab is missing its opener.
          </p>
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
