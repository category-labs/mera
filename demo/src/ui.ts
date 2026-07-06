/** Shortens an address or hash for compact display. */
function shorten(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** Formats a decimal amount with at most five fraction digits. */
function trimAmount(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return amount.toLocaleString("en-US", { maximumFractionDigits: 5 });
}

/** Encodes bytes as classical (padded) base64 for display alongside other byte blobs. */
function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export { bytesToBase64, shorten, trimAmount };
