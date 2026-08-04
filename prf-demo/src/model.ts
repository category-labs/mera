import {
  createEd25519SigningSession,
  createSecp256k1SigningSession,
  getEvmAddress,
  getSolanaAddress,
} from "@category-labs/mera";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

type ModelInputs = {
  rpId: string;
  salt: string;
  passkey: string;
};

type ModelResult = {
  entropyHex: string;
  mnemonic: string;
  fingerprint: Uint8Array;
  fingerprintHex: string;
  evmAddress: string;
  solanaAddress: string;
};

const DEFAULT_INPUTS: ModelInputs = {
  rpId: "mera.category.xyz",
  salt: "mera.prf.salt.v1",
  passkey: "blue-yubikey",
};

function deriveSolanaPrivateKey(seed: Uint8Array): Uint8Array {
  const path = [44, 501, 0, 0];
  let node = hmac(sha512, utf8ToBytes("ed25519 seed"), seed);

  for (const step of path) {
    const data = new Uint8Array(37);
    data.set(node.subarray(0, 32), 1);
    new DataView(data.buffer).setUint32(33, (step + 0x80000000) >>> 0, false);
    const next = hmac(sha512, node.subarray(32), data);
    node = next;
  }

  return node.slice(0, 32);
}

function deriveModel(inputs: ModelInputs): ModelResult {
  const credentialMaterial = concatBytes(
    utf8ToBytes(inputs.rpId),
    new Uint8Array([0]),
    utf8ToBytes(inputs.passkey),
  );
  const credentialSecret = sha256(credentialMaterial);

  const entropy = hmac(sha256, credentialSecret, utf8ToBytes(inputs.salt));

  const mnemonic = entropyToMnemonic(entropy, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  const evmNode = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  if (evmNode.privateKey === null) {
    throw new Error("EVM derivation produced no private key");
  }

  const evmSession = createSecp256k1SigningSession({
    privateKey: evmNode.privateKey,
  });
  const evmAddress = getEvmAddress(evmSession.publicKey);
  evmSession.end();

  const solanaPrivateKey = deriveSolanaPrivateKey(seed);
  const solanaSession = createEd25519SigningSession({
    privateKey: solanaPrivateKey,
  });
  const solanaAddress = getSolanaAddress(solanaSession.publicKey);
  solanaSession.end();

  const fingerprint = keccak_256(entropy);

  return {
    entropyHex: bytesToHex(entropy),
    mnemonic,
    fingerprint,
    fingerprintHex: bytesToHex(fingerprint),
    evmAddress,
    solanaAddress,
  };
}

export type { ModelInputs, ModelResult };
export { DEFAULT_INPUTS, deriveModel };
