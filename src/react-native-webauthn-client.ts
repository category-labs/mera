import { Passkey } from "react-native-passkey";
import { createReactNativeWebAuthnClient } from "./react-native-webauthn-client-internal.js";
import type { WebAuthnClient } from "./webauthn.js";

/**
 * A {@link WebAuthnClient} backed by react-native-passkey.
 *
 * Uses its platform-credential entry points so iOS does not offer a security
 * key, whose result would omit PRF output. Android uses Credential Manager as
 * usual.
 */
const reactNativeWebAuthnClient: WebAuthnClient =
  createReactNativeWebAuthnClient(Passkey);

export { reactNativeWebAuthnClient };
