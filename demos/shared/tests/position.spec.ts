import { expect, test } from "@playwright/test";
import { UNIT } from "../src/market";
import {
  initialPositionState,
  loadedPosition,
  positionReducer,
} from "../src/position";

const address = "0x1111111111111111111111111111111111111111";
const otherAddress = "0x2222222222222222222222222222222222222222";
const cash = 10_000n * UNIT;

function openedPosition(shares: bigint, basis: bigint): positionReducer.State {
  return positionReducer(initialPositionState, {
    type: "accountChanged",
    address,
    basis,
    portfolio: { cash, shares },
  });
}

test("a confirmed buy advances quantity and basis together even when refreshing fails", () => {
  let state = openedPosition(0n, 0n);
  state = positionReducer(state, { type: "tradeStarted", tradeId: 1 });
  state = positionReducer(state, {
    type: "tradeConfirmed",
    tradeId: 1,
    fill: { side: "buy", shares: 2n * UNIT, spent: 100n * UNIT },
  });
  state = positionReducer(state, { type: "tradeFinished", tradeId: 1 });
  expect(loadedPosition(state)).toEqual({
    cash,
    shares: 2n * UNIT,
    basis: 100n * UNIT,
  });
  expect(state.trade).toEqual({ id: 1, stage: "settling" });
  state = positionReducer(state, {
    type: "readStarted",
    address,
    requestId: 2,
  });
  state = positionReducer(state, {
    type: "refreshFailed",
    requestId: 2,
    error: "Offline",
  });
  expect(loadedPosition(state)).toEqual({
    cash,
    shares: 2n * UNIT,
    basis: 100n * UNIT,
  });
  expect(state.readError).toBe("Offline");
  expect(state.trade).toEqual({ id: 1, stage: "settling" });
});

test("reads started before or during a trade cannot replace its confirmed position", () => {
  let state = openedPosition(0n, 0n);
  state = positionReducer(state, {
    type: "readStarted",
    address,
    requestId: 1,
  });
  state = positionReducer(state, { type: "tradeStarted", tradeId: 2 });
  state = positionReducer(state, {
    type: "readStarted",
    address,
    requestId: 3,
  });
  const sending = state;
  state = positionReducer(state, {
    type: "portfolioLoaded",
    requestId: 3,
    portfolio: { cash, shares: UNIT },
  });
  expect(state).toBe(sending);
  state = positionReducer(state, {
    type: "tradeConfirmed",
    tradeId: 2,
    fill: { side: "buy", shares: UNIT, spent: 40n * UNIT },
  });
  const confirmed = state;
  for (const requestId of [1, 3]) {
    expect(
      positionReducer(state, {
        type: "portfolioLoaded",
        requestId,
        portfolio: { cash, shares: 0n },
      }),
    ).toBe(confirmed);
    expect(
      positionReducer(state, {
        type: "refreshFailed",
        requestId,
        error: "Old failure",
      }),
    ).toBe(confirmed);
  }
  state = positionReducer(state, {
    type: "readStarted",
    address,
    requestId: 4,
  });
  state = positionReducer(state, {
    type: "portfolioLoaded",
    requestId: 4,
    portfolio: { cash: cash - 41n * UNIT, shares: UNIT },
  });
  expect(loadedPosition(state)).toEqual({
    cash: cash - 41n * UNIT,
    shares: UNIT,
    basis: 40n * UNIT,
  });
  expect(state.trade).toBeNull();
});

test("a failed poll keeps the last balances", () => {
  let state = openedPosition(UNIT, 40n * UNIT);
  state = positionReducer(state, {
    type: "readStarted",
    address,
    requestId: 1,
  });
  state = positionReducer(state, {
    type: "refreshFailed",
    requestId: 1,
    error: "Offline",
  });
  expect(state.readError).toBe("Offline");
  expect(loadedPosition(state)).toEqual({
    cash,
    shares: UNIT,
    basis: 40n * UNIT,
  });
  expect(state.trade).toBeNull();
});

test("a slow read still lands unless a newer read landed first", () => {
  let state = openedPosition(UNIT, 40n * UNIT);
  state = positionReducer(state, {
    type: "readStarted",
    address,
    requestId: 1,
  });
  state = positionReducer(state, {
    type: "readStarted",
    address,
    requestId: 2,
  });
  const slowFirst = positionReducer(state, {
    type: "portfolioLoaded",
    requestId: 1,
    portfolio: { cash, shares: 2n * UNIT },
  });
  expect(slowFirst.balances).toEqual({ cash, shares: 2n * UNIT });
  state = positionReducer(state, {
    type: "portfolioLoaded",
    requestId: 2,
    portfolio: { cash, shares: UNIT },
  });
  expect(
    positionReducer(state, {
      type: "portfolioLoaded",
      requestId: 1,
      portfolio: { cash, shares: 0n },
    }),
  ).toBe(state);
});

test("a newer read's failure does not drop an older read that succeeds", () => {
  let state = openedPosition(0n, 0n);
  state = positionReducer(state, { type: "tradeStarted", tradeId: 1 });
  state = positionReducer(state, {
    type: "tradeConfirmed",
    tradeId: 1,
    fill: { side: "buy", shares: UNIT, spent: 40n * UNIT },
  });
  state = positionReducer(state, {
    type: "readStarted",
    address,
    requestId: 2,
  });
  state = positionReducer(state, {
    type: "readStarted",
    address,
    requestId: 3,
  });
  state = positionReducer(state, {
    type: "refreshFailed",
    requestId: 3,
    error: "Offline",
  });
  state = positionReducer(state, {
    type: "portfolioLoaded",
    requestId: 2,
    portfolio: { cash: cash - 41n * UNIT, shares: UNIT },
  });
  expect(state.balances).toEqual({ cash: cash - 41n * UNIT, shares: UNIT });
  expect(state.trade).toBeNull();
});

test("account changes discard old reads and trade results, including switching back", () => {
  let state = openedPosition(0n, 0n);
  state = positionReducer(state, {
    type: "readStarted",
    address,
    requestId: 1,
  });
  state = positionReducer(state, { type: "tradeStarted", tradeId: 2 });
  state = positionReducer(state, {
    type: "accountChanged",
    address: otherAddress,
    basis: 0n,
    portfolio: null,
  });
  state = positionReducer(state, {
    type: "accountChanged",
    address,
    basis: 0n,
    portfolio: { cash, shares: 0n },
  });
  expect(
    positionReducer(state, {
      type: "portfolioLoaded",
      requestId: 1,
      portfolio: { cash, shares: UNIT },
    }),
  ).toBe(state);
  expect(
    positionReducer(state, {
      type: "tradeConfirmed",
      tradeId: 2,
      fill: { side: "buy", shares: UNIT, spent: 40n * UNIT },
    }),
  ).toBe(state);
});

test("partial and full sells release basis alongside the sold shares", () => {
  let state = openedPosition(4n * UNIT, 160n * UNIT);
  state = positionReducer(state, { type: "tradeStarted", tradeId: 1 });
  state = positionReducer(state, {
    type: "tradeConfirmed",
    tradeId: 1,
    fill: { side: "sell", shares: UNIT },
  });
  expect(loadedPosition(state)).toEqual({
    cash,
    shares: 3n * UNIT,
    basis: 120n * UNIT,
  });
  state = positionReducer(state, {
    type: "readStarted",
    address,
    requestId: 2,
  });
  state = positionReducer(state, {
    type: "portfolioLoaded",
    requestId: 2,
    portfolio: { cash, shares: 3n * UNIT },
  });
  state = positionReducer(state, { type: "tradeStarted", tradeId: 3 });
  state = positionReducer(state, {
    type: "tradeConfirmed",
    tradeId: 3,
    fill: { side: "sell", shares: 3n * UNIT },
  });
  expect(loadedPosition(state)).toEqual({ cash, shares: 0n, basis: 0n });
});

test("a cancelled trade preserves the position and ignores late confirmation", () => {
  let state = openedPosition(UNIT, 40n * UNIT);
  state = positionReducer(state, { type: "tradeStarted", tradeId: 1 });
  expect(state.trade).toEqual({ id: 1, stage: "sending" });
  state = positionReducer(state, { type: "tradeFinished", tradeId: 1 });
  expect(state.trade).toBeNull();
  expect(loadedPosition(state)).toEqual({
    cash,
    shares: UNIT,
    basis: 40n * UNIT,
  });
  expect(
    positionReducer(state, {
      type: "tradeConfirmed",
      tradeId: 1,
      fill: { side: "buy", shares: UNIT, spent: 40n * UNIT },
    }),
  ).toBe(state);
});

test("an accepted empty portfolio clears the position and basis together", () => {
  let state = openedPosition(UNIT, 40n * UNIT);
  state = positionReducer(state, {
    type: "readStarted",
    address,
    requestId: 1,
  });
  state = positionReducer(state, {
    type: "portfolioLoaded",
    requestId: 1,
    portfolio: { cash, shares: 0n },
  });
  expect(loadedPosition(state)).toEqual({ cash, shares: 0n, basis: 0n });
  state = positionReducer(state, { type: "tradeStarted", tradeId: 2 });
  state = positionReducer(state, {
    type: "tradeConfirmed",
    tradeId: 2,
    fill: { side: "buy", shares: UNIT, spent: 25n * UNIT },
  });
  expect(state.basis).toBe(25n * UNIT);
});

test("asynchronous basis hydration cannot overwrite a reset or a newer trade", () => {
  let state = positionReducer(initialPositionState, {
    type: "accountChanged",
    address,
    basis: null,
    portfolio: null,
  });
  state = positionReducer(state, {
    type: "readStarted",
    address,
    requestId: 1,
  });
  state = positionReducer(state, {
    type: "portfolioLoaded",
    requestId: 1,
    portfolio: { cash, shares: 0n },
  });
  state = positionReducer(state, { type: "tradeStarted", tradeId: 2 });
  state = positionReducer(state, {
    type: "tradeConfirmed",
    tradeId: 2,
    fill: { side: "buy", shares: UNIT, spent: 25n * UNIT },
  });
  expect(
    positionReducer(state, {
      type: "basisLoaded",
      address,
      basis: 100n * UNIT,
    }),
  ).toBe(state);
});

test("a nonempty position loads only once its stored basis does", () => {
  let state = positionReducer(initialPositionState, {
    type: "accountChanged",
    address,
    basis: null,
    portfolio: { cash, shares: UNIT },
  });
  expect(loadedPosition(state)).toBeNull();
  expect(positionReducer(state, { type: "tradeStarted", tradeId: 1 })).toBe(
    state,
  );
  state = positionReducer(state, {
    type: "basisLoaded",
    address,
    basis: 40n * UNIT,
  });
  expect(loadedPosition(state)).toEqual({
    cash,
    shares: UNIT,
    basis: 40n * UNIT,
  });
});
