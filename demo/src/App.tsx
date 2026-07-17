import { type ReactElement, useEffect, useState } from "react";
import { type EvmContext, resolveEvmContext } from "./chains/evm";
import { describeError } from "./connect";
import { TradingCard } from "./TradingCard";

const RESOLVE_RETRY_MS = 5_000;

/**
 * Resolves the network context, retrying on failure until stopped. Each
 * failure is surfaced through `onError` while the retries continue, because
 * the demo network comes back empty but reachable after a restart, which can
 * take up to a minute. Returns a stop function for effect cleanup.
 */
function retryingResolve<T>(
  resolve: () => Promise<T>,
  onResolved: (value: T) => void,
  onError: (message: string) => void,
): () => void {
  let stopped = false;
  let timer: number | undefined;
  function attempt(): void {
    resolve().then(
      (value) => {
        if (!stopped) onResolved(value);
      },
      (error: unknown) => {
        if (stopped) return;
        onError(describeError(error));
        timer = window.setTimeout(attempt, RESOLVE_RETRY_MS);
      },
    );
  }
  attempt();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}

function App(): ReactElement {
  const [evmContext, setEvmContext] = useState<EvmContext | null>(null);
  const [evmError, setEvmError] = useState<string | null>(null);

  useEffect(
    () =>
      retryingResolve(
        resolveEvmContext,
        (context) => {
          setEvmContext(context);
          // Clear the failure once a retry lands, or the error line would
          // outlive the outage it reported.
          setEvmError(null);
        },
        setEvmError,
      ),
    [],
  );

  return (
    <main className="app">
      <h1>Mera Demo</h1>
      <TradingCard evm={evmContext} evmError={evmError} />
    </main>
  );
}

export { App };
