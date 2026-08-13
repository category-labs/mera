import { createHash } from "node:crypto";

// Chrome derives the extension ID from the manifest "key": the first 16 bytes
// of the key's SHA-256 digest, with each hex digit mapped to a letter from "a".
function extensionIdFromKey(key: string): string {
  const nibbles = createHash("sha256")
    .update(Buffer.from(key, "base64"))
    .digest()
    .subarray(0, 16)
    .toString("hex");
  return [...nibbles]
    .map((value) => String.fromCharCode(97 + Number.parseInt(value, 16)))
    .join("");
}

export { extensionIdFromKey };
