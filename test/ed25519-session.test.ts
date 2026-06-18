import * as ed25519 from "@noble/ed25519";
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

test("signs messages and locks the session", async () => {
  const buffer = new Uint8Array(RFC_SECRET);
  const session = createEd25519SigningSession({ consumePrivateKey: buffer });
  const message = new TextEncoder().encode("mera demo");
  const signature = await session.signMessage(message);

  // Caller's buffer was zeroed by the session.
  expect(buffer).toEqual(new Uint8Array(32));

  expect(session.publicKey).toEqual(RFC_PUBLIC_KEY);
  expect(signature).toHaveLength(64);
  expect(await ed25519.verifyAsync(signature, message, session.publicKey)).toBe(
    true,
  );
  expect(session.exportPrivateKey()).toEqual(RFC_SECRET);

  session.lock();

  expectError(() => session.exportPrivateKey(), "SESSION_LOCKED");
  await expect(session.signMessage(message)).rejects.toMatchObject({
    code: "SESSION_LOCKED",
  });
});

test("rejects non-32-byte private keys", () => {
  expectError(
    () =>
      createEd25519SigningSession({
        consumePrivateKey: new Uint8Array(31),
      }),
    "INPUT_INVALID",
  );
});
