import type { PasskeyCredentialMetadata } from "@category-labs/mera";
import {
  createPasskeyPrf,
  getPasskeyPrf,
  PASSKEY_TAB_CHANNEL,
  type PasskeyPrf,
  type PasskeyTabMessage,
} from "@category-labs/mera-demo-shared/passkey";

const RP_ID = "mera.category.xyz";
const RP_ORIGIN = `https://${RP_ID}`;

type PasskeyAction = "create" | "get" | "recovery";

// The manifest opens the side panel with ?panel=1.
const inSidePanel = new URLSearchParams(location.search).get("panel") === "1";

let passkeyTab: Window | null = null;

/** Whether a tab that `requestPrf` opened is still running its ceremony. */
function passkeyTabOpen(): boolean {
  return passkeyTab !== null;
}

/**
 * Runs a passkey ceremony. In the side panel, where Chrome often shows no
 * prompt at all, it opens a tab on the relying party's site to run it; there,
 * password managers that intercept WebAuthn on websites can answer too.
 * Elsewhere the ceremony runs in this page.
 */
async function requestPrf(
  action: PasskeyAction,
  credential?: PasskeyCredentialMetadata,
): Promise<PasskeyPrf> {
  if (!inSidePanel) {
    return action === "create"
      ? createPasskeyPrf(RP_ID)
      : getPasskeyPrf(RP_ID, credential);
  }
  const url = new URL(`${RP_ORIGIN}/demo/passkey.html`);
  url.searchParams.set("action", action);
  if (credential !== undefined) {
    url.searchParams.set("credentialId", credential.credentialId);
    if (credential.transports !== undefined) {
      url.searchParams.set("transports", credential.transports.join(","));
    }
  }
  const tab = window.open(url.href);
  if (tab === null) throw new Error("Chrome blocked the passkey tab.");
  tab.focus();
  passkeyTab = tab;
  try {
    return await prfFromTab(tab);
  } finally {
    passkeyTab = null;
    if (!tab.closed) tab.close();
  }
}

/**
 * The PRF result `tab` posts back. Only messages from that tab on the
 * relying party's origin count, so no other page can hand over key material.
 */
function prfFromTab(tab: Window): Promise<PasskeyPrf> {
  return new Promise((resolve, reject) => {
    const closedCheck = setInterval(() => {
      if (!tab.closed) return;
      stop();
      reject(new Error("The passkey tab was closed."));
    }, 300);

    function onMessage({ origin, source, data }: MessageEvent): void {
      if (origin !== RP_ORIGIN || source !== tab) return;
      const message = data as PasskeyTabMessage | null;
      if (message?.channel !== PASSKEY_TAB_CHANNEL) return;
      stop();
      if (message.kind === "prf") resolve(message.material);
      else reject(new Error(message.message));
    }

    function stop(): void {
      clearInterval(closedCheck);
      window.removeEventListener("message", onMessage);
    }

    window.addEventListener("message", onMessage);
  });
}

export { passkeyTabOpen, requestPrf };
