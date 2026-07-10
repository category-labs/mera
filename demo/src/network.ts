type NetworkMode = "mainnet" | "testnet";

/**
 * Caches a per-network async resolver: each network mode resolves at
 * most once, and a rejected attempt is evicted so the next call retries.
 */
function cachePerNetwork<T>(
  resolve: (networkMode: NetworkMode) => Promise<T>,
): (networkMode: NetworkMode) => Promise<T> {
  const cached: Partial<Record<NetworkMode, Promise<T>>> = {};
  return (networkMode) => {
    const existing = cached[networkMode];
    if (existing) return existing;

    const next = resolve(networkMode);
    cached[networkMode] = next;
    next.catch(() => {
      if (cached[networkMode] === next) delete cached[networkMode];
    });
    return next;
  };
}

export type { NetworkMode };
export { cachePerNetwork };
