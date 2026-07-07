---
title: Wrap a recovery phrase
description: Encrypt an existing recovery phrase into a passkey-protected vault and unlock it later.
---

Wrapped mode imports an account that already exists: the recovery phrase becomes the secret inside a passkey-encrypted vault, and later ceremonies open it again. This recipe validates a phrase, wraps it, persists the vault, and unlocks it with careful zeroing throughout. The code is the app-side pattern from the demo.

Prerequisites: `@category-labs/mera` and `@scure/bip39` installed, and a place to keep vault JSON (`localStorage` here; a backend or sync service works the same).

## Validate the phrase

The library never interprets the secret, so phrase validation is app code:

```ts
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const phrase = input.trim();
if (!validateMnemonic(phrase, wordlist)) {
  throw new Error("Not a valid recovery phrase.");
}
```

## Create the passkey with a fresh random salt

Wrapped flows never use the deterministic salt. Each secret gets 32 fresh random bytes, because a vault is bound to its PRF output only: secrets wrapped under one reused output would share a wrapping key, and their nonce/ciphertext pairs would become interchangeable to anyone who can rewrite the stored JSON. [createSecretVault](/reference/create-secret-vault/) documents the details.

```ts
import { createPasskeyWithPrfOutput } from "@category-labs/mera";

const rpId = location.hostname;

const credential = await createPasskeyWithPrfOutput({
  rp: { id: rpId, name: "Example" },
  user: { name: "account@example.com", displayName: "Example account" },
  prfSalt: crypto.getRandomValues(new Uint8Array(32)),
});
```

## Wrap and persist

```ts
import { createSecretVault } from "@category-labs/mera";

const secret = new TextEncoder().encode(phrase);
try {
  const vault = await createSecretVault({ credential, secret });
  localStorage.setItem("app.vault", JSON.stringify(vault));
} finally {
  secret.fill(0);
  credential.prfOutput.fill(0);
}
```

The `finally` zeroes the encoded phrase and the PRF output whether or not wrapping succeeded. The vault stores the salt and credential metadata itself ([format](/reference/secret-vault-format/)), so nothing else needs saving.

## Unlock

One ceremony, pinned automatically to the credential stored in the vault:

```ts
import {
  getSecretVaultPrfOutput,
  parseSecretVault,
  unwrapSecretVault,
} from "@category-labs/mera";

async function unlockPhrase(): Promise<string> {
  const raw = localStorage.getItem("app.vault");
  if (raw === null) throw new Error("No vault on this device yet.");

  const vault = parseSecretVault(raw);
  const { prfOutput } = await getSecretVaultPrfOutput({ rpId, vault });
  try {
    const secret = await unwrapSecretVault({ vault, prfOutput });
    try {
      return new TextDecoder().decode(secret);
    } finally {
      secret.fill(0);
    }
  } finally {
    prfOutput.fill(0);
  }
}
```

`parseSecretVault` is the boundary for the untrusted stored JSON; everything after it works with validated data. The decrypted buffer is a fresh allocation the library never zeroes; the inner `finally` does.

## Derive signing sessions

The phrase is a standard BIP-39 mnemonic, so key derivation from here is exactly the derived-mode math: master seed, then per-index paths. [Derive accounts from one passkey](/recipes/derive-accounts/) has both curves; feed it `mnemonicToSeedSync(phrase)` instead of a PRF-derived seed and zero the seed after the sessions exist.

## Pitfalls

- **One secret, one vault, one salt.** A second secret behind the same passkey needs its own fresh salt and a new [getPasskeyPrfOutput](/reference/get-passkey-prf-output/) ceremony against it, then its own vault.
- **The phrase is a string** while it transits the wrap and unlock code, and strings cannot be zeroed. Keep the lifetime short and never log it; the [security model](/concepts/security-model/#strings-cannot-be-zeroed) explains the limits.
- **Vault gone means secret gone.** The vault JSON is the only ciphertext copy. Losing the storage loses the account unless the person still holds the phrase elsewhere.
