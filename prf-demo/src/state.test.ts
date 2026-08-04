import { describe, expect, it } from "vitest";
import { DEFAULT_INPUTS, type ModelInputs } from "./model";
import { readHash, writeHash } from "./state";

describe("shared state", () => {
  it("uses defaults and round-trips shared state", () => {
    expect(readHash("")).toEqual(DEFAULT_INPUTS);
    expect(readHash("#salt=custom")).toEqual({
      ...DEFAULT_INPUTS,
      salt: "custom",
    });

    const inputs: ModelInputs = {
      rpId: "例.example",
      salt: "salt & pepper",
      passkey: "clé=orange#1",
    };
    expect(readHash(writeHash(inputs))).toEqual(inputs);
    expect(writeHash(DEFAULT_INPUTS)).toBe(
      "#rpId=mera.category.xyz&salt=mera.prf.salt.v1&passkey=blue-yubikey",
    );
    expect(() => readHash("#rpId=%E0%A4%A&salt=%&passkey=%ZZ")).not.toThrow();
  });
});
