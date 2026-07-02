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

  session.lock();

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

test("zeroes the caller's buffer when the private key is the wrong length", () => {
  const buffer = new Uint8Array(31).fill(7);

  expectError(
    () => createEd25519SigningSession({ consumePrivateKey: buffer }),
    "INPUT_INVALID",
  );

  expect(buffer).toEqual(new Uint8Array(31));
});

test("signs the message snapshot taken at call time, not later mutations", async () => {
  const session = createEd25519SigningSession({
    consumePrivateKey: new Uint8Array(RFC_SECRET),
  });

  const original = new TextEncoder().encode("mera demo");
  const message = new Uint8Array(original); // caller-owned buffer we will mutate
  const pending = session.signMessage(message); // not awaited
  message.fill(0); // mutate before noble reads the buffer (it reads after its await)
  const signature = await pending;

  // The signature is over the bytes at call time, not the later mutation.
  expect(
    await ed25519.verifyAsync(signature, original, session.publicKey),
  ).toBe(true);
  expect(await ed25519.verifyAsync(signature, message, session.publicKey)).toBe(
    false,
  );
});
