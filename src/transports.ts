import { PasskeyAccountError, type PasskeyAccountErrorCode } from "./errors.js";

const AUTHENTICATOR_TRANSPORTS = new Set<string>([
  "ble",
  "hybrid",
  "internal",
  "nfc",
  "usb",
]);

function isAuthenticatorTransport(
  value: string,
): value is AuthenticatorTransport {
  return AUTHENTICATOR_TRANSPORTS.has(value);
}

/**
 * Keeps browser-reported transports that match the current WebAuthn type.
 *
 * `getTransports()` returns `string[]` so browsers can add names before
 * TypeScript does. Unknown strings are omitted because transports are only
 * hints for future assertions.
 *
 * @internal
 */
function filterKnownAuthenticatorTransports(
  transports: string[] | undefined,
): AuthenticatorTransport[] | undefined {
  if (transports === undefined) {
    return undefined;
  }

  const knownTransports = transports.filter(isAuthenticatorTransport);
  return knownTransports.length > 0 ? knownTransports : undefined;
}

/**
 * Reads transport metadata from a public string or JSON boundary.
 *
 * @internal
 */
function readAuthenticatorTransports(
  value: unknown,
  path: string,
  code: PasskeyAccountErrorCode,
): AuthenticatorTransport[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new PasskeyAccountError(
      code,
      `${path} must be an array of known WebAuthn transport strings or omitted`,
    );
  }

  const transports: AuthenticatorTransport[] = [];
  for (const transport of value) {
    if (typeof transport !== "string" || !isAuthenticatorTransport(transport)) {
      throw new PasskeyAccountError(
        code,
        `${path} must be an array of known WebAuthn transport strings or omitted`,
      );
    }
    transports.push(transport);
  }

  return transports;
}

export { filterKnownAuthenticatorTransports, readAuthenticatorTransports };
