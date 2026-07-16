type FundingGateOptions = {
  /** Balance below which a top-up runs, in the chain's smallest unit. */
  minBalance: bigint;
  /** Funds the account, e.g. through a funding endpoint or an airdrop. */
  fund: () => Promise<void>;
  /** Re-reads the balance after a successful top-up. */
  readBalance: () => Promise<bigint>;
};

/**
 * Creates a funding gate for one account. The demo networks hold no real
 * value, so accounts are funded on demand: pass each balance read through the
 * gate, and a balance below `minBalance` is topped up and re-read. Only one
 * top-up runs at a time; concurrent reads await the same one. A failed top-up
 * or re-read (for example while a network restarts) returns the balance
 * unchanged, so the caller's next poll retries.
 */
function createFundingGate({
  minBalance,
  fund,
  readBalance,
}: FundingGateOptions): (balance: bigint) => Promise<bigint> {
  let inFlight: Promise<void> | null = null;
  return async (balance) => {
    if (balance >= minBalance) return balance;
    inFlight ??= fund().finally(() => {
      inFlight = null;
    });
    try {
      await inFlight;
      return await readBalance();
    } catch {
      return balance;
    }
  };
}

export { createFundingGate };
