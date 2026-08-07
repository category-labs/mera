import Constants from "expo-constants";

/**
 * Reads what app.config.ts resolved at build time. `extra` crosses the config
 * boundary as untyped JSON, and the relying party ID decides which passkeys the
 * app can reach, so both fields are checked rather than assumed.
 */
function readConfig(): { evmRpcUrl: string; rpId: string } {
  const extra = Constants.expoConfig?.extra;
  const evmRpcUrl = extra?.evmRpcUrl;
  const rpId = extra?.rpId;

  if (typeof evmRpcUrl !== "string" || typeof rpId !== "string") {
    throw new Error("app.config.ts supplied no rpId or evmRpcUrl");
  }

  return { evmRpcUrl, rpId };
}

const { evmRpcUrl, rpId } = readConfig();

export { evmRpcUrl, rpId };
