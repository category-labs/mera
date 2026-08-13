import { expect, test } from "@playwright/test";
import type {
  PasskeyCredentialTransport,
  PasskeySecretVault,
} from "../dist/index.js";
import {
  createSecretVault,
  createSecretVaultWithExistingPasskey,
  createSecretVaultWithNewPasskey,
  decryptSecretVault,
  decryptSecretVaultWithPasskey,
  parseSecretVault,
} from "../dist/secret.js";
import type { WebAuthnClient } from "../dist/webauthn.js";
import {
  CREDENTIAL_ID_BASE64URL,
  CREDENTIAL_ID_BYTES,
  DEFAULT_PRF_SALT,
  expectError,
  readEvaluatedPrfSalt,
  stubPublicKeyCredential,
  withCountedRandomness,
  withStubbedGlobal,
} from "./helpers.js";

const PRF_OUTPUT = new Uint8Array(32).fill(7);
const PRF_SALT = new Uint8Array(32).fill(9);
// A real 12-word BIP-39 phrase stands in for an opaque secret; the library
// neither knows nor cares that these bytes are a mnemonic.
const SECRET = new TextEncoder().encode(
  "legal winner thank year wave sausage worth useful legal winner thank yellow",
);

async function createTestVault(
  secret: Uint8Array<ArrayBuffer> = SECRET,
): Promise<PasskeySecretVault> {
  return createSecretVault({
    credential: {
      credentialId: CREDENTIAL_ID_BASE64URL,
      transports: ["internal"],
      prfSalt: PRF_SALT,
      prfOutput: PRF_OUTPUT,
    },
    secret,
  });
}

test("createSecretVault draws one 12-byte nonce from crypto.getRandomValues", async () => {
  const { calls, bytesDrawn } = await withCountedRandomness(createTestVault);

  expect(calls).toBe(1);
  expect(bytesDrawn).toBe(12);
});

test("creates a secret vault and decrypts the exact bytes", async () => {
  const vault = await createTestVault();

  expect(Object.keys(vault).sort()).toEqual([
    "ciphertext",
    "credential",
    "nonce",
    "prfSalt",
    "version",
  ]);
  await expect(
    decryptSecretVault({ vault, prfOutput: PRF_OUTPUT }),
  ).resolves.toEqual(SECRET);
});

test("secret-vault creation rejects an empty secret before prompting", async () => {
  let passkeyRequestCount = 0;
  const navigator = {
    credentials: {
      async create() {
        passkeyRequestCount += 1;
        throw new Error("creation must not start");
      },
      async get() {
        passkeyRequestCount += 1;
        throw new Error("passkey request must not start");
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    await expect(
      createSecretVaultWithNewPasskey({
        rp: { id: "example.com", name: "Mera Test" },
        user: { name: "nad", displayName: "nad" },
        secret: new Uint8Array(0),
      }),
    ).rejects.toMatchObject({ code: "INPUT_INVALID" });

    await expect(
      createSecretVaultWithExistingPasskey({
        rpId: "example.com",
        secret: new Uint8Array(0),
      }),
    ).rejects.toMatchObject({ code: "INPUT_INVALID" });
  });

  expect(passkeyRequestCount).toBe(0);
});

test("secret-vault creation keeps PRF errors and does not change input secrets", async () => {
  const newPasskeySecret = new Uint8Array(SECRET);
  const existingPasskeySecret = new Uint8Array(SECRET);
  const navigator = {
    credentials: {
      async create() {
        return stubPublicKeyCredential({ prf: { enabled: false } });
      },
      async get() {
        return stubPublicKeyCredential({ prf: {} });
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    await expect(
      createSecretVaultWithNewPasskey({
        rp: { id: "example.com", name: "Mera Test" },
        user: { name: "nad", displayName: "nad" },
        secret: newPasskeySecret,
      }),
    ).rejects.toMatchObject({ code: "PRF_UNAVAILABLE" });

    await expect(
      createSecretVaultWithExistingPasskey({
        rpId: "example.com",
        secret: existingPasskeySecret,
      }),
    ).rejects.toMatchObject({ code: "PRF_UNAVAILABLE" });
  });

  expect(newPasskeySecret).toEqual(SECRET);
  expect(existingPasskeySecret).toEqual(SECRET);
});

test("createSecretVaultWithNewPasskey uses a fresh salt and copies the secret", async () => {
  let releaseCreation: (() => void) | undefined;
  const creationGate = new Promise<void>((resolve) => {
    releaseCreation = resolve;
  });
  let evaluatedSalt: Uint8Array<ArrayBuffer> | undefined;

  const navigator = {
    credentials: {
      async create({ publicKey }: CredentialCreationOptions) {
        evaluatedSalt = readEvaluatedPrfSalt(publicKey);
        await creationGate;
        return stubPublicKeyCredential({
          prf: {
            enabled: true,
            results: { first: evaluatedSalt?.buffer },
          },
          transports: ["internal"],
        });
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    const secret = new Uint8Array(SECRET);
    const pending = createSecretVaultWithNewPasskey({
      rp: { id: "example.com", name: "Mera Test" },
      user: { name: "nad", displayName: "nad" },
      secret,
    });

    secret.fill(0);
    releaseCreation?.();

    const vault = await pending;
    if (evaluatedSalt === undefined) {
      throw new Error("expected a PRF salt");
    }

    expect(vault.credential).toEqual({
      credentialId: CREDENTIAL_ID_BASE64URL,
      transports: ["internal"],
    });
    expect(vault.prfSalt).not.toBe(
      Buffer.from(DEFAULT_PRF_SALT).toString("base64url"),
    );
    await expect(
      decryptSecretVault({ vault, prfOutput: evaluatedSalt }),
    ).resolves.toEqual(SECRET);
  });
});

test("createSecretVaultWithExistingPasskey copies inputs and keeps transports", async () => {
  let releaseRequest: (() => void) | undefined;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  let evaluatedSalt: Uint8Array<ArrayBuffer> | undefined;

  const navigator = {
    credentials: {
      async get({ publicKey }: CredentialRequestOptions) {
        evaluatedSalt = readEvaluatedPrfSalt(publicKey);
        await requestGate;
        return stubPublicKeyCredential({
          prf: { results: { first: evaluatedSalt?.buffer } },
        });
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    const transports: PasskeyCredentialTransport[] = ["usb"];
    const credential = { credentialId: CREDENTIAL_ID_BASE64URL, transports };
    const secret = new Uint8Array(SECRET);
    const pending = createSecretVaultWithExistingPasskey({
      rpId: "example.com",
      credential,
      secret,
    });

    credential.credentialId = "BQYHCA";
    transports[0] = "nfc";
    secret.fill(0);
    releaseRequest?.();

    const vault = await pending;
    if (evaluatedSalt === undefined) {
      throw new Error("expected a PRF salt");
    }

    expect(vault.credential).toEqual({
      credentialId: CREDENTIAL_ID_BASE64URL,
      transports: ["usb"],
    });
    await expect(
      decryptSecretVault({ vault, prfOutput: evaluatedSalt }),
    ).resolves.toEqual(SECRET);
  });
});

test("decryptSecretVault fails with the wrong PRF output", async () => {
  const vault = await createTestVault();

  await expect(
    decryptSecretVault({ vault, prfOutput: new Uint8Array(32).fill(1) }),
  ).rejects.toMatchObject({ code: "DECRYPT_FAILED" });
});

test("decryptSecretVaultWithPasskey rejects a malformed vault without prompting", async () => {
  const vault = await createTestVault();
  let asserted = false;
  const navigator = {
    credentials: {
      async get() {
        asserted = true;
        throw new Error("passkey request must not start");
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    await expect(
      decryptSecretVaultWithPasskey({
        rpId: "example.com",
        vault: { ...vault, ciphertext: "!!!!" },
      }),
    ).rejects.toMatchObject({ code: "VAULT_FORMAT_INVALID" });
  });

  expect(asserted).toBe(false);
});

test("secret vault helpers report CRYPTO_UNAVAILABLE when Web Crypto is unavailable", async () => {
  const vault = await createTestVault();

  await withStubbedGlobal("crypto", undefined, async () => {
    await expect(createTestVault()).rejects.toMatchObject({
      code: "CRYPTO_UNAVAILABLE",
    });
    await expect(
      decryptSecretVault({ vault, prfOutput: PRF_OUTPUT }),
    ).rejects.toMatchObject({ code: "CRYPTO_UNAVAILABLE" });
  });
});

test("createSecretVaultWithNewPasskey needs crypto.subtle after passkey creation", async () => {
  const { getRandomValues } = globalThis.crypto;
  const randomOnly = {
    getRandomValues: getRandomValues.bind(globalThis.crypto),
  };
  let passkeyCreated = false;
  const webAuthnClient: WebAuthnClient = {
    async createCredential({ prfSalt }) {
      passkeyCreated = true;
      return {
        credentialId: new Uint8Array(CREDENTIAL_ID_BYTES),
        transports: ["internal"],
        prfEnabled: true,
        prfOutput: new Uint8Array(prfSalt),
      };
    },
    async getCredential() {
      throw new Error("sign-in must not start");
    },
  };

  await withStubbedGlobal("crypto", randomOnly, async () => {
    await expect(
      createSecretVaultWithNewPasskey({
        rp: { id: "example.com", name: "Mera Test" },
        user: { name: "nad", displayName: "nad" },
        secret: new Uint8Array([1, 2, 3]),
        webAuthnClient,
      }),
    ).rejects.toMatchObject({ code: "CRYPTO_UNAVAILABLE" });
  });

  expect(passkeyCreated).toBe(true);
});

test("zeroes the PRF output and secret handed to Web Crypto", async () => {
  const real = globalThis.crypto;
  // Nonces and the HKDF info reach Web Crypto as algorithm fields rather than
  // as these arguments, and are public values that stay unzeroed.
  const captured: Uint8Array[] = [];
  const capturing = {
    getRandomValues: real.getRandomValues.bind(real),
    subtle: {
      deriveKey: real.subtle.deriveKey.bind(real.subtle),
      decrypt: real.subtle.decrypt.bind(real.subtle),
      importKey(
        format: "raw",
        keyData: Uint8Array<ArrayBuffer>,
        algorithm: "HKDF",
        extractable: boolean,
        usages: KeyUsage[],
      ) {
        captured.push(keyData);
        return real.subtle.importKey(
          format,
          keyData,
          algorithm,
          extractable,
          usages,
        );
      },
      encrypt(
        algorithm: AesGcmParams,
        key: CryptoKey,
        data: Uint8Array<ArrayBuffer>,
      ) {
        captured.push(data);
        return real.subtle.encrypt(algorithm, key, data);
      },
    },
  };

  // The passkey functions clear these buffers. Test them instead of the
  // lower-level functions, which leave input buffers unchanged.
  const navigator = {
    credentials: {
      async create({ publicKey }: CredentialCreationOptions) {
        const prfSalt = readEvaluatedPrfSalt(publicKey);
        return stubPublicKeyCredential({
          prf: { enabled: true, results: { first: prfSalt.buffer } },
          transports: ["internal"],
        });
      },
      async get({ publicKey }: CredentialRequestOptions) {
        const prfSalt = readEvaluatedPrfSalt(publicKey);
        return stubPublicKeyCredential({
          prf: { results: { first: prfSalt.buffer } },
        });
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    await withStubbedGlobal("crypto", capturing, async () => {
      const vault = await createSecretVaultWithNewPasskey({
        rp: { id: "example.com", name: "Mera Test" },
        user: { name: "nad", displayName: "nad" },
        secret: SECRET,
      });

      await expect(
        decryptSecretVaultWithPasskey({ rpId: "example.com", vault }),
      ).resolves.toEqual(SECRET);
    });
  });

  // One PRF-output import per key derivation (encrypting, then decrypting) plus
  // the plaintext handed to encrypt.
  expect(captured.length).toBe(3);

  for (const buffer of captured) {
    expect(buffer).toEqual(new Uint8Array(buffer.byteLength));
  }
});

test("changing the credential ID or PRF salt does not change decryption", async () => {
  const vault = await createTestVault();
  const edited = parseSecretVault({
    ...vault,
    credential: { ...vault.credential, credentialId: "BQYHCA" },
    prfSalt: "CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk",
  });

  await expect(
    decryptSecretVault({ vault: edited, prfOutput: PRF_OUTPUT }),
  ).resolves.toEqual(SECRET);
});

test("parseSecretVault reads valid vault JSON without changing its data", async () => {
  const vault = await createTestVault();

  expect(parseSecretVault(JSON.stringify(vault))).toEqual(vault);
});

test("parseSecretVault drops fields outside the v1 format", async () => {
  const vault = await createTestVault();

  expect(
    parseSecretVault({
      ...vault,
      unknown: "drop me",
      credential: { ...vault.credential, unknown: "drop me" },
    }),
  ).toEqual(vault);
});

test("parseSecretVault reports VAULT_FORMAT_INVALID for malformed base64url", async () => {
  const vault = await createTestVault();

  expectError(
    () => parseSecretVault({ ...vault, nonce: "!!!!" }),
    "VAULT_FORMAT_INVALID",
  );
});

test("parseSecretVault rejects a wrong-length nonce", async () => {
  const vault = await createTestVault();

  expectError(
    () => parseSecretVault({ ...vault, nonce: "AQ" }),
    "VAULT_FORMAT_INVALID",
  );
});

test("parseSecretVault rejects invalid JSON and non-object input", async () => {
  expectError(() => parseSecretVault("{not json"), "VAULT_FORMAT_INVALID");
  expectError(() => parseSecretVault(42), "VAULT_FORMAT_INVALID");
});

test("parseSecretVault rejects a missing or unsupported version", async () => {
  const { credential, prfSalt, nonce, ciphertext } = await createTestVault();

  // Missing version entirely.
  expectError(
    () => parseSecretVault({ credential, prfSalt, nonce, ciphertext }),
    "VAULT_FORMAT_INVALID",
  );
  // Present but not 1.
  expectError(
    () =>
      parseSecretVault({ version: 2, credential, prfSalt, nonce, ciphertext }),
    "VAULT_FORMAT_INVALID",
  );
});

test("parseSecretVault rejects a missing or non-object credential", async () => {
  const { version, prfSalt, nonce, ciphertext } = await createTestVault();

  expectError(
    () => parseSecretVault({ version, prfSalt, nonce, ciphertext }),
    "VAULT_FORMAT_INVALID",
  );
  expectError(
    () =>
      parseSecretVault({
        version,
        credential: "nope",
        prfSalt,
        nonce,
        ciphertext,
      }),
    "VAULT_FORMAT_INVALID",
  );
});

test("parseSecretVault rejects non-string transports", async () => {
  const vault = await createTestVault();

  expectError(
    () =>
      parseSecretVault({
        ...vault,
        credential: { ...vault.credential, transports: ["internal", 42] },
      }),
    "VAULT_FORMAT_INVALID",
  );
});

test("parseSecretVault rejects a ciphertext shorter than the GCM tag", async () => {
  const vault = await createTestVault();

  // 20 base64url chars decode to 15 bytes: one byte short of the 16-byte
  // AES-GCM tag, so it cannot be an authentic ciphertext even though the
  // encoded string is non-empty.
  expectError(
    () => parseSecretVault({ ...vault, ciphertext: "A".repeat(20) }),
    "VAULT_FORMAT_INVALID",
  );
});

test("parseSecretVault accepts a ciphertext of exactly the GCM tag length", async () => {
  const vault = await createTestVault();

  // 22 base64url chars decode to 16 bytes: the shortest structurally valid
  // AES-GCM output (a bare tag), so parsing passes it through unchanged.
  const parsed = parseSecretVault({ ...vault, ciphertext: "A".repeat(22) });
  expect(parsed.ciphertext).toBe("A".repeat(22));
});

test("decryptSecretVault rejects a wrong-length PRF output", async () => {
  const vault = await createTestVault();

  await expect(
    decryptSecretVault({ vault, prfOutput: new Uint8Array(31) }),
  ).rejects.toMatchObject({ code: "INPUT_INVALID" });
});

test("parseSecretVault rejects a missing prfSalt, nonce, or ciphertext", async () => {
  const { prfSalt, nonce, ciphertext, ...base } = await createTestVault();

  expectError(
    () => parseSecretVault({ ...base, nonce, ciphertext }),
    "VAULT_FORMAT_INVALID",
  );
  expectError(
    () => parseSecretVault({ ...base, prfSalt, ciphertext }),
    "VAULT_FORMAT_INVALID",
  );
  expectError(
    () => parseSecretVault({ ...base, prfSalt, nonce }),
    "VAULT_FORMAT_INVALID",
  );
});
