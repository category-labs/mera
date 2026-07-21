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

The passkey credential that unlocks this vault, as canonical unpadded [base64url](https://datatracker.ietf.org/doc/html/rfc4648#section-5). Stored so the unlock [assertion](/concepts/passkeys-and-prf/#ceremonies-and-prompts) can pin itself to the right passkey.

### credential.transports

Authenticator transports reported by the browser when the passkey was created. Optional; when present, they help the browser route the unlock assertion (to a security key, to a phone) without guessing.

### prfSalt

The PRF salt for this secret, 32 bytes as canonical unpadded base64url. The vault functions generate a fresh random salt per vault. Storing it lets a later ceremony reproduce the exact PRF output that keyed the encryption. The salt is not secret: without the passkey it yields nothing, because the PRF lives in the authenticator.

### nonce

The 12-byte [AES-GCM](/concepts/secret-vaults/#how-a-vault-works) nonce, base64url. Generated internally for each encryption.

### ciphertext

The AES-GCM ciphertext with its 16-byte authentication tag appended, base64url. Decryption checks the tag to detect tampering. The plaintext is the secret exactly as it was passed in.

## What is deliberately absent

The encryption key and the PRF output are never stored; both exist only transiently in memory. The rpId is also absent; the unlock assertion supplies it.

The credential ID and salt are stored but not authenticated: neither is supplied as AES-GCM additional authenticated data, so a vault is cryptographically bound to its PRF output only. This is why each secret needs a fresh salt: vaults that share a PRF output share an encryption key.

## See also

- [parseSecretVault](/reference/parse-secret-vault/): the validation boundary for stored JSON.
- [Secret vaults](/concepts/secret-vaults/): where the vault fits.
