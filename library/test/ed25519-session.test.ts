import { ed25519 } from "@noble/curves/ed25519.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import { createEd25519SigningSession } from "../dist/index.js";
import { expectError } from "./helpers.js";

const RFC_SECRET = hexToBytes(
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
);
const RFC_PUBLIC_KEY = hexToBytes(
  "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
);

test("signs messages and ends the session", () => {
  const buffer = new Uint8Array(RFC_SECRET);
  const session = createEd25519SigningSession({ privateKey: buffer });
  const message = new TextEncoder().encode("mera demo");
  const signature = session.signMessage(message);

  expect(buffer).toEqual(RFC_SECRET);

  expect(session.publicKey).toEqual(RFC_PUBLIC_KEY);
  expect(signature).toHaveLength(64);
  expect(ed25519.verify(signature, message, session.publicKey)).toBe(true);

  session.end();

  expectError(() => session.signMessage(message), "SESSION_ENDED");
});

test("rejects a wrong-length private key and leaves the caller's buffer unmodified", () => {
  const buffer = new Uint8Array(31).fill(7);

  expectError(
    () => createEd25519SigningSession({ privateKey: buffer }),
    "INPUT_INVALID",
  );

  expect(buffer).toEqual(new Uint8Array(31).fill(7));
});

test("a using declaration ends the session when its scope exits", () => {
  let escaped: ReturnType<typeof createEd25519SigningSession> | undefined;

  {
    using session = createEd25519SigningSession({
      privateKey: RFC_SECRET,
    });
    session.signMessage(new TextEncoder().encode("mera demo"));
    escaped = session;
  }

  expectError(
    () => escaped.signMessage(new TextEncoder().encode("mera demo")),
    "SESSION_ENDED",
  );
});
