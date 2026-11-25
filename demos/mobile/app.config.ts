import type { ExpoConfig } from "expo/config";

const webDemoHost = "mera.category.xyz";
// Expo types process.env values as any.
const configuredRpId: unknown = process.env.MERA_RP_ID;
const rpId = typeof configuredRpId === "string" ? configuredRpId : webDemoHost;

const applicationId = "xyz.category.mera.demo";

const config: ExpoConfig = {
  name: "mera demo",
  slug: "mera-demo-mobile",
  version: "1.0.0",
  ios: {
    bundleIdentifier: applicationId,
    associatedDomains: [`webcredentials:${rpId}`],
  },
  android: {
    package: applicationId,
  },
  plugins: [
    [
      "expo-secure-store",
      {
        faceIDPermission:
          "Allow mera demo to unlock the account this device already signed in to.",
      },
    ],
  ],
  extra: { rpId },
};

export default config;
