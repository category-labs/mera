import { expect, test } from "@playwright/test";
import { randomBytes } from "../dist/webcrypto.js";
import { withCountedRandomness } from "./helpers.js";

test("randomBytes draws every byte from crypto.getRandomValues", async () => {
  const { result, calls, bytesDrawn } = await withCountedRandomness(() =>
    randomBytes(32),
  );

  expect(calls).toBe(1);
  expect(bytesDrawn).toBe(32);
  expect(result).toHaveLength(32);
});
