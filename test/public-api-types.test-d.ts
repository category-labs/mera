import type {
  CreateSecretVaultWithExistingPasskeyOptions,
  CreateSecretVaultWithNewPasskeyOptions,
  CreateSigningSessionOptions,
  createEd25519SigningSession,
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  createSecretVaultWithExistingPasskey,
  createSecretVaultWithNewPasskey,
  DecryptSecretVaultWithPasskeyOptions,
  decryptSecretVaultWithPasskey,
  getPasskeyPrfOutput,
  WebAuthnClient,
} from "../dist/index.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

type Expect<Value extends true> = Value;

type PublicFunctionOptions = [
  Expect<
    Equal<
      Parameters<typeof createPasskeyWithPrfOutput>[0],
      createPasskeyWithPrfOutput.Options
    >
  >,
  Expect<
    Equal<
      Parameters<typeof getPasskeyPrfOutput>[0],
      getPasskeyPrfOutput.Options
    >
  >,
  Expect<
    Equal<
      Parameters<typeof createSecretVaultWithNewPasskey>[0],
      CreateSecretVaultWithNewPasskeyOptions
    >
  >,
  Expect<
    Equal<
      Parameters<typeof createSecretVaultWithExistingPasskey>[0],
      CreateSecretVaultWithExistingPasskeyOptions
    >
  >,
  Expect<
    Equal<
      Parameters<typeof decryptSecretVaultWithPasskey>[0],
      DecryptSecretVaultWithPasskeyOptions
    >
  >,
  Expect<
    Equal<
      Parameters<typeof createSecp256k1SigningSession>[0],
      CreateSigningSessionOptions
    >
  >,
  Expect<
    Equal<
      Parameters<typeof createEd25519SigningSession>[0],
      CreateSigningSessionOptions
    >
  >,
];

type PublicFunctionResults = [
  Expect<
    Equal<
      Awaited<ReturnType<typeof createPasskeyWithPrfOutput>>,
      createPasskeyWithPrfOutput.Result
    >
  >,
  Expect<
    Equal<
      Awaited<ReturnType<typeof getPasskeyPrfOutput>>,
      getPasskeyPrfOutput.Result
    >
  >,
];

type NoSingleMemberNamespaces = [
  // @ts-expect-error A lone options type stays standalone.
  createSecretVaultWithNewPasskey.Options,
  // @ts-expect-error A lone options type stays standalone.
  createSecretVaultWithExistingPasskey.Options,
  // @ts-expect-error A lone options type stays standalone.
  decryptSecretVaultWithPasskey.Options,
  // @ts-expect-error The two signing functions share one standalone options type.
  createSecp256k1SigningSession.Options,
  // @ts-expect-error The two signing functions share one standalone options type.
  createEd25519SigningSession.Options,
];

type WebAuthnClientTypes = [
  Expect<
    Equal<
      Parameters<WebAuthnClient["createCredential"]>[0],
      WebAuthnClient.CreateCredentialRequest
    >
  >,
  Expect<
    Equal<
      Awaited<ReturnType<WebAuthnClient["createCredential"]>>,
      WebAuthnClient.CreateCredentialResult
    >
  >,
  Expect<
    Equal<
      Parameters<WebAuthnClient["getCredential"]>[0],
      WebAuthnClient.GetCredentialRequest
    >
  >,
  Expect<
    Equal<
      Awaited<ReturnType<WebAuthnClient["getCredential"]>>,
      WebAuthnClient.GetCredentialResult
    >
  >,
];

type RemovedRootAliases = [
  // @ts-expect-error The options type now belongs to the function namespace.
  import("../dist/index.js").CreatePasskeyWithPrfOutputOptions,
  // @ts-expect-error The result type now belongs to the function namespace.
  import("../dist/index.js").CreatePasskeyWithPrfOutputResult,
  // @ts-expect-error The options type now belongs to the function namespace.
  import("../dist/index.js").GetPasskeyPrfOutputOptions,
  // @ts-expect-error The result type now belongs to the function namespace.
  import("../dist/index.js").PasskeyPrfResult,
  // @ts-expect-error The request type now belongs to WebAuthnClient.
  import("../dist/index.js").WebAuthnCreateCredentialRequest,
  // @ts-expect-error The result type now belongs to WebAuthnClient.
  import("../dist/index.js").WebAuthnCreateCredentialResult,
  // @ts-expect-error The request type now belongs to WebAuthnClient.
  import("../dist/index.js").WebAuthnGetCredentialRequest,
  // @ts-expect-error The result type now belongs to WebAuthnClient.
  import("../dist/index.js").WebAuthnGetCredentialResult,
  // @ts-expect-error The credential type now belongs to WebAuthnClient.
  import("../dist/index.js").WebAuthnAllowCredential,
];

export type {
  NoSingleMemberNamespaces,
  PublicFunctionOptions,
  PublicFunctionResults,
  RemovedRootAliases,
  WebAuthnClientTypes,
};
