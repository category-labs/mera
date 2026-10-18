---
title: deriveEvmPrivateKey
description: Derives the private key of an EVM account from a PRF output.
---

Derives the secp256k1 private key of an EVM account from a [PRF output](/concepts/passkeys-and-prf/). The PRF output is the entropy of a [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) phrase, and the key sits at the [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki) path `m/44'/60'/0'/0/{accountIndex}` of the phrase's [BIP-32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki) key tree.

## Import

```ts
import { deriveEvmPrivateKey } from "@category-labs/mera";
```

## Usage

```ts
import {
  createSecp256k1SigningSession,
  deriveEvmPrivateKey,
  getEvmAddress,
  getPasskeyPrfOutput,
} from "@category-labs/mera";

const { prfOutput } = await getPasskeyPrfOutput({
  rpId: "account.example.com",
});
const privateKey = deriveEvmPrivateKey({ prfOutput, accountIndex: 0 });

const session = createSecp256k1SigningSession({ privateKey });
const address = getEvmAddress(session.publicKey);
```

## Parameters

`options` is a `DerivePrivateKeyOptions`.

### options.prfOutput

- Type: `Uint8Array`
- Required

PRF output from a passkey ceremony. Must be exactly 32 bytes, the entropy of a 24-word phrase.

### options.accountIndex

- Type: `number`
- Required

Account number, the last step of the path. An integer from 0 to 2³¹ − 1.

## Returns

```ts
type ReturnType = Uint8Array<ArrayBuffer>;
```

The 32-byte secp256k1 private key.

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `prfOutput` is not 32 bytes, or `accountIndex` is not an integer from 0 to 2³¹ − 1.

## Notes

The phrase uses the English wordlist, and its seed uses an empty passphrase. Wallet apps such as MetaMask derive EVM accounts from the same path, so importing the phrase into one shows the same accounts.

mera derives the key with `@scure/bip39` and `@scure/bip32`, as `HDKey.fromMasterSeed(mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist))).derive(path).privateKey`. The phrase exists as a JavaScript string, which cannot be [zeroed](/concepts/security-model/#zeroing), and `@scure/bip32` leaves the intermediate keys and chain codes unzeroed.

## See also

- [deriveSolanaPrivateKey](/reference/derive-solana-private-key/): the Solana counterpart.
- [createSecp256k1SigningSession](/reference/create-secp256k1-signing-session/): signs with the derived key.
- [Keys and accounts](/concepts/entropy-keys-and-accounts/): phrases, seeds, and derivation paths.
- [Create passkey accounts](/recipes/create-passkey-accounts/): numbered EVM and Solana accounts.
