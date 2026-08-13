import type { PasskeyCredentialMetadata } from "@category-labs/mera";
import { PASSKEY_CHANNEL, PASSKEY_PAGE_URL, RP_ORIGIN } from "./config";
import type { PrfMaterial } from "./wallet";

type PasskeyAction = "create" | "get" | "recovery";

type PasskeyTabMessage =
  | { channel: typeof PASSKEY_CHANNEL; kind: "prf"; material: PrfMaterial }
  | { channel: typeof PASSKEY_CHANNEL; kind: "error"; message: string };

function isSidePanel(): boolean {
  return new URLSearchParams(location.search).get("panel") === "1";
}

function isPasskeyTabMessage(value: unknown): value is PasskeyTabMessage {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.channel !== PASSKEY_CHANNEL) return false;
  return record.kind === "prf" || record.kind === "error";
}

function openPasskeyTab(
  action: PasskeyAction,
  credential?: PasskeyCredentialMetadata,
): Window {
  const url = new URL(PASSKEY_PAGE_URL);
  url.searchParams.set("action", action);
  if (credential !== undefined) {
    url.searchParams.set("credentialId", credential.credentialId);
    if (credential.transports !== undefined) {
      url.searchParams.set("transports", credential.transports.join(","));
    }
  }
  const tab = window.open(url.href);
  if (tab === null) {
    throw new Error("Chrome blocked the passkey tab.");
  }
  tab.focus();
  return tab;
}

function waitForPasskeyTab(tab: Window): Promise<PasskeyTabMessage> {
  return new Promise((resolve, reject) => {
    function stop(): void {
      window.clearInterval(timer);
      window.removeEventListener("message", onMessage);
      if (!tab.closed) tab.close();
    }

    const timer = window.setInterval(() => {
      if (!tab.closed) return;
      window.clearInterval(timer);
      window.removeEventListener("message", onMessage);
      reject(new Error("The passkey tab was closed."));
    }, 300);

    function onMessage(event: MessageEvent): void {
      if (event.origin !== RP_ORIGIN || event.source !== tab) return;
      if (!isPasskeyTabMessage(event.data)) return;
      stop();
      if (event.data.kind === "error") {
        reject(new Error(event.data.message));
        return;
      }
      resolve(event.data);
    }

    window.addEventListener("message", onMessage);
  });
}

export type { PasskeyAction };
export { isSidePanel, openPasskeyTab, waitForPasskeyTab };
