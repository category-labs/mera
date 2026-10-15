import { expect, test } from "@playwright/test";
import { coversTrade, maxTradeInput, priceAt, UNIT } from "../src/market";
import { DEMO_RPC_URL } from "../src/network";

const address = "0x2222222222222222222222222222222222222222";
const marketAddress = "0x1111111111111111111111111111111111111111";
const transactionHash = `0x${"12".repeat(32)}`;
const blockHash = `0x${"34".repeat(32)}`;
const zeroHash = `0x${"00".repeat(32)}`;
const logsBloom = `0x${"00".repeat(256)}`;
const transferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const basisKey = "mera.demo.costBasis.";

test("sell-all keeps the fee reserve and accepts the smallest share balance", () => {
  const trade = {
    side: "sell" as const,
    amountWei: 40n,
    price: 40n * UNIT + 1n,
    portfolio: { cash: UNIT, shares: 1n },
    sellAll: true,
  };
  expect(coversTrade(trade)).toBe(true);
  expect(coversTrade({ ...trade, sellAll: false, amountWei: 40n })).toBe(false);
  expect(coversTrade({ ...trade, portfolio: { cash: 0n, shares: 1n } })).toBe(
    false,
  );
  expect(coversTrade({ ...trade, portfolio: { cash: UNIT, shares: 0n } })).toBe(
    false,
  );
});

test("Sell Max remains enabled after the quote falls; typing restores amount validation", async ({
  page,
}) => {
  const timestamp = 1_800_000_000;
  const shares = 100n * UNIT;
  const price = priceAt(BigInt(timestamp));
  let nextTimestamp = timestamp + 1;
  while (priceAt(BigInt(nextTimestamp)) >= price - UNIT / 1_000n) {
    nextTimestamp += 1;
  }
  await page.clock.install({ time: new Date((timestamp - 1) * 1_000) });
  await page.clock.pauseAt(new Date(timestamp * 1_000));
  await page.addInitScript((cachedAddress) => {
    localStorage.setItem(
      "mera.demo.account",
      JSON.stringify({ mode: "passkey", address: cachedAddress }),
    );
  }, address);
  await page.route(`${DEMO_RPC_URL}/`, async (route) => {
    const { id, method } = route.request().postDataJSON() as {
      id: number;
      method: string;
    };
    const result =
      method === "eth_chainId"
        ? "0x7a69"
        : method === "demo_market"
          ? { address: marketAddress }
          : method === "eth_call"
            ? `0x${shares.toString(16).padStart(64, "0")}`
            : `0x${(10_000n * UNIT).toString(16)}`;
    await route.fulfill({ json: { jsonrpc: "2.0", id, result } });
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Sell" }).click();
  const max = page.getByRole("button", { name: "Max", exact: true });
  await expect(max).toBeEnabled();
  await max.click();
  const amount = page.getByLabel("Amount (DEMOCASH)");
  const originalAmount = maxTradeInput({
    side: "sell",
    price,
    portfolio: { cash: 10_000n * UNIT, shares },
  });
  await expect(amount).toHaveValue(originalAmount);
  const sell = page.getByRole("button", { name: "Sell", exact: true });
  await expect(sell).toBeEnabled();
  await page.clock.runFor((nextTimestamp - timestamp) * 1_000);
  await expect(amount).toHaveValue(originalAmount);
  await expect(sell).toBeEnabled();
  await amount.fill(`${originalAmount}0`);
  await expect(sell).toBeDisabled();
});

test("a failed refresh after buying preserves the saved basis until balances recover", async ({
  page,
  context,
}) => {
  let traded = false;
  let failReads = false;
  await page.clock.install();
  await page.route(`${DEMO_RPC_URL}/`, async (route) => {
    const { id, method } = route.request().postDataJSON() as {
      id: number;
      method: string;
    };
    if (failReads && (method === "eth_getBalance" || method === "eth_call")) {
      await route.fulfill({
        json: {
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: "Balance read failed" },
        },
      });
      return;
    }
    let result: unknown;
    switch (method) {
      case "eth_chainId":
        result = "0x7a69";
        break;
      case "demo_market":
        result = { address: marketAddress };
        break;
      case "eth_call":
        result = `0x${(traded ? UNIT : 0n).toString(16).padStart(64, "0")}`;
        break;
      case "eth_getTransactionCount":
        result = "0x0";
        break;
      case "eth_estimateGas":
        result = "0x186a0";
        break;
      case "eth_maxPriorityFeePerGas":
      case "eth_gasPrice":
        result = "0x3b9aca00";
        break;
      case "eth_getBlockByNumber":
        result = { baseFeePerGas: "0x3b9aca00", number: "0x1" };
        break;
      case "eth_sendRawTransaction":
        result = transactionHash;
        break;
      case "eth_getTransactionReceipt":
        traded = true;
        failReads = true;
        result = {
          blockHash,
          blockNumber: "0x1",
          contractAddress: null,
          cumulativeGasUsed: "0x186a0",
          effectiveGasPrice: "0x3b9aca00",
          from: address,
          gasUsed: "0x186a0",
          logs: [
            {
              address: marketAddress,
              blockHash,
              blockNumber: "0x1",
              data: `0x${UNIT.toString(16).padStart(64, "0")}`,
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
        break;
      default:
        result = `0x${(10_000n * UNIT).toString(16)}`;
    }
    await route.fulfill({ json: { jsonrpc: "2.0", id, result } });
  });
  await page.goto("/");
  const client = await context.newCDPSession(page);
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
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".holding-value").first()).toHaveText("10,000.00");
  await page.getByLabel("Amount (DEMOCASH)").fill("100");
  await page.getByRole("button", { name: "Buy", exact: true }).click();
  await expect(
    page.getByText("Bought 1 NAD for 100.00 DEMOCASH"),
  ).toBeVisible();
  await expect(page.locator(".trade .status.error")).toBeVisible();
  const storedBasis = () =>
    page.evaluate((prefix) => {
      const key = Object.keys(localStorage).find((entry) =>
        entry.startsWith(prefix),
      );
      return key === undefined ? null : localStorage.getItem(key);
    }, basisKey);
  await expect.poll(storedBasis).toBe((100n * UNIT).toString());
  await expect(page.locator(".holding-value").first()).toHaveText("…");
  await page.getByLabel("Amount (DEMOCASH)").fill("1");
  await expect(
    page.getByRole("button", { name: "Buy", exact: true }),
  ).toBeDisabled();
  failReads = false;
  await page.clock.runFor(5_000);
  await expect(
    page.locator(".holding-row").filter({ hasText: "P&L" }),
  ).toContainText("-");
  expect(await storedBasis()).toBe((100n * UNIT).toString());
  traded = false;
  await page.clock.runFor(5_000);
  await expect.poll(storedBasis).toBe("0");
});
