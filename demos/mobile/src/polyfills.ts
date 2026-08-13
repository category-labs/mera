import { getRandomValues } from "expo-crypto";

// Hermes ships no CSPRNG, and mera's passkey functions need
// crypto.getRandomValues. Import this module before any application code.
if (typeof globalThis.crypto?.getRandomValues !== "function") {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { ...globalThis.crypto, getRandomValues },
  });
}
