import type { ExpoConfig } from "expo/config";

/** The WebAuthn relying party. MERA_RP_ID selects another deployment. */
const rpId = process.env.MERA_RP_ID ?? "mera-demo.up.railway.app";

/** The demo network the web app trades on. State is wiped on every restart. */
const evmRpcUrl =
  process.env.MERA_EVM_RPC_URL ??
  "https://evm-network-production.up.railway.app";

// The association files served by rpId contain this identifier.
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
  // Keeps the runtime ceremony aligned with the associated domain.
  extra: { evmRpcUrl, rpId },
};

export default config;
