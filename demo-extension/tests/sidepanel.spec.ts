import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, type Page, test } from "@playwright/test";
import { extensionIdFromKey } from "./extension-id";

const extensionDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
const rpcUrl = "https://evm-network-production.up.railway.app/";
const marketAddress = "0x1111111111111111111111111111111111111111";
const transactionHash = `0x${"12".repeat(32)}`;
const blockHash = `0x${"34".repeat(32)}`;
const zeroHash = `0x${"00".repeat(32)}`;
const logsBloom = `0x${"00".repeat(256)}`;
const transferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function expectedExtensionId(): Promise<string> {
  const manifest = JSON.parse(
    await readFile(resolve(extensionDir, "manifest.json"), "utf8"),
  ) as { key: string };
  return extensionIdFromKey(manifest.key);
}

function rpcResult(method: string): unknown {
  switch (method) {
    case "eth_chainId":
      return "0x7a69";
    case "demo_market":
      return { address: marketAddress };
    case "demo_fundAccount":
    case "eth_getBalance":
      return "0x21e19e0c9bab2400000";
    case "eth_call":
      return `0x${"0".repeat(64)}`;
    case "eth_getTransactionCount":
      return "0x0";
    case "eth_estimateGas":
      return "0x186a0";
    case "eth_maxPriorityFeePerGas":
    case "eth_gasPrice":
      return "0x3b9aca00";
    case "eth_getBlockByNumber":
      return {
        baseFeePerGas: "0x3b9aca00",
        difficulty: "0x0",
        extraData: "0x",
        gasLimit: "0x1c9c380",
        gasUsed: "0x0",
        hash: blockHash,
        logsBloom,
        miner: "0x0000000000000000000000000000000000000000",
        mixHash: zeroHash,
        nonce: "0x0000000000000000",
        number: "0x1",
        parentHash: zeroHash,
        receiptsRoot: zeroHash,
        sha3Uncles: zeroHash,
        size: "0x0",
        stateRoot: zeroHash,
        timestamp: "0x1",
        totalDifficulty: "0x0",
        transactions: [],
        transactionsRoot: zeroHash,
        uncles: [],
      };
    case "eth_sendRawTransaction":
      return transactionHash;
    case "eth_getTransactionReceipt":
      return {
        blockHash,
        blockNumber: "0x1",
        contractAddress: null,
        cumulativeGasUsed: "0x186a0",
        effectiveGasPrice: "0x3b9aca00",
        from: "0x2222222222222222222222222222222222222222",
        gasUsed: "0x186a0",
        logs: [
          {
            address: marketAddress,
            blockHash,
            blockNumber: "0x1",
            data: `0x${(10n ** 18n).toString(16).padStart(64, "0")}`,
            logIndex: "0x0",
            removed: false,
            topics: [transferTopic, zeroHash, zeroHash],
            transactionHash,
            transactionIndex: "0x0",
          },
        ],
        logsBloom,
        status: "0x1",
        to: marketAddress,
        transactionHash,
        transactionIndex: "0x0",
        type: "0x2",
      };
    default:
      return null;
  }
}

async function setVisibility(
  page: Page,
  state: "hidden" | "visible",
): Promise<void> {
  await page.evaluate((visibilityState) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: visibilityState,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

async function delayNextCredentialResult(
  page: Page,
  method: "create" | "get",
): Promise<void> {
  await page.evaluate((credentialMethod) => {
    type DelayedCredentialResult = typeof globalThis & {
      releaseCredentialResult?: () => void;
    };
    const delay = async <T>(result: T): Promise<T> => {
      await new Promise<void>((resolveDelay) => {
        (globalThis as DelayedCredentialResult).releaseCredentialResult =
          resolveDelay;
      });
      return result;
    };
    if (credentialMethod === "create") {
      const create = navigator.credentials.create.bind(navigator.credentials);
      Object.defineProperty(navigator.credentials, "create", {
        configurable: true,
        value: async (options?: CredentialCreationOptions) => {
          Object.defineProperty(navigator.credentials, "create", {
            configurable: true,
            value: create,
          });
          return delay(await create(options));
        },
      });
    } else {
      const get = navigator.credentials.get.bind(navigator.credentials);
      Object.defineProperty(navigator.credentials, "get", {
        configurable: true,
        value: async (options?: CredentialRequestOptions) => {
          Object.defineProperty(navigator.credentials, "get", {
            configurable: true,
            value: get,
          });
          return delay(await get(options));
        },
      });
    }
  }, method);
}

async function waitForCredentialResult(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (
            globalThis as typeof globalThis & {
              releaseCredentialResult?: () => void;
            }
          ).releaseCredentialResult,
      ),
    )
    .toBe("function");
}

async function releaseCredentialResult(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = globalThis as typeof globalThis & {
      releaseCredentialResult?: () => void;
    };
    target.releaseCredentialResult?.();
    delete target.releaseCredentialResult;
  });
}

test("runs the side-panel account lifecycle", async () => {
  const profile = await mkdtemp(resolve(tmpdir(), "mera-extension-test-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  });
  try {
    await context.route(rpcUrl, async (route) => {
      const body = route.request().postDataJSON() as {
        id: unknown;
        method: string;
      };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: rpcResult(body.method),
        }),
      });
    });
    let worker = context.serviceWorkers()[0];
    worker ??= await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    expect(extensionId).toBe(await expectedExtensionId());
    const page = await context.newPage();
    await page.clock.install();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(
      page.getByRole("heading", { name: "mera demo" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create account" }),
    ).toBeEnabled();
    await expect(
      page.getByText("Runs on a demo network. Everything traded is fictional."),
    ).toBeVisible();

    const client = await context.newCDPSession(page);
    await client.send("WebAuthn.enable");
    const { authenticatorId } = await client.send(
      "WebAuthn.addVirtualAuthenticator",
      {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
          hasPrf: true,
        },
      },
    );
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("button", { name: /^0x/u })).toBeVisible();
    await expect(page.getByRole("button", { name: "Lock" })).toBeEnabled();
    const storedAccount = await page.evaluate(() =>
      localStorage.getItem("mera.extension.account.v1"),
    );
    expect(storedAccount).not.toBeNull();

    await page.reload();
    await expect(page.getByRole("button", { name: "Lock" })).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Export account" }),
    ).toBeVisible();

    const credentialSignCount = async (): Promise<number> => {
      const result = await client.send("WebAuthn.getCredentials", {
        authenticatorId,
      });
      return result.credentials.reduce(
        (total, credential) => total + credential.signCount,
        0,
      );
    };
    const signCount = await credentialSignCount();
    await page.getByPlaceholder("100.00").fill("1.00");
    await expect(page.getByRole("button", { name: "Buy" })).toBeEnabled();
    await page.getByRole("button", { name: "Buy" }).click();
    await expect(
      page.getByText("Bought 1 NAD for 1.00 DEMOCASH"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Lock" })).toBeEnabled();
    await expect.poll(credentialSignCount).toBeGreaterThan(signCount);

    const unlockedSignCount = await credentialSignCount();
    await page.getByPlaceholder("100.00").fill("2.00");
    await page.getByRole("button", { name: "Buy" }).click();
    await expect(
      page.getByText("Bought 1 NAD for 2.00 DEMOCASH"),
    ).toBeVisible();
    expect(await credentialSignCount()).toBe(unlockedSignCount);

    await setVisibility(page, "hidden");
    await expect(page.getByRole("button", { name: "Lock" })).toBeDisabled();
    await setVisibility(page, "visible");

    await page.evaluate(() => {
      const raw = localStorage.getItem("mera.extension.account.v1");
      if (raw === null) throw new Error("Missing stored account.");
      const value = JSON.parse(raw) as Record<string, unknown>;
      value.address = "0x2222222222222222222222222222222222222222";
      localStorage.setItem("mera.extension.account.v1", JSON.stringify(value));
    });
    await page.reload();
    await page.getByPlaceholder("100.00").fill("1.00");
    await page.getByRole("button", { name: "Buy" }).click();
    await expect(
      page.getByText("does not match the cached account"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Lock" })).toBeDisabled();
    await page.evaluate((raw) => {
      if (raw !== null) localStorage.setItem("mera.extension.account.v1", raw);
    }, storedAccount);
    await page.reload();

    await page.getByRole("button", { name: "Export account" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "reveals the recovery phrase",
    );
    await page.getByRole("button", { name: "Reveal phrase" }).click();
    await expect(page.getByText("Recovery phrase")).toBeVisible();
    await page.clock.runFor(1);
    await page.clock.runFor(60_001);
    await expect(page.getByText("Recovery phrase")).not.toBeVisible();

    await page.getByRole("button", { name: "Export account" }).click();
    await delayNextCredentialResult(page, "get");
    await page.getByRole("button", { name: "Reveal phrase" }).click();
    await expect(
      page.getByRole("button", { name: "Waiting for passkey…" }),
    ).toBeVisible();
    await waitForCredentialResult(page);
    await setVisibility(page, "hidden");
    await releaseCredentialResult(page);
    await expect(page.getByText("Recovery phrase")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Export account" }),
    ).toBeEnabled();
    await page.reload();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(
      page.getByRole("button", { name: "Create account" }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Lock" })).toHaveCount(0);

    await delayNextCredentialResult(page, "create");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(
      page.getByRole("button", { name: "Waiting for passkey…" }),
    ).toBeVisible();
    await waitForCredentialResult(page);
    await setVisibility(page, "hidden");
    await releaseCredentialResult(page);
    await expect(
      page.getByRole("button", { name: "Create account" }),
    ).toBeEnabled();
    await expect(page.getByRole("button", { name: /^0x/u })).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("mera.extension.account.v1"),
      ),
    ).toBeNull();
    await setVisibility(page, "visible");

    await client.send("WebAuthn.removeVirtualAuthenticator", {
      authenticatorId,
    });
    await client.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
        hasPrf: false,
      },
    });
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(
      page.getByText("doesn't support the WebAuthn PRF extension"),
    ).toBeVisible();
  } finally {
    await context.close();
    await rm(profile, { force: true, recursive: true });
  }
});

test("opens a passkey tab from the side panel", async () => {
  const profile = await mkdtemp(resolve(tmpdir(), "mera-extension-tab-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  });
  try {
    await context.route(rpcUrl, async (route) => {
      const body = route.request().postDataJSON() as {
        id: unknown;
        method: string;
      };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: rpcResult(body.method),
        }),
      });
    });
    let worker = context.serviceWorkers()[0];
    worker ??= await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await context.route(
      (url) =>
        url.origin === "https://mera.category.xyz" &&
        url.pathname === "/demo/passkey.html",
      async (route) => {
        await route.fulfill({
          contentType: "text/html",
          body: `<!doctype html>
<html>
  <body>
    <button>Create account</button>
    <script>
      document.querySelector("button").addEventListener("click", async () => {
        const cred = await navigator.credentials.create({
          publicKey: {
            rp: { id: "mera.category.xyz", name: "mera demo" },
            user: {
              id: crypto.getRandomValues(new Uint8Array(32)),
              name: "nad",
              displayName: "Account",
            },
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            pubKeyCredParams: [{ type: "public-key", alg: -7 }],
            authenticatorSelection: {
              residentKey: "required",
              requireResidentKey: true,
              userVerification: "required",
            },
            extensions: {
              prf: { eval: { first: crypto.getRandomValues(new Uint8Array(32)) } },
            },
          },
        });
        const first = cred.getClientExtensionResults().prf.results.first;
        const prfOutput = new Uint8Array(first);
        const raw = new Uint8Array(cred.rawId);
        let binary = "";
        for (const byte of raw) binary += String.fromCharCode(byte);
        const credentialId = btoa(binary)
          .replaceAll("+", "-")
          .replaceAll("/", "_")
          .replace(/=+$/u, "");
        window.opener.postMessage(
          {
            channel: "mera-passkey",
            kind: "prf",
            material: { prfOutput, credential: { credentialId } },
          },
          "chrome-extension://${extensionId}",
        );
      });
    </script>
  </body>
</html>`,
        });
      },
    );
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html?panel=1`);
    await expect(
      page.getByRole("button", { name: "Create account" }),
    ).toBeEnabled();

    const popupPromise = context.waitForEvent("page");
    await page.getByRole("button", { name: "Create account" }).click();
    const popup = await popupPromise;
    const client = await context.newCDPSession(popup);
    await client.send("WebAuthn.enable");
    await client.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
        hasPrf: true,
      },
    });
    await popup.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("button", { name: /^0x/u })).toBeVisible();
  } finally {
    await context.close();
    await rm(profile, { force: true, recursive: true });
  }
});
