import type { EvmAddress } from "@category-labs/mera";
import { describeError } from "@category-labs/mera-demo-shared/errors";
import {
  type Fill,
  type Portfolio,
  REFRESH_MS,
  readPortfolio,
} from "@category-labs/mera-demo-shared/market";
import {
  type EvmContext,
  fundAccount,
} from "@category-labs/mera-demo-shared/network";
import {
  type CostBasisStore,
  initialPositionState,
  type LoadedPosition,
  loadedPosition,
  positionReducer,
} from "@category-labs/mera-demo-shared/position";
import {
  type ComputedRef,
  computed,
  type MaybeRefOrGetter,
  onScopeDispose,
  type Ref,
  ref,
  type ShallowRef,
  shallowRef,
  toValue,
  watch,
} from "vue";

type UsePositionResult = {
  position: ShallowRef<positionReducer.State>;
  loaded: ComputedRef<LoadedPosition | null>;
  stage: ComputedRef<positionReducer.TradeStage | null>;
  /** Whether a faucet top-up is in flight. */
  funding: Ref<boolean>;
  /** Tops up the account through the faucet, then re-reads its balances. */
  fund(): Promise<void>;
  /**
   * Starts `address`'s position from balances read ahead of the switch and
   * skips its first top-up. The caller switches to `address` right after.
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
function useNow(): Ref<number> {
  const now = ref(unixNow());
  const timer = setInterval(() => {
    now.value = unixNow();
  }, 1_000);
  onScopeDispose(() => clearInterval(timer));
  return now;
}

/**
 * The position of the account at `address`: balances read every REFRESH_MS,
 * the cost basis kept in `costBasis`, and fills applied as trades confirm.
 * Each new address gets one faucet top-up, which also refills a cached
 * account after a network reset.
 */
function usePosition(
  evm: MaybeRefOrGetter<EvmContext | null>,
  address: MaybeRefOrGetter<EvmAddress | null>,
  costBasis: CostBasisStore,
): UsePositionResult {
  const position = shallowRef(initialPositionState);
  const funding = ref(false);
  // Reads and trades share one increasing counter, so the reducer can order them.
  let operationId = 0;
  let funded: EvmAddress | null = null;

  function dispatch(event: positionReducer.Event): void {
    position.value = positionReducer(position.value, event);
  }

  function reset(next: EvmAddress | null, portfolio: Portfolio | null): void {
    dispatch({
      type: "accountChanged",
      address: next,
      basis: next === null ? null : costBasis.load(next),
      portfolio,
    });
  }

  // Watchers run before the component re-renders, so no frame shows the
  // previous account's position.
  watch(
    () => toValue(address),
    (next) => reset(next, null),
    { immediate: true },
  );

  watch(
    [() => position.value.address, () => position.value.basis],
    ([current, basis]) => {
      if (current !== null && basis !== null) costBasis.save(current, basis);
    },
  );

  async function refresh(): Promise<void> {
    const context = toValue(evm);
    const current = toValue(address);
    if (context === null || current === null) return;
    const requestId = ++operationId;
    dispatch({ type: "readStarted", address: current, requestId });
    try {
      const portfolio = await readPortfolio(context, current);
      dispatch({ type: "portfolioLoaded", requestId, portfolio });
    } catch (error) {
      dispatch({
        type: "refreshFailed",
        requestId,
        error: describeError(error),
      });
    }
  }

  async function fund(): Promise<void> {
    const context = toValue(evm);
    const current = toValue(address);
    if (context === null || current === null) return;
    funding.value = true;
    try {
      await fundAccount(context, current);
      await refresh();
    } finally {
      funding.value = false;
    }
  }

  const timer = setInterval(() => void refresh(), REFRESH_MS);
  onScopeDispose(() => clearInterval(timer));

  watch(
    [() => toValue(evm), () => toValue(address)],
    ([context, current]) => {
      void refresh();
      if (context === null || current === null || funded === current) return;
      funded = current;
      // A failed top-up surfaces through the balance reads.
      fund().catch(() => {});
    },
    { immediate: true },
  );

  function adopt(next: EvmAddress, portfolio: Portfolio): void {
    funded = next;
    reset(next, portfolio);
  }

  async function trade(run: () => Promise<Fill | null>): Promise<Fill | null> {
    const tradeId = ++operationId;
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
    loaded: computed(() => loadedPosition(position.value)),
    stage: computed(() => position.value.trade?.stage ?? null),
    funding,
    fund,
    adopt,
    trade,
  };
}

/**
 * Copy-to-clipboard button state: `copy(text)` writes the text, then for 1.2
 * seconds `feedback` reads "Copied" or "Copy failed", for the button to show
 * in place of its label.
 */
function useCopyButton(): {
  feedback: Ref<string | null>;
  copy: (text: string) => Promise<void>;
} {
  const feedback = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onScopeDispose(() => clearTimeout(timer));

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      feedback.value = "Copied";
    } catch {
      feedback.value = "Copy failed";
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      feedback.value = null;
    }, 1_200);
  }

  return { feedback, copy };
}

export { useCopyButton, useNow, usePosition };
