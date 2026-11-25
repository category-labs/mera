import Constants from "expo-constants";

const configuredRpId: unknown = Constants.expoConfig?.extra?.rpId;

if (typeof configuredRpId !== "string") {
  throw new Error("app.config.ts supplied no rpId");
}

const rpId: string = configuredRpId;

export { rpId };
