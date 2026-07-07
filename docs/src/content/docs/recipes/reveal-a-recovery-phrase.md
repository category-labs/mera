---
title: Reveal a recovery phrase
description: Export the phrase behind a fresh passkey ceremony, in both modes.
---

Recovery export is its own flow, run at reveal time behind a fresh ceremony. The app holds no phrase and no entropy between reveals; the user-verification prompt is what gates the export, every time. That framing comes from the library's security guidance and it is worth keeping even when caching would be convenient.

Prerequisites: a working derived setup ([Derive accounts from one passkey](/recipes/derive-accounts/)) or a stored vault ([Wrap a recovery phrase](/recipes/wrap-a-recovery-phrase/)).

## Derived accounts

Rerun the PRF assertion and map the output through the same BIP-39 step the account derivation uses. The phrase that comes out equals the one the accounts were derived from, because both paths map the same PRF output through `entropyToMnemonic`.

```ts
import {
  getDeterministicPrfSaltV1,
  getPasskeyPrfOutput,
} from "@category-labs/mera";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

async function revealDerivedPhrase(rpId: string): Promise<string> {
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId,
    prfSalt: getDeterministicPrfSaltV1(),
  });
  try {
    return entropyToMnemonic(prfOutput, wordlist);
  } finally {
    prfOutput.fill(0);
  }
}
```

Pin the stored credential in the `getPasskeyPrfOutput` call when the app has one; the sign-in section of the derive recipe shows the record to pass.

## Wrapped accounts

The unlock flow from [Wrap a recovery phrase](/recipes/wrap-a-recovery-phrase/#unlock) already ends with the phrase; reveal is that same `unlockPhrase()` call surfaced in an export UI. The vault ceremony pins itself to the right credential, and the PRF output and decrypted bytes are zeroed on the way out.

## Handling the revealed string

Both paths return a JavaScript string, and a string cannot be zeroed in place. What remains is lifecycle discipline:

- Render the phrase as late as possible and drop the reference as soon as the UI closes.
- Never log it, never put it in state that outlives the reveal screen, never send it anywhere.
- Treat the reveal screen itself as the sensitive asset: the biometric gate in front of it is the real protection.

The [security model](/concepts/security-model/#strings-cannot-be-zeroed) covers why this is the best available position.

## See also

- [getPasskeyPrfOutput](/reference/get-passkey-prf-output/)
- [Derived and wrapped modes](/concepts/derived-and-wrapped/): why export paths matter before a passkey is lost, never after.
