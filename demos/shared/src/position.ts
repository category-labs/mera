import type { EvmAddress } from "@category-labs/mera";
import { costBasisAfterBuy, costBasisAfterSell } from "./costBasis";
import type { Fill, Portfolio } from "./market";

/** A position whose balances and cost basis are all known. */
type LoadedPosition = Portfolio & { basis: bigint };

const initialPositionState: positionReducer.State = {
  address: null,
  balances: null,
  basis: null,
  liveReadsFrom: null,
  trade: null,
  readError: null,
};

/**
 * Applies account, balance-read, and confirmed-trade events without side effects.
 * Request and trade IDs come from one counter per surface that only increases,
 * including across account changes.
 */
function positionReducer(
  state: positionReducer.State,
  event: positionReducer.Event,
): positionReducer.State {
  switch (event.type) {
    case "accountChanged":
      if (state.address === event.address) return state;
      return {
        ...initialPositionState,
        address: event.address,
        balances: event.portfolio,
        basis: event.portfolio?.shares === 0n ? 0n : event.basis,
      };
    case "basisLoaded":
      if (state.address !== event.address || state.basis !== null) return state;
      return { ...state, basis: event.basis };
    case "readStarted":
      // A read during the send can already include the trade; applying its
      // fill again would count those shares twice.
      if (state.address !== event.address || state.trade?.stage === "sending") {
        return state;
      }
      return {
        ...state,
        liveReadsFrom: state.liveReadsFrom ?? event.requestId,
      };
    case "portfolioLoaded":
      if (
        state.liveReadsFrom === null ||
        event.requestId < state.liveReadsFrom
      ) {
        return state;
      }
      return {
        ...state,
        balances: event.portfolio,
        basis: event.portfolio.shares === 0n ? 0n : state.basis,
        liveReadsFrom: event.requestId + 1,
        // Reads during the send are dropped, so this one includes any trade
        // that was settling.
        trade: null,
        readError: null,
      };
    case "refreshFailed":
      if (
        state.liveReadsFrom === null ||
        event.requestId < state.liveReadsFrom
      ) {
        return state;
      }
      // A failure has no balances to replace an older read's, so it leaves
      // the cutoff for that read to land.
      return { ...state, readError: event.error };
    case "tradeStarted":
      if (state.trade !== null || loadedPosition(state) === null) return state;
      return {
        ...state,
        trade: { id: event.tradeId, stage: "sending" },
        liveReadsFrom: null,
      };
    case "tradeConfirmed": {
      const position = loadedPosition(state);
      if (
        state.trade?.id !== event.tradeId ||
        state.trade.stage !== "sending" ||
        position === null
      ) {
        return state;
      }
      const { fill } = event;
      const after =
        fill.side === "buy"
          ? {
              shares: position.shares + fill.shares,
              basis: costBasisAfterBuy(position.basis, fill.spent),
            }
          : {
              shares:
                position.shares > fill.shares
                  ? position.shares - fill.shares
                  : 0n,
              basis: costBasisAfterSell(
                position.basis,
                fill.shares,
                position.shares,
              ),
            };
      return {
        ...state,
        // The fill gives the share count, but cash also depends on the
        // network fee, so it waits for the read that settles the trade.
        balances: { cash: position.cash, shares: after.shares },
        basis: after.basis,
        trade: { id: event.tradeId, stage: "settling" },
        readError: null,
      };
    }
    case "tradeFinished":
      if (
        state.trade?.id !== event.tradeId ||
        state.trade.stage !== "sending"
      ) {
        return state;
      }
      return { ...state, trade: null };
  }
}

declare namespace positionReducer {
  /**
   * A trade is `sending` until its receipt arrives, then `settling` until a
   * balance read that includes it lands.
   */
  type TradeStage = "sending" | "settling";

  type State = {
    address: EvmAddress | null;
    /** The last balances read, with shares moved by fills confirmed since. */
    balances: Portfolio | null;
    basis: bigint | null;
    /**
     * Reads with this ID or a later one may still land. Null until a read
     * starts after the last account change or trade, so older reads drop.
     */
    liveReadsFrom: number | null;
    trade: { id: number; stage: TradeStage } | null;
    readError: string | null;
  };

  type Event =
    | {
        type: "accountChanged";
        address: EvmAddress | null;
        basis: bigint | null;
        portfolio: Portfolio | null;
      }
    | { type: "basisLoaded"; address: EvmAddress; basis: bigint }
    | { type: "readStarted"; address: EvmAddress; requestId: number }
    | { type: "portfolioLoaded"; requestId: number; portfolio: Portfolio }
    | { type: "refreshFailed"; requestId: number; error: string }
    | { type: "tradeStarted"; tradeId: number }
    | { type: "tradeConfirmed"; tradeId: number; fill: Fill }
    | { type: "tradeFinished"; tradeId: number };
}

/** The position once a balance read and the cost basis are both in, else null. */
function loadedPosition(state: positionReducer.State): LoadedPosition | null {
  if (state.balances === null || state.basis === null) return null;
  return { ...state.balances, basis: state.basis };
}

export type { LoadedPosition };
export { initialPositionState, loadedPosition, positionReducer };
