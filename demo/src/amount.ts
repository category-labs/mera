/**
 * Parses a decimal amount string into the chain's smallest unit (wei,
 * lamports), or `null` if the trimmed text is not a plain positive decimal
 * with at most `decimals` fraction digits.
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

/**
 * Formats an amount in the chain's smallest unit as a decimal string with
 * trailing zeros trimmed.
 */
function formatDecimalAmount(amount: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = amount % scale;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/u, "")}`;
}

export { formatDecimalAmount, parseDecimalAmount };
