import { describe, expect, it } from "vitest";
import { DEFAULT_INPUTS, deriveModel, type ModelInputs } from "./model";

describe("PRF model", () => {
  it("matches the legacy default vector", () => {
    const result = deriveModel(DEFAULT_INPUTS);

    expect({
      entropyHex: result.entropyHex,
      mnemonic: result.mnemonic,
      fingerprintHex: result.fingerprintHex,
      evmAddress: result.evmAddress,
      solanaAddress: result.solanaAddress,
    }).toEqual({
      entropyHex:
        "7caf18734b8f659ae7a77b29e6e4026b8387bbd7cadf1abaaa6c249d5b7fb10e",
      mnemonic:
        "lake juice broom novel wagon sniff ozone urge clarify damp above strike debris target game fossil boy stem only empty stick save service screen",
      fingerprintHex:
        "71b77201b470a15c5aee24defb02a6324ac5ab517b66175eda7743f2bbf3e007",
      evmAddress: "0xD59d5cD5B7FC4B6F94401c173897ad1De0Bda762",
      solanaAddress: "G2jck8gk9eQ7ESVtkabR7eKtQWdNFB7Gj3GCspFPfdsB",
    });
  });

  it("changes the account outputs when an input changes", () => {
    const original = deriveModel(DEFAULT_INPUTS);

    for (const field of ["rpId", "salt", "passkey"] as Array<
      keyof ModelInputs
    >) {
      const changed = deriveModel({
        ...DEFAULT_INPUTS,
        [field]: `${DEFAULT_INPUTS[field]}-changed`,
      });

      expect(changed.entropyHex).not.toBe(original.entropyHex);
      expect(changed.evmAddress).not.toBe(original.evmAddress);
      expect(changed.solanaAddress).not.toBe(original.solanaAddress);
    }
  });
});
