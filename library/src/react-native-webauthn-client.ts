/**
 * @file Importing the Passkey platform API also imports React Native, which
 * does not work in tests. The client logic lives in a separate module so tests
 * can supply a stub.
 */

import { Passkey as platformApi } from "react-native-passkey";
import { createReactNativeWebAuthnClient } from "./react-native-webauthn-client-internal.js";
import type { WebAuthnClient } from "./webauthn.js";

const reactNativeWebAuthnClient: WebAuthnClient =
  createReactNativeWebAuthnClient(platformApi);

export { reactNativeWebAuthnClient };
