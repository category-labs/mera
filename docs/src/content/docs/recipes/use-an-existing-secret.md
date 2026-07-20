---
title: Encrypt an existing secret with a passkey
description: Encrypt an existing secret into a passkey-protected vault and unlock it later.
---

A [secret vault](/concepts/secret-vaults/) encrypts one recovery phrase (the [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) word encoding of an account's root entropy), private key, or other byte string behind a passkey; mera never interprets it. The vault is the pattern for secrets that predate the passkey. This recipe validates a phrase, stores its vault, and decrypts it with explicit [zeroing](/concepts/security-model/#what-the-library-handles). It requires `@category-labs/mera` and `@scure/bip39` installed, and a place to keep vault JSON (`localStorage` here; a backend or sync service works the same).

The surrounding code is app-owned; mera provides the passkey ceremonies and vault functions.

## Validate the phrase

A real app reads the phrase from a form field. The library never interprets the secret, so validation is app code:

```ts
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const phrase =
  "legal winner thank year wave sausage worth useful legal winner thank yellow";
if (!validateMnemonic(phrase, wordlist)) {
  throw new Error("Not a valid recovery phrase.");
}
```

## Create and persist the vault

`createSecretVaultWithNewPasskey` generates a fresh 32-byte [salt](/concepts/passkeys-and-prf/#the-prf-extension), the PRF input that namespaces its output, creates the passkey, and encrypts the secret. The salt and credential metadata are stored in the returned vault. A separate salt for each vault avoids shared encryption keys and interchangeable nonce/ciphertext pairs ([one output, one purpose](/concepts/security-model/#one-output-one-purpose)).

```ts
import { createSecretVaultWithNewPasskey } from "@category-labs/mera";

const rpId = location.hostname;

const secret = new TextEncoder().encode(phrase);
try {
  const vault = await createSecretVaultWithNewPasskey({
    rp: { id: rpId, name: "Example" },
    user: { name: "account@example.com", displayName: "Example account" },
    secret,
  });
  localStorage.setItem("app.vault", JSON.stringify(vault));
} finally {
  secret.fill(0);
}
```

The function copies the secret before the passkey prompt and zeroes its internal secret and PRF output before it finishes, even when it fails. PRF output is the deterministic secret bytes the passkey returns through the [WebAuthn](https://www.w3.org/TR/webauthn-3/) PRF extension, and it keys the encryption; [Passkeys and PRF](/concepts/passkeys-and-prf/) explains the mechanism. The `finally` zeroes the caller-owned encoded phrase. A private key is encrypted the same way: pass its raw bytes as `secret` instead of encoded text. The [vault format](/reference/secret-vault-format/) stores everything needed for the later ceremony.

## Unlock

The unlock runs one ceremony, pinned automatically to the credential stored in the vault:

```ts
import {
  decryptSecretVaultWithPasskey,
  parseSecretVault,
} from "@category-labs/mera";

async function unlockPhrase(): Promise<string> {
  const raw = localStorage.getItem("app.vault");
  if (raw === null) throw new Error("No vault on this device yet.");

  const vault = parseSecretVault(raw);
  const secret = await decryptSecretVaultWithPasskey({ rpId, vault });
  try {
    return new TextDecoder().decode(secret);
  } finally {
    secret.fill(0);
  }
}
```

`parseSecretVault` is the boundary for the untrusted stored JSON. The decrypt function owns and zeroes the transient PRF output. The decrypted buffer is a fresh allocation, so the `finally` zeroes it after decoding.

## Derive signing sessions

The phrase is a standard BIP-39 mnemonic, so key derivation from here is the same derivation passkey accounts use: one seed, then per-index paths. [Create passkey accounts](/recipes/create-passkey-accounts/) has both curves; pass it `mnemonicToSeedSync(phrase)` instead of a PRF-derived seed and zero the seed after the sessions exist.

## Pitfalls

- **A second secret needs its own ceremony and vault.** [createSecretVaultWithExistingPasskey](/reference/create-secret-vault-with-existing-passkey/) generates the fresh salt and stores it in the new vault.
- **The phrase is a string** while it transits the encryption and unlock code, and strings cannot be zeroed ([security model](/concepts/security-model/#strings-cannot-be-zeroed)). Keep the lifetime short and never log it.
- **The vault JSON is the only ciphertext copy.** Losing the storage loses the account unless the person still holds the phrase elsewhere.
