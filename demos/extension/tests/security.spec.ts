import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import manifest from "../public/manifest.json" with { type: "json" };
import { extensionIdFromKey } from "./extension-id";

const extensionDir = resolve(import.meta.dirname, "..");

test("the passkey page pins the ID the manifest key produces", async () => {
  const pageSource = await readFile(
    resolve(extensionDir, "../web/src/extensionPasskey.tsx"),
    "utf8",
  );
  expect(pageSource).toContain(
    `"chrome-extension://${extensionIdFromKey(manifest.key)}"`,
  );
});

test("manifest has the exact permission and CSP contract", async () => {
  expect(manifest.permissions).toEqual(["sidePanel"]);
  expect(manifest.host_permissions).toEqual(["https://mera.category.xyz/*"]);
  expect(manifest.side_panel).toEqual({
    default_path: "sidepanel.html?panel=1",
  });
  expect(manifest).not.toHaveProperty("content_scripts");
  expect(manifest).not.toHaveProperty("externally_connectable");
  expect(manifest).not.toHaveProperty("web_accessible_resources");
  expect(manifest.action).not.toHaveProperty("default_popup");
  const csp = manifest.content_security_policy.extension_pages;
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-src 'none'");
  expect(csp).toContain(
    "connect-src https://evm-network-production.up.railway.app",
  );
  const builtHtml = await readFile(
    resolve(extensionDir, "dist/sidepanel.html"),
    "utf8",
  );
  expect(builtHtml).not.toMatch(/(?:src|href)=["']https?:/u);
});
