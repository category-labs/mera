import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const PRF_OUTPUT_LENGTH = 32;
const evmPath = (index: number): string => `m/44'/60'/0'/0/${index}`;

function prfOutputToMnemonic(prfOutput: Uint8Array): string {
  if (prfOutput.length !== PRF_OUTPUT_LENGTH) {
    throw new Error("PRF output must be 32 bytes.");
  }
  return entropyToMnemonic(prfOutput, wordlist);
}

function mnemonicToSeed(mnemonic: string): Uint8Array {
  return mnemonicToSeedSync(mnemonic);
}

function deriveEvmPrivateKey(seed: Uint8Array, index: number): Uint8Array {
  const node = HDKey.fromMasterSeed(seed).derive(evmPath(index));
  if (!node.privateKey) throw new Error("BIP-32 produced no private key.");
  return node.privateKey;
}

export { deriveEvmPrivateKey, mnemonicToSeed, prfOutputToMnemonic };
