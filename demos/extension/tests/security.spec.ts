import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEMO_CHAIN_ID,
  isJsonRpcBody,
  jsonRpcResult,
} from "@category-labs/mera-demo-shared/network";
import {
  assertDemoChainId,
  validateTradeAmount,
} from "@category-labs/mera-demo-shared/validation";
import { expect, test } from "@playwright/test";
import { isCredential, isStoredAccount } from "../src/storage";
import { extensionIdFromKey } from "./extension-id";

const extensionDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the passkey page pins the ID the manifest key produces", async () => {
  const manifest = JSON.parse(
    await readFile(resolve(extensionDir, "public/manifest.json"), "utf8"),
  ) as { key: string };
  const pageSource = await readFile(
    resolve(extensionDir, "../web/src/extensionPasskey.tsx"),
    "utf8",
  );
  expect(pageSource).toContain(
    `"chrome-extension://${extensionIdFromKey(manifest.key)}"`,
  );
});

test("rejects malformed account metadata", () => {
  expect(
    isStoredAccount({
      address: "0x1111111111111111111111111111111111111111",
      credential: {
        credentialId: "valid_base64url-1",
        transports: ["internal"],
      },
    }),
  ).toBe(true);
  expect(
    isStoredAccount({ address: "0x1", credential: { credentialId: "x" } }),
  ).toBe(false);
  expect(isCredential({ credentialId: "has padding=" })).toBe(false);
  expect(isCredential({ credentialId: "valid", transports: ["cable"] })).toBe(
    false,
  );
});

test("rejects invalid trades and RPC bodies", () => {
  expect(() => validateTradeAmount(0n)).toThrow();
  expect(() => validateTradeAmount(-1n)).toThrow();
  expect(() => validateTradeAmount(2n ** 256n)).toThrow();
  expect(() => validateTradeAmount(1n)).not.toThrow();
  expect(() => assertDemoChainId(1, DEMO_CHAIN_ID)).toThrow(
    /Wrong demo chain/u,
  );
  expect(() => assertDemoChainId(DEMO_CHAIN_ID, DEMO_CHAIN_ID)).not.toThrow();
  expect(isJsonRpcBody(null)).toBe(false);
  expect(isJsonRpcBody([])).toBe(false);
  expect(isJsonRpcBody({ jsonrpc: "2.0", id: 1, result: "0x1" })).toBe(true);
  expect(() => jsonRpcResult({}, "eth_chainId")).toThrow(/malformed/u);
  expect(() =>
    jsonRpcResult(
      { jsonrpc: "2.0", id: 1, error: { message: 7 } },
      "eth_chainId",
    ),
  ).toThrow(/refused eth_chainId/u);
  expect(() =>
    jsonRpcResult({ jsonrpc: "2.0", id: 2, result: "0x7a69" }, "eth_chainId"),
  ).toThrow(/malformed/u);
  expect(
    jsonRpcResult({ jsonrpc: "2.0", id: 1, result: "0x7a69" }, "eth_chainId"),
  ).toBe("0x7a69");
});

test("manifest has the exact permission and CSP contract", async () => {
  const manifest = JSON.parse(
    await readFile(resolve(extensionDir, "public/manifest.json"), "utf8"),
  ) as Record<string, unknown>;
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
