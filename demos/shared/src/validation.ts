const MAX_UINT256 = 2n ** 256n - 1n;

function validateTradeAmount(value: bigint): void {
  if (value <= 0n || value > MAX_UINT256) {
    throw new Error("The trade amount is outside the uint256 range.");
  }
}

function assertDemoChainId(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new Error(
      `Wrong demo chain: expected ${expected}, received ${actual}.`,
    );
  }
}

export { assertDemoChainId, MAX_UINT256, validateTradeAmount };
