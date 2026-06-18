const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Parses a decimal SOL string into integer lamports, or `null` if invalid or non-positive. */
function parseSolAmount(value: string): bigint | null {
  const trimmed = value.trim();

  if (!/^(?:\d+(?:\.\d{0,9})?|\.\d{1,9})$/u.test(trimmed)) {
    return null;
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const lamports =
    BigInt(whole || "0") * LAMPORTS_PER_SOL +
    (fraction ? BigInt(fraction.padEnd(9, "0")) : 0n);

  return lamports > 0n ? lamports : null;
}

/** Formats integer lamports as a trimmed decimal SOL string. */
function formatSol(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = lamports % LAMPORTS_PER_SOL;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(9, "0").replace(/0+$/u, "")}`;
}

export { formatSol, parseSolAmount };
