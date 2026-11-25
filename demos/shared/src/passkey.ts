import type { PasskeyCredentialMetadata } from "@category-labs/mera";
import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  MeraError,
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
  rpId: string
): Pick<createPasskeyWithPrfOutput.Options, "rp" | "user"> {
  return {
    rp: { id: rpId, name: "mera demo" },
    user: {
      name: "nad",
      displayName: `Account ${new Date().toLocaleString()}`,
    },
  };
}

async function createPasskeyPrf(
  rpId: string,
  excludeCredentials?: readonly PasskeyCredentialMetadata[]
): Promise<PasskeyPrf> {
  const { prfOutput, credentialId, transports } =
    await createPasskeyWithPrfOutput({
      ...newPasskeyOptions(rpId),
      excludeCredentials,
    });
  return { prfOutput, credential: { credentialId, transports } };
}

/**
 * Runs an assertion pinned to `credential`, or one that lets the platform
 * offer any passkey for `rpId` when it is omitted. An unpinned assertion that
 * doesn't complete rethrows with a hint: browsers report a dismissed prompt, a
 * timeout, and no matching passkey alike, so the passkey may be on another
 * device.
 */
async function getPasskeyPrf(
  rpId: string,
  credential?: PasskeyCredentialMetadata
): Promise<PasskeyPrf> {
  try {
    const { prfOutput, credentialId } = await getPasskeyPrfOutput({
      rpId,
      credential,
    });
    return { prfOutput, credential: credential ?? { credentialId } };
  } catch (error) {
    if (
      credential === undefined &&
      error instanceof MeraError &&
      error.code === "PASSKEY_CANCELLED"
    ) {
      throw new Error(
        "Passkey sign-in didn't complete. Try again, or use a passkey from another device.",
        { cause: error }
      );
    }
    throw error;
  }
}

export type { PasskeyPrf, PasskeyTabMessage };
export {
  createPasskeyPrf,
  getPasskeyPrf,
  newPasskeyOptions,
  PASSKEY_TAB_CHANNEL,
};
