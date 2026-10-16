import { expect, test } from "@playwright/test";
import { coversTrade, type Order, orderShares, UNIT } from "../src/market";

const sellAll: Order = { kind: "sellAll", side: "sell" };

test("sell-all keeps the fee reserve and accepts the smallest share balance", () => {
  const trade = {
    order: sellAll,
    price: 40n * UNIT + 1n,
    portfolio: { cash: UNIT, shares: 1n },
  };
  expect(coversTrade(trade)).toBe(true);
  expect(
    coversTrade({
      ...trade,
      order: { kind: "amount", side: "sell", amountWei: 40n },
    }),
  ).toBe(false);
  expect(coversTrade({ ...trade, portfolio: { cash: 0n, shares: 1n } })).toBe(
    false,
  );
  expect(coversTrade({ ...trade, portfolio: { cash: UNIT, shares: 0n } })).toBe(
    false,
  );
});

test("a sell within a cent of the position sends every share; a buy is only priced", () => {
  const price = 40n * UNIT;
  const heldShares = 2n * UNIT;
  const almostAll: Order = {
    kind: "amount",
    side: "sell",
    amountWei: 80n * UNIT - 10n ** 15n,
  };
  expect(orderShares({ order: almostAll, price, heldShares })).toBe(heldShares);
  expect(orderShares({ order: sellAll, price, heldShares })).toBe(heldShares);
  expect(
    orderShares({
      order: { kind: "amount", side: "sell", amountWei: 40n * UNIT },
      price,
      heldShares,
    }),
  ).toBe(UNIT);
  expect(
    orderShares({
      order: { kind: "amount", side: "buy", amountWei: 80n * UNIT },
      price,
      heldShares,
    }),
  ).toBe(2n * UNIT);
});
