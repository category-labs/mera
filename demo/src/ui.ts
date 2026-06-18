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
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export { bytesToBase64, shorten, trimAmount };
