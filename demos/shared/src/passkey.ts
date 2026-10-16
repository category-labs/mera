import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  type PasskeyCredentialMetadata,
} from "@category-labs/mera";

/** A ceremony's PRF output and the credential that produced it. */
type PasskeyPrf = {
  prfOutput: Uint8Array;
  credential: PasskeyCredentialMetadata;
};

const PASSKEY_TAB_CHANNEL = "mera-passkey";

/**
 * What the extension's passkey tab posts back to the side panel that opened
 * it. Both ends check the other's origin before trusting a message.
 */
type PasskeyTabMessage =
  | { channel: typeof PASSKEY_TAB_CHANNEL; kind: "prf"; material: PasskeyPrf }
  | { channel: typeof PASSKEY_TAB_CHANNEL; kind: "error"; message: string };

/**
 * The relying party and user for a new demo passkey. Every create adds a
 * passkey, so the display name carries the creation time to tell the entries
 * apart in the authenticator's picker.
 */
function newPasskeyOptions(
  rpId: string,
): Pick<createPasskeyWithPrfOutput.Options, "rp" | "user"> {
  return {
    rp: { id: rpId, name: "mera demo" },
    user: {
      name: "nad",
      displayName: `Account ${new Date().toLocaleString()}`,
    },
  };
}

async function createPasskeyPrf(rpId: string): Promise<PasskeyPrf> {
  const { prfOutput, credentialId, transports } =
    await createPasskeyWithPrfOutput(newPasskeyOptions(rpId));
  return { prfOutput, credential: { credentialId, transports } };
}

/**
 * Runs an assertion pinned to `credential`, or one that lets the platform
 * offer any passkey for `rpId` when it is omitted.
 */
async function getPasskeyPrf(
  rpId: string,
  credential?: PasskeyCredentialMetadata,
): Promise<PasskeyPrf> {
  const { prfOutput, credentialId } = await getPasskeyPrfOutput({
    rpId,
    credential,
  });
  return { prfOutput, credential: credential ?? { credentialId } };
}

export type { PasskeyPrf, PasskeyTabMessage };
export {
  createPasskeyPrf,
  getPasskeyPrf,
  newPasskeyOptions,
  PASSKEY_TAB_CHANNEL,
};
