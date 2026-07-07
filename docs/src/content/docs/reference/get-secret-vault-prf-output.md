---
title: getSecretVaultPrfOutput
description: Performs the WebAuthn assertion needed to unlock a secret vault.
---

Performs the WebAuthn assertion needed to unlock a secret vault. Runs one `navigator.credentials.get()` ceremony, which may show browser or authenticator UI.

Under the hood this reads the credential metadata and PRF salt out of a parsed vault and delegates to [getPasskeyPrfOutput](/reference/get-passkey-prf-output/), so the assertion is automatically pinned to the credential that wrapped the secret.

## Import

```ts
import { getSecretVaultPrfOutput } from "@category-labs/mera";
```

## Usage

```ts
import {
  getSecretVaultPrfOutput,
  parseSecretVault,
  unwrapSecretVault,
} from "@category-labs/mera";

const vault = parseSecretVault(localStorage.getItem("vault"));
const { prfOutput } = await getSecretVaultPrfOutput({
  rpId: "account.example.com",
  vault,
});
const secret = await unwrapSecretVault({ vault, prfOutput });
```

## Parameters

`options` is a `GetSecretVaultPrfOutputOptions`.

### options.rpId

- Type: `string`
- Required

Relying party ID for the WebAuthn assertion. Must match the rpId the passkey was created under.

### options.vault

- Type: `PasskeySecretVault`
- Required

A parsed secret vault. Run untrusted stored data through [parseSecretVault](/reference/parse-secret-vault/) first; this function trusts the vault's shape.

### options.timeout

- Type: `number`
- Optional; browser defaults apply when omitted

WebAuthn timeout in milliseconds.

## Returns

`Promise<PasskeyPrfResult>`: the selected `credentialId` and the 32-byte `prfOutput` for the vault's stored salt.

## Errors

- [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable): the authenticator did not return a usable 32-byte PRF output.
- [`INPUT_INVALID`](/reference/errors/#input_invalid): the vault's `prfSalt` is not canonical base64url or does not decode to 32 bytes, or its `credentialId` is empty or not canonical base64url. Vaults from `parseSecretVault` have already passed these checks.
- [`CRYPTO_UNAVAILABLE`](/reference/errors/#crypto_unavailable): Web Crypto is unavailable.
- [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed): WebAuthn is unavailable, cancelled, or returns an unexpected credential.

## Notes

The WebAuthn challenge is generated internally, and the raw assertion response is not returned.

## See also

- [unwrapSecretVault](/reference/unwrap-secret-vault/): the decryption step that follows.
- [Wrap a recovery phrase](/recipes/wrap-a-recovery-phrase/): the full unlock flow.
