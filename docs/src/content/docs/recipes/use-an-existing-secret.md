---
title: Encrypt an existing secret with a passkey
description: Encrypt an existing secret into a passkey-protected vault and unlock it later.
---

A [secret vault](/concepts/secret-vaults/) encrypts a [recovery phrase](/concepts/entropy-keys-and-accounts/#seed-phrases), private key, or other byte string behind a passkey. This recipe encrypts a phrase and unlocks it later.

Prerequisites:

- `@category-labs/mera` installed.
- A place to keep vault JSON (`localStorage` here; a backend or sync service works the same).

## Create and persist the vault

`createSecretVaultWithNewPasskey` generates a fresh 32-byte [salt](/concepts/passkeys-and-prf/#the-prf-extension) per vault, creates the passkey, and encrypts the secret. The salt and credential metadata are stored in the returned vault ([vault format](/reference/secret-vault-format/)).

```ts
import { createSecretVaultWithNewPasskey } from "@category-labs/mera";

const rpId = location.hostname;

const phrase =
  "legal winner thank year wave sausage worth useful legal winner thank yellow";
const secret = new TextEncoder().encode(phrase);

const vault = await createSecretVaultWithNewPasskey({
  rp: { id: rpId, name: "Example" },
  user: { name: "account@example.com", displayName: "Example account" },
  secret,
});
localStorage.setItem("app.vault", JSON.stringify(vault));
```

A private key is encrypted the same way: pass its raw bytes as `secret` instead of encoded text.

## Unlock

The unlock runs one ceremony, pinned automatically to the credential stored in the vault:

```ts
const rpId = "account.example.com";

// ---cut---
import {
  decryptSecretVaultWithPasskey,
  parseSecretVault,
} from "@category-labs/mera";

async function unlockPhrase(): Promise<string> {
  const raw = localStorage.getItem("app.vault");
  if (raw === null) throw new Error("No vault on this device yet.");

  const vault = parseSecretVault(raw);
  const secret = await decryptSecretVaultWithPasskey({ rpId, vault });
  return new TextDecoder().decode(secret);
}
```

`parseSecretVault` is the boundary for the untrusted stored JSON.

## See also

- [Secret vaults](/concepts/secret-vaults/): how a vault works and when to use one.
- [createSecretVaultWithExistingPasskey](/reference/create-secret-vault-with-existing-passkey/): encrypt another secret with the same passkey.
- [Secret vault format](/reference/secret-vault-format/): the stored JSON, field by field.

