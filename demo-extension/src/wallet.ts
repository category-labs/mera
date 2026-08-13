import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { BaseError as ViemError } from "viem";
import { RP_ID } from "./config";
import { deriveEvmPrivateKey, mnemonicToSeed, prfOutputToMnemonic } from "./hd";

type Wallet = {
  address: `0x${string}`;
  credential: PasskeyCredentialMetadata;
  session: Secp256k1SigningSession;
  lock(): void;
};

const labelFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

type PrfMaterial = {
  prfOutput: Uint8Array;
  credential: PasskeyCredentialMetadata;
};

function credentialFromResult(
  credentialId: string,
  transports: PasskeyCredentialMetadata["transports"],
): PasskeyCredentialMetadata {
  return {
    credentialId,
    ...(transports === undefined ? {} : { transports }),
  };
}

function walletFromPrf(
  prfOutput: Uint8Array,
  credential: PasskeyCredentialMetadata,
): Wallet {
  let phrase: string;
  try {
    phrase = prfOutputToMnemonic(prfOutput);
  } finally {
    prfOutput.fill(0);
  }
  const seed = mnemonicToSeed(phrase);
  try {
    const privateKey = deriveEvmPrivateKey(seed, 0);
    let session: Secp256k1SigningSession;
    try {
      session = createSecp256k1SigningSession({ privateKey });
    } finally {
      privateKey.fill(0);
    }
    return {
      address: getEvmAddress(session.publicKey),
      credential,
      session,
      lock: () => session.end(),
    };
  } finally {
    seed.fill(0);
  }
}

async function requestCreatePrf(): Promise<PrfMaterial> {
  const result = await createPasskeyWithPrfOutput({
    rp: { id: RP_ID, name: "mera demo" },
    user: {
      name: "nad",
      displayName: `Account ${labelFormat.format(new Date())}`,
    },
  });
  return {
    prfOutput: result.prfOutput,
    credential: credentialFromResult(result.credentialId, result.transports),
  };
}

async function requestOpenPrf(
  credential?: PasskeyCredentialMetadata,
): Promise<PrfMaterial> {
  const result = await getPasskeyPrfOutput({
    rpId: RP_ID,
    ...(credential === undefined ? {} : { credential }),
  });
  return {
    prfOutput: result.prfOutput,
    credential: credentialFromResult(
      result.credentialId,
      credential?.transports,
    ),
  };
}

async function createWallet(): Promise<Wallet> {
  const { prfOutput, credential } = await requestCreatePrf();
  return walletFromPrf(prfOutput, credential);
}

async function openWallet(
  credential?: PasskeyCredentialMetadata,
): Promise<Wallet> {
  const { prfOutput, credential: next } = await requestOpenPrf(credential);
  return walletFromPrf(prfOutput, next);
}

async function revealPhrase(
  credential: PasskeyCredentialMetadata,
): Promise<string> {
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId: RP_ID,
    credential,
  });
  try {
    return prfOutputToMnemonic(prfOutput);
  } finally {
    prfOutput.fill(0);
  }
}

function describeError(error: unknown): string {
  if (isMeraError(error)) {
    if (error.code === "PRF_UNAVAILABLE") {
      return "This browser or authenticator doesn't support the WebAuthn PRF extension this demo needs.";
    }
    if (error.code === "SESSION_ENDED") {
      return "The session has ended. Connect again.";
    }
    if (error.code === "CRYPTO_UNAVAILABLE") {
      return "This browser doesn't provide the Web Crypto APIs this demo needs.";
    }
    if (error.code === "PASSKEY_OPERATION_FAILED") {
      return "The passkey request was cancelled or failed.";
    }
    return error.message;
  }
  if (error instanceof ViemError) return error.shortMessage;
  return error instanceof Error ? error.message : String(error);
}

export type { PrfMaterial, Wallet };
export { createWallet, describeError, openWallet, revealPhrase, walletFromPrf };
