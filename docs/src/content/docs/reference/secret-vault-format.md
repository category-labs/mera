---
title: Secret vault format
description: The v1 PasskeySecretVault JSON contract, field by field.
---

A secret vault is a versioned JSON object containing one passkey-encrypted secret. Apps can store or transfer it unchanged. Only version 1 exists.

```json
{
  "version": 1,
  "credential": {
    "credentialId": "pQEuLYuJ9BF-Kd8ijY5oQw",
    "transports": ["internal", "hybrid"]
  },
  "prfSalt": "5iBEbmCBIF1MDVIGmirBg-XA0dcvNsSVUqiSCTuS_UM",
  "nonce": "9k8bYQxlIm-A9nQi",
  "ciphertext": "Zm9vYmFyYmF6cXV4…"
}
```

## Fields

### version

Always `1`. [parseSecretVault](/reference/parse-secret-vault/) rejects anything else, including future versions it does not understand.

### credential.credentialId

The passkey credential that unlocks this vault, as canonical unpadded base64url. Stored so the unlock assertion can pin itself to the right passkey instead of letting the browser offer every discoverable credential.

### credential.transports

Authenticator transports reported by the browser when the passkey was created. Optional; when present, they help the browser route the unlock assertion (to a security key, to a phone) without guessing.

### prfSalt

The PRF salt for this secret, 32 bytes as canonical unpadded base64url. The workflow functions generate it fresh and randomly per vault; the low-level [createSecretVault](/reference/create-secret-vault/) path accepts an app-supplied salt, which must be fresh per secret. Storing it lets a later ceremony reproduce the exact PRF output that keyed the encryption. The salt is not secret: without the passkey it yields nothing, because the PRF lives in the authenticator.

### nonce

The 12-byte AES-GCM nonce, base64url. Generated internally by [createSecretVault](/reference/create-secret-vault/) for each encryption.

### ciphertext

The AES-GCM ciphertext including its 16-byte authentication tag, base64url. The plaintext is the secret exactly as it was passed in; the library never interprets it.

## What is deliberately absent

The encryption key and the PRF output are never stored; both exist only transiently in memory. The rpId is also absent: the vault does not record which relying party it belongs to, and the unlock assertion supplies it.

The credential ID and salt are stored but not authenticated: the AES-GCM additional authenticated data is a fixed constant (`mera.v1.secret.aad` plus the version), so a vault is cryptographically bound to its PRF output only. This is why each secret needs a fresh salt: vaults that share a PRF output share an encryption key, and their nonce/ciphertext pairs become interchangeable to anyone who can rewrite stored JSON.

## Portability

The vault is plain JSON suitable for `localStorage`, a database, a file, or a sync service. Decryption requires the passkey ceremony and user verification.

## See also

- [createSecretVaultWithNewPasskey](/reference/create-secret-vault-with-new-passkey/) and [createSecretVaultWithExistingPasskey](/reference/create-secret-vault-with-existing-passkey/): workflow functions that produce this format.
- [decryptSecretVaultWithPasskey](/reference/decrypt-secret-vault-with-passkey/): the workflow function that performs the assertion and decryption.
- [createSecretVault](/reference/create-secret-vault/), [getSecretVaultPrfOutput](/reference/get-secret-vault-prf-output/), and [decryptSecretVault](/reference/decrypt-secret-vault/): low-level primitives for the same format.
- [parseSecretVault](/reference/parse-secret-vault/): the validation boundary for stored JSON.
- [Secret vaults](/concepts/secret-vaults/): where the vault fits.
