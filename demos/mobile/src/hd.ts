import { HDKey } from "@scure/bip32";
import {
  entropyToMnemonic,
  mnemonicToSeedSync as mnemonicToSeed,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

// Uses the first account.
const BIP_44_EVM_PATH = "m/44'/60'/0'/0/0";

function prfOutputToMnemonic(prfOutput: Uint8Array): string {
  return entropyToMnemonic(prfOutput, wordlist);
}

function deriveEvmPrivateKey(seed: Uint8Array): Uint8Array {
  const node = HDKey.fromMasterSeed(seed).derive(BIP_44_EVM_PATH);
  if (!node.privateKey) {
    throw new Error("BIP-32 derivation produced no private key");
  }
  return node.privateKey;
}

export { deriveEvmPrivateKey, mnemonicToSeed, prfOutputToMnemonic };
