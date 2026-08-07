import type { ExpoConfig } from "expo/config";

/**
 * The host the web demo runs on. WebAuthn binds every passkey to it and mera
 * derives accounts from that binding, so this one value decides which passkeys
 * the app can use and which addresses it reaches. Set MERA_RP_ID to point the
 * app at another deployment.
 */
const rpId = process.env.MERA_RP_ID ?? "mera-demo.up.railway.app";

/** The demo network the web app trades on. State is wiped on every restart. */
const evmRpcUrl =
  process.env.MERA_EVM_RPC_URL ??
  "https://evm-network-production.up.railway.app";

// Both platforms bind an app to a relying party by application identifier, so
// this value also appears in the association files `rpId` serves.
const applicationId = "xyz.category.mera.demo";

const config: ExpoConfig = {
  name: "Mera Demo",
  slug: "mera-demo-mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: applicationId,
    supportsTablet: true,
    // Lets AuthenticationServices offer the passkeys created for this host.
    associatedDomains: [`webcredentials:${rpId}`],
  },
  android: {
    package: applicationId,
    adaptiveIcon: {
      backgroundColor: "#000000",
      foregroundImage: "./assets/android-icon-foreground.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
  },
  plugins: [
    [
      "expo-secure-store",
      {
        faceIDPermission:
          "Allow Mera Demo to unlock the account this device already signed in to.",
      },
    ],
  ],
  // Read back at runtime through expo-constants, so the ceremony and the
  // associated domain cannot drift apart.
  extra: { evmRpcUrl, rpId },
};

export default config;
