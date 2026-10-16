import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { extensionIdFromKey } from "./extension-id";

const extensionDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readManifest(): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(resolve(extensionDir, "public/manifest.json"), "utf8"),
  ) as Record<string, unknown>;
}

test("the passkey page pins the ID the manifest key produces", async () => {
  const { key } = (await readManifest()) as { key: string };
  const pageSource = await readFile(
    resolve(extensionDir, "../web/src/extensionPasskey.tsx"),
    "utf8",
  );
  expect(pageSource).toContain(
    `"chrome-extension://${extensionIdFromKey(key)}"`,
  );
});

test("manifest has the exact permission and CSP contract", async () => {
  const manifest = await readManifest();
  expect(manifest.permissions).toEqual(["sidePanel"]);
  expect(manifest.host_permissions).toEqual(["https://mera.category.xyz/*"]);
  expect(manifest.side_panel).toEqual({
    default_path: "sidepanel.html?panel=1",
  });
  expect(manifest).not.toHaveProperty("content_scripts");
  expect(manifest).not.toHaveProperty("externally_connectable");
  expect(manifest).not.toHaveProperty("web_accessible_resources");
  expect(manifest.action).not.toHaveProperty("default_popup");
  const csp = (manifest.content_security_policy as Record<string, string>)
    .extension_pages;
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
