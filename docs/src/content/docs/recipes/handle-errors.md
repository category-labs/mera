---
title: Handle errors
description: Narrow MeraError, map codes to user-facing text, and know which codes mean retry.
---

Every failure the library signals is a `MeraError` with a stable `code`; the [errors reference](/reference/errors/) lists every code. The app-side work is narrowing unknown errors, choosing words people can act on, and knowing which codes deserve a retry button. The mapping below is adapted from the demo.

## Narrow first

```ts
import { isMeraError } from "@category-labs/mera";

function describeError(error: unknown): string {
  if (isMeraError(error)) {
    switch (error.code) {
      case "PASSKEY_OPERATION_FAILED":
        return "The passkey request was cancelled or failed.";
      case "PRF_UNAVAILABLE":
        return "This browser or authenticator doesn't support the WebAuthn PRF extension the app needs.";
      case "CRYPTO_UNAVAILABLE":
        return "This browser doesn't provide the Web Crypto APIs the app needs.";
      case "SESSION_LOCKED":
        return "The session is locked. Connect again.";
      case "DECRYPT_FAILED":
        return "Couldn't unlock the account with that passkey.";
      case "VAULT_FORMAT_INVALID":
        return "The stored account data is malformed.";
      case "INPUT_INVALID":
        return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}
```

Non-mera errors pass through untouched, so chain-library and network failures keep their own messages. The `switch` covers the whole `MeraErrorCode` union, so a future library version that adds a code becomes a TypeScript error here instead of a silent fall-through.

## What each code should trigger

**[PASSKEY_OPERATION_FAILED](/reference/errors/#passkey_operation_failed)** is the everyday one: the person dismissed the prompt, or WebAuthn itself failed. Offer a plain retry and move on. The underlying failure is attached as `error.cause` for logging.

**[PRF_UNAVAILABLE](/reference/errors/#prf_unavailable)** means the authenticator stack cannot do PRF. Point people at a combination that works, for example by linking [authenticator support](/concepts/authenticator-support/) from the error state. On a create flow the passkey may already exist by the time this throws, so a retry with a different authenticator leaves an orphan credential in the first one's passkey list; say so in the UI.

**[CRYPTO_UNAVAILABLE](/reference/errors/#crypto_unavailable)** almost always means the page is not in a secure context. Fail loudly during development and this never ships; no user action fixes it.

**[SESSION_LOCKED](/reference/errors/#session_locked)** is expected behavior after `lock()`, so route it to the reconnect flow rather than an error banner. One fresh ceremony builds a new session.

**[DECRYPT_FAILED](/reference/errors/#decrypt_failed)** on a vault means wrong key material or a tampered blob, and the two are indistinguishable by design. Since [getSecretVaultPrfOutput](/reference/get-secret-vault-prf-output/) pins the assertion to the vault's own credential, honest mismatches are rare. Avoid looping retries; surface the import-or-restore path instead.

**[INPUT_INVALID](/reference/errors/#input_invalid)** is a bug in calling code, a length or encoding constraint missed at a public boundary. Log it with the message; no user action fixes it.

**[VAULT_FORMAT_INVALID](/reference/errors/#vault_format_invalid)** means the stored vault JSON is corrupt or from an unsupported version. Rerunning ceremonies cannot help, because the failure happens before any ceremony; offer recovery through a fresh import ([Wrap a recovery phrase](/recipes/wrap-a-recovery-phrase/)).

## See also

- [Errors](/reference/errors/): the full contract, including what `MeraError` carries.
