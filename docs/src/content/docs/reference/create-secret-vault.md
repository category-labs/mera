---
title: createSecretVault
description: Encrypts an arbitrary secret into a passkey-protected vault.
---

Encrypts an arbitrary secret into a passkey-protected vault from explicit credential, salt, and PRF material. This is the low-level encryption primitive; secret-vault workflow functions own the ceremony and random salt.

An AES-256-GCM encryption key is derived from the PRF output with fixed HKDF-SHA-256 info (`mera.v1.encrypt.secret`), which separates it from any other key derived from the same output. The secret is encrypted under fixed additional authenticated data.

## Import

```ts
import { createSecretVault } from "@category-labs/mera";
```

## Usage

```ts
import {
  createPasskeyWithPrfOutput,
  createSecretVault,
} from "@category-labs/mera";

const prfSalt = crypto.getRandomValues(new Uint8Array(32)); // fresh per secret

const credential = await createPasskeyWithPrfOutput({
  rp: { id: "account.example.com", name: "Example" },
  user: { name: "account@example.com", displayName: "Example account" },
  prfSalt,
});

const secret = new TextEncoder().encode("the secret to protect");
try {
  const vault = await createSecretVault({ credential, secret });
  localStorage.setItem("vault", JSON.stringify(vault));
} finally {
  secret.fill(0);
  credential.prfOutput.fill(0);
}
```

## Parameters

`options` is a `CreateSecretVaultOptions`.

### options.credential

- Type: `{ credentialId: string; transports?: readonly PasskeyCredentialTransport[]; prfSalt: Uint8Array; prfOutput: Uint8Array }`
- Required

The passkey credential plus the PRF salt and the PRF output it produced. A [createPasskeyWithPrfOutput](/reference/create-passkey-with-prf-output/) result evaluated with an explicit fresh salt can be passed straight through. `credentialId` must be canonical unpadded base64url and non-empty; `prfSalt` and `prfOutput` must each be exactly 32 bytes.

### options.secret

- Type: `Uint8Array`
- Required

Secret bytes to encrypt. Any non-empty length; the library does not interpret them.

## Returns

`Promise<PasskeySecretVault>`: a JSON-safe object holding the credential metadata, the base64url-encoded salt, nonce, and ciphertext. The [secret vault format](/reference/secret-vault-format/) page documents every field.

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): the credential ID is empty or not canonical base64url, the PRF salt or output is not 32 bytes, or `secret` is empty.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): Web Crypto is unavailable.

## Notes

A vault is bound to its `prfOutput` only, never to the credential ID or salt: secrets encrypted using one reused PRF output share an encryption key, so their nonce/ciphertext pairs are interchangeable by anyone who can rewrite stored vault JSON. A fresh random salt per secret produces unrelated PRF outputs and distinct keys.

The GCM nonce (12 bytes) is generated internally for each encryption, so a caller cannot accidentally reuse one.

Input byte buffers are copied before async cryptographic work starts; mutating them after the call does not change the vault being produced. The internal copies of the PRF output and secret are zeroed before it returns, so the caller's `prfOutput` and `secret` buffers are the only copies left in memory.

## See also

- [createSecretVaultWithNewPasskey](/reference/create-secret-vault-with-new-passkey/): create a passkey and vault in one workflow.
- [createSecretVaultWithExistingPasskey](/reference/create-secret-vault-with-existing-passkey/): create a vault with an existing passkey.
- [getSecretVaultPrfOutput](/reference/get-secret-vault-prf-output/) and [decryptSecretVault](/reference/decrypt-secret-vault/): the [assertion](/concepts/passkeys-and-prf/#ceremonies-and-prompts) and decryption that recover the secret.
- [Use an existing secret](/recipes/use-an-existing-secret/): the full flow with zeroing.
- [Security model](/concepts/security-model/): why PRF outputs must not be reused across purposes.
