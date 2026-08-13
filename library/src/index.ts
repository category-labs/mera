export { getEvmAddress } from "./chains/evm.js";
export { getSolanaAddress } from "./chains/solana.js";
export { createEd25519SigningSession } from "./ed25519.js";
export type { MeraErrorCode } from "./errors.js";
export { isMeraError, MeraError } from "./errors.js";
export { createPasskeyWithPrfOutput, getPasskeyPrfOutput } from "./passkey.js";
export { createSecp256k1SigningSession } from "./secp256k1.js";
export type {
  CreateSecretVaultWithExistingPasskeyOptions,
  CreateSecretVaultWithNewPasskeyOptions,
  DecryptSecretVaultWithPasskeyOptions,
} from "./secret.js";
export {
  createSecretVaultWithExistingPasskey,
  createSecretVaultWithNewPasskey,
  decryptSecretVaultWithPasskey,
  parseSecretVault,
} from "./secret.js";
export type {
  CreateSigningSessionOptions,
  Ed25519SigningSession,
  EvmAddress,
  PasskeyCredentialMetadata,
  PasskeyCredentialTransport,
  PasskeyRelyingParty,
  PasskeySecretVault,
  Secp256k1Signature,
  Secp256k1SigningSession,
  SolanaAddress,
} from "./types.js";
export type { WebAuthnClient } from "./webauthn.js";
