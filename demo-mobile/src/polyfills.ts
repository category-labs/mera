import { getRandomValues } from "expo-crypto";

// Hermes ships no Web Crypto. mera generates WebAuthn challenges and user
// handles with crypto.getRandomValues, so the CSPRNG has to exist before the
// first ceremony; expo-crypto forwards to the platform's. crypto.subtle stays
// absent, which only the secret-vault APIs need.
if (typeof globalThis.crypto?.getRandomValues !== "function") {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { ...globalThis.crypto, getRandomValues },
  });
}
