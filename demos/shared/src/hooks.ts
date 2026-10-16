import type { EvmAddress } from "@category-labs/mera";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { describeError } from "./errors";
import { type Fill, type Portfolio, REFRESH_MS, readPortfolio } from "./market";
import {
  type EvmContext,
  fundAccount,
  resolveEvmContext,
  retryingResolve,
} from "./network";
import {
  type CostBasisStore,
  initialPositionState,
  type LoadedPosition,
  loadedPosition,
  positionReducer,
} from "./position";

type UsePositionResult = {
  position: positionReducer.State;
  loaded: LoadedPosition | null;
  stage: positionReducer.TradeStage | null;
  /** Whether a faucet top-up is in flight. */
  funding: boolean;
  /** Tops up the account through the faucet, then re-reads its balances. */
  fund(): Promise<void>;
  /**
   * Starts `address`'s position from balances read ahead of the switch and
   * skips its first top-up. The caller switches to `address` in the same
   * update.
   */
  adopt(address: EvmAddress, portfolio: Portfolio): void;
  /**
   * Runs `run` as the account's trade: reads that start meanwhile are dropped,
   * and the fill it resolves to moves the position until the read that
   * settles it. `run` resolves to null when it placed no trade.
   */
  trade(run: () => Promise<Fill | null>): Promise<Fill | null>;
};

const unixNow = (): number => Math.floor(Date.now() / 1000);

/** Unix seconds, updated every second. */
function useNow(): number {
  const [now, setNow] = useState(unixNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(unixNow()), 1_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * The demo network, retried until it answers. `evmError` holds the latest
 * failure until a retry lands.
 */
function useEvmContext(rpcUrl: string): {
  evm: EvmContext | null;
  evmError: string | null;
} {
  const [evm, setEvm] = useState<EvmContext | null>(null);
  const [evmError, setEvmError] = useState<string | null>(null);
  useEffect(
    () =>
      retryingResolve(
        () => resolveEvmContext(rpcUrl),
        (context) => {
          setEvm(context);
          setEvmError(null);
        },
        (error) => setEvmError(describeError(error)),
      ),
    [rpcUrl],
  );
  return { evm, evmError };
}

/**
 * The position of the account at `address`: balances read every REFRESH_MS,
 * the cost basis kept in `costBasis`, and fills applied as trades confirm.
 * Each new address gets one faucet top-up, which also refills a cached
 * account after a network reset.
 */
function usePosition(
  evm: EvmContext | null,
  address: EvmAddress | null,
  costBasis: CostBasisStore,
): UsePositionResult {
  const [position, dispatch] = useReducer(
    positionReducer,
    initialPositionState,
  );
  const [funding, setFunding] = useState(false);
  // Reads and trades share one increasing counter, so the reducer can order them.
  const operationId = useRef(0);
  const funded = useRef<EvmAddress | null>(null);

  // Reset during render rather than in an effect, so no frame shows the
  // previous account's position.
  if (position.address !== address) {
    dispatch({
      type: "accountChanged",
      address,
      basis: address === null ? null : costBasis.load(address),
      portfolio: null,
    });
  }

  useEffect(() => {
    if (position.address !== null && position.basis !== null) {
      costBasis.save(position.address, position.basis);
    }
  }, [costBasis, position.address, position.basis]);

  const refresh = useCallback(async (): Promise<void> => {
    if (evm === null || address === null) return;
    const requestId = ++operationId.current;
    dispatch({ type: "readStarted", address, requestId });
    try {
      const portfolio = await readPortfolio(evm, address);
      dispatch({ type: "portfolioLoaded", requestId, portfolio });
    } catch (error) {
      dispatch({
        type: "refreshFailed",
        requestId,
        error: describeError(error),
      });
    }
  }, [evm, address]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const fund = useCallback(async (): Promise<void> => {
    if (evm === null || address === null) return;
    setFunding(true);
    try {
      await fundAccount(evm, address);
      await refresh();
    } finally {
      setFunding(false);
    }
  }, [evm, address, refresh]);

  useEffect(() => {
    if (evm === null || address === null || funded.current === address) return;
    funded.current = address;
    // A failed top-up surfaces through the balance reads.
    fund().catch(() => {});
  }, [evm, address, fund]);

  function adopt(next: EvmAddress, portfolio: Portfolio): void {
    funded.current = next;
    dispatch({
      type: "accountChanged",
      address: next,
      basis: costBasis.load(next),
      portfolio,
    });
  }

  async function trade(run: () => Promise<Fill | null>): Promise<Fill | null> {
    const tradeId = ++operationId.current;
    dispatch({ type: "tradeStarted", tradeId });
    try {
      const fill = await run();
      if (fill !== null) {
        dispatch({ type: "tradeConfirmed", tradeId, fill });
        void refresh();
      }
      return fill;
    } finally {
      dispatch({ type: "tradeFinished", tradeId });
    }
  }

  return {
    position,
    loaded: loadedPosition(position),
    stage: position.trade?.stage ?? null,
    funding,
    fund,
    adopt,
    trade,
  };
}

/**
 * Copy-to-clipboard button state: `copy(text)` writes the text, then for 1.2
 * seconds `feedback` reads "Copied" or "Copy failed", for the button to show
 * in place of its label. A write that rejects or resolves to false fails;
 * expo-clipboard reports failure with false.
 */
function useCopyButton(
  writeText: (text: string) => Promise<unknown> = (text) =>
    navigator.clipboard.writeText(text),
): { feedback: string | null; copy: (text: string) => Promise<void> } {
  const [feedback, setFeedback] = useState<string | null>(null);
  useEffect(() => {
    if (feedback === null) return;
    const timer = setTimeout(() => setFeedback(null), 1_200);
    return () => clearTimeout(timer);
  }, [feedback]);
  async function copy(text: string): Promise<void> {
    try {
      const written = await writeText(text);
      setFeedback(written === false ? "Copy failed" : "Copied");
    } catch {
      setFeedback("Copy failed");
    }
  }
  return { feedback, copy };
}

export { useCopyButton, useEvmContext, useNow, usePosition };
