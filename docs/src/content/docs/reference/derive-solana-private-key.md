---
title: deriveSolanaPrivateKey
description: Derives the private key of a Solana account from a PRF output.
---

Derives the Ed25519 private key of a Solana account from a [PRF output](/concepts/passkeys-and-prf/). The PRF output is the entropy of a [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) phrase, and the key sits at the path `m/44'/501'/{accountIndex}'/0'` of the phrase's [SLIP-0010](https://github.com/satoshilabs/slips/blob/master/slip-0010.md) key tree.

## Import

```ts
import { deriveSolanaPrivateKey } from "@category-labs/mera";
```

## Usage

```ts
import {
  createEd25519SigningSession,
  deriveSolanaPrivateKey,
  getPasskeyPrfOutput,
  getSolanaAddress,
} from "@category-labs/mera";

const { prfOutput } = await getPasskeyPrfOutput({
  rpId: "account.example.com",
});
const privateKey = deriveSolanaPrivateKey({ prfOutput, accountIndex: 0 });

const session = createEd25519SigningSession({ privateKey });
const address = getSolanaAddress(session.publicKey);
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

Account number, the third step of the path. An integer from 0 to 2³¹ − 1.

## Returns

```ts
type ReturnType = Uint8Array<ArrayBuffer>;
```

The 32-byte Ed25519 private key, the seed that [createEd25519SigningSession](/reference/create-ed25519-signing-session/) takes.

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `prfOutput` is not 32 bytes, or `accountIndex` is not an integer from 0 to 2³¹ − 1.

## Notes

The phrase uses the English wordlist, and its seed uses an empty passphrase. Wallet apps such as Phantom derive Solana accounts from the same path, so importing the phrase into one shows the same accounts.

mera computes the seed with `@scure/bip39`, as `mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist))`, so the phrase exists as a JavaScript string, which cannot be [zeroed](/concepts/security-model/#zeroing).

## See also

- [deriveEvmPrivateKey](/reference/derive-evm-private-key/): the EVM counterpart.
- [createEd25519SigningSession](/reference/create-ed25519-signing-session/): signs with the derived key.
- [Keys and accounts](/concepts/entropy-keys-and-accounts/): phrases, seeds, and derivation paths.
- [Create passkey accounts](/recipes/create-passkey-accounts/): numbered EVM and Solana accounts.
