---
title: createSecretVault
description: Encrypts an arbitrary secret into a passkey-protected vault.
---

Encrypts an arbitrary secret into a passkey-protected vault. No ceremony runs here; the PRF output from an earlier ceremony does the cryptographic work.

An AES-256-GCM wrapping key is derived from the PRF output with fixed HKDF-SHA-256 info (`mera.v1.wrap.secret`), which separates it from any other key derived from the same output. The secret is encrypted under fixed additional authenticated data.

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

const vault = await createSecretVault({ credential, secret });
localStorage.setItem("vault", JSON.stringify(vault));
```

## Parameters

`options` is a `CreateSecretVaultOptions`.

### options.credential

- Type: `{ credentialId: string; transports?: readonly PasskeyCredentialTransport[]; prfSalt: Uint8Array; prfOutput: Uint8Array }`
- Required

The passkey credential plus the PRF salt and the PRF output it produced. The result of [createPasskeyWithPrfOutput](/reference/create-passkey-with-prf-output/) can be passed straight through. `credentialId` must be canonical unpadded base64url and non-empty; `prfSalt` and `prfOutput` must each be exactly 32 bytes.

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

**Use a fresh random salt per secret.** A vault is bound to its `prfOutput` only, never to the credential ID or salt. Secrets wrapped under one reused PRF output share a wrapping key, so their nonce/ciphertext pairs are interchangeable by anyone who can rewrite stored vault JSON. A fresh 32-byte `prfSalt` per secret gives each vault an unrelated PRF output and its own key.

The GCM nonce (12 bytes) is generated internally for each encryption, so a caller cannot accidentally reuse one.

Input byte buffers are copied before async cryptographic work starts; mutating them after the call does not change the vault being produced. Caller-owned buffers are not modified or zeroed by this function; the internal copies of the PRF output and secret are zeroed before it returns. Callers that are done with their own `prfOutput` and `secret` buffers should zero them.

## See also

- [getSecretVaultPrfOutput](/reference/get-secret-vault-prf-output/) and [unwrapSecretVault](/reference/unwrap-secret-vault/): the way back in.
- [Wrap a recovery phrase](/recipes/wrap-a-recovery-phrase/): the full flow with zeroing.
- [Security model](/concepts/security-model/#one-output-one-purpose): why salt reuse is the mistake to design out.
