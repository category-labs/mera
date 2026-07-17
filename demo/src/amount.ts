/**
 * Parses a decimal amount string into the chain's smallest unit (wei), or
 * `null` if the trimmed text is not a plain positive decimal with at most
 * `decimals` fraction digits.
 */
function parseDecimalAmount(value: string, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/u.test(trimmed)) return null;
  const [whole = "", fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) return null;
  const amount =
    BigInt(whole || "0") * 10n ** BigInt(decimals) +
    (fraction ? BigInt(fraction.padEnd(decimals, "0")) : 0n);
  return amount > 0n ? amount : null;
}

export { parseDecimalAmount };
