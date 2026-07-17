type FundingGateOptions = {
  /** Balance below which a top-up runs, in the chain's smallest unit. */
  minBalance: bigint;
  /** Reports whether the account has prior on-chain activity. */
  hasActivity: () => Promise<boolean>;
  /** Funds the account, e.g. through a funding endpoint or an airdrop. */
  fund: () => Promise<void>;
  /** Re-reads the balance after a successful top-up. */
  readBalance: () => Promise<bigint>;
};

/**
 * Creates a funding gate for one account. The demo networks hold no real
 * value, so fresh accounts are funded on demand: pass each balance read
 * through the gate, and a balance below `minBalance` is topped up and re-read.
 * Accounts with prior on-chain activity are left alone, so an account emptied
 * on purpose stays empty instead of silently refilling. Activity is re-read on
 * each low-balance pass rather than cached, because a network reset wipes the
 * activity and must re-arm funding. Only one top-up runs at a time; concurrent
 * reads await the same one. A failed check, top-up, or re-read (for example
 * while a network restarts) returns the balance unchanged, so the caller's
 * next poll retries.
 */
function createFundingGate({
  minBalance,
  hasActivity,
  fund,
  readBalance,
}: FundingGateOptions): (balance: bigint) => Promise<bigint> {
  let inFlight: Promise<void> | null = null;
  return async (balance) => {
    if (balance >= minBalance) return balance;
    try {
      if (await hasActivity()) return balance;
      inFlight ??= fund().finally(() => {
        inFlight = null;
      });
      await inFlight;
      return await readBalance();
    } catch {
      return balance;
    }
  };
}

export { createFundingGate };
