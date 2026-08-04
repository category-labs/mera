import { DEFAULT_INPUTS, type ModelInputs } from "./model";

const HASH_FIELDS: ReadonlyArray<keyof ModelInputs> = [
  "rpId",
  "salt",
  "passkey",
];

function readHash(hash: string): ModelInputs {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const inputs = { ...DEFAULT_INPUTS };

  for (const field of HASH_FIELDS) {
    if (params.has(field)) {
      inputs[field] = params.get(field) ?? "";
    }
  }

  return inputs;
}

function writeHash(inputs: ModelInputs): string {
  const params = new URLSearchParams();
  for (const field of HASH_FIELDS) {
    params.set(field, inputs[field]);
  }
  return `#${params.toString()}`;
}

export { readHash, writeHash };
