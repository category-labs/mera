import { MeraError } from "@category-labs/mera";
import { BaseError as ViemError } from "viem";

/** Library and chain errors as one line of status text. */
function describeError(error: unknown): string {
  if (error instanceof MeraError) {
    switch (error.code) {
      case "PRF_UNAVAILABLE":
        return "This browser or authenticator doesn't support the WebAuthn PRF extension this demo needs.";
      case "DECRYPT_FAILED":
        return "Couldn't unlock the account with that passkey.";
      case "SESSION_ENDED":
        return "The session has ended. Connect again.";
      case "CRYPTO_UNAVAILABLE":
        return "This browser doesn't provide the Web Crypto APIs this demo needs.";
      case "PASSKEY_OPERATION_FAILED":
        return "The passkey request was cancelled or failed.";
      case "VAULT_FORMAT_INVALID":
        return "Stored vault is malformed.";
    }
  }
  // A viem error's `message` appends the request URL, body, and hex payload;
  // `shortMessage` is its one-line summary.
  if (error instanceof ViemError) return error.shortMessage;
  return error instanceof Error ? error.message : String(error);
}

export { describeError };
