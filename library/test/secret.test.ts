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
import {
  CREDENTIAL_ID_BASE64URL,
  DEFAULT_PRF_SALT,
  readEvaluatedPrfSalt,
  rp,
  stubClient,
  stubPublicKeyCredential,
  user,
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
  const { client, calls } = stubClient();

  await expect(
    createSecretVaultWithNewPasskey({
      rp,
      user,
      secret: new Uint8Array(0),
      webAuthnClient: client,
    }),
  ).rejects.toMatchObject({ code: "INPUT_INVALID" });

  await expect(
    createSecretVaultWithExistingPasskey({
      rpId: rp.id,
      secret: new Uint8Array(0),
      webAuthnClient: client,
    }),
  ).rejects.toMatchObject({ code: "INPUT_INVALID" });

  expect(calls.create).toHaveLength(0);
  expect(calls.get).toHaveLength(0);
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
      createSecretVaultWithNewPasskey({ rp, user, secret: newPasskeySecret }),
    ).rejects.toMatchObject({ code: "PRF_UNAVAILABLE" });

    await expect(
      createSecretVaultWithExistingPasskey({
        rpId: rp.id,
        secret: existingPasskeySecret,
      }),
    ).rejects.toMatchObject({ code: "PRF_UNAVAILABLE" });
  });

  expect(newPasskeySecret).toEqual(SECRET);
  expect(existingPasskeySecret).toEqual(SECRET);
});

test("createSecretVaultWithNewPasskey uses a fresh salt and copies the secret", async () => {
  const creationGate = Promise.withResolvers<void>();
  let evaluatedSalt: Uint8Array<ArrayBuffer> | undefined;

  const navigator = {
    credentials: {
      async create({ publicKey }: CredentialCreationOptions) {
        evaluatedSalt = readEvaluatedPrfSalt(publicKey);
        await creationGate.promise;
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
    const pending = createSecretVaultWithNewPasskey({ rp, user, secret });

    secret.fill(0);
    creationGate.resolve();

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
  const requestGate = Promise.withResolvers<void>();
  let evaluatedSalt: Uint8Array<ArrayBuffer> | undefined;

  const navigator = {
    credentials: {
      async get({ publicKey }: CredentialRequestOptions) {
        evaluatedSalt = readEvaluatedPrfSalt(publicKey);
        await requestGate.promise;
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
      rpId: rp.id,
      credential,
      secret,
    });

    credential.credentialId = "BQYHCA";
    transports[0] = "nfc";
    secret.fill(0);
    requestGate.resolve();

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
  const { client, calls } = stubClient();

  await expect(
    decryptSecretVaultWithPasskey({
      rpId: rp.id,
      vault: { ...vault, ciphertext: "!!!!" },
      webAuthnClient: client,
    }),
  ).rejects.toMatchObject({ code: "VAULT_FORMAT_INVALID" });

  expect(calls.get).toHaveLength(0);
});

test("secret vault helpers report CRYPTO_UNAVAILABLE when Web Crypto or HKDF is unavailable", async () => {
  const vault = await createTestVault();
  const cryptoWithoutHkdf = {
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    subtle: {
      async importKey() {
        throw new DOMException("HKDF is unsupported", "NotSupportedError");
      },
    },
  };

  for (const runtimeCrypto of [undefined, cryptoWithoutHkdf]) {
    await withStubbedGlobal("crypto", runtimeCrypto, async () => {
      await expect(createTestVault()).rejects.toMatchObject({
        code: "CRYPTO_UNAVAILABLE",
      });
      await expect(
        decryptSecretVault({ vault, prfOutput: PRF_OUTPUT }),
      ).rejects.toMatchObject({ code: "CRYPTO_UNAVAILABLE" });
    });
  }
});

test("createSecretVaultWithNewPasskey checks crypto.subtle before creating a passkey", async () => {
  const randomOnly = {
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
  };
  const { client, calls } = stubClient();

  await withStubbedGlobal("crypto", randomOnly, async () => {
    await expect(
      createSecretVaultWithNewPasskey({
        rp,
        user,
        secret: new Uint8Array([1, 2, 3]),
        webAuthnClient: client,
      }),
    ).rejects.toMatchObject({ code: "CRYPTO_UNAVAILABLE" });
  });

  expect(calls.create).toHaveLength(0);
  expect(calls.get).toHaveLength(0);
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
        rp,
        user,
        secret: SECRET,
      });

      await expect(
        decryptSecretVaultWithPasskey({ rpId: rp.id, vault }),
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
    prfSalt: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
  });

  expect(edited.prfSalt).not.toBe(vault.prfSalt);
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

test("parseSecretVault reports VAULT_FORMAT_INVALID for malformed vaults", async () => {
  const vault = await createTestVault();
  const { version, credential, prfSalt, nonce, ciphertext } = vault;
  const malformed = {
    "invalid JSON": "{not json",
    "a non-object": 42,
    "a missing version": { credential, prfSalt, nonce, ciphertext },
    "an unsupported version": { ...vault, version: 2 },
    "a missing credential": { version, prfSalt, nonce, ciphertext },
    "a non-object credential": { ...vault, credential: "nope" },
    "non-string transports": {
      ...vault,
      credential: { ...credential, transports: ["internal", 42] },
    },
    "a missing prfSalt": { version, credential, nonce, ciphertext },
    "a missing nonce": { version, credential, prfSalt, ciphertext },
    "a missing ciphertext": { version, credential, prfSalt, nonce },
    "a nonce that is not base64url": { ...vault, nonce: "!!!!" },
    "a wrong-length nonce": { ...vault, nonce: "AQ" },
    // 20 base64url characters decode to 15 bytes.
    "a ciphertext shorter than the GCM tag": {
      ...vault,
      ciphertext: "A".repeat(20),
    },
  };

  for (const [label, value] of Object.entries(malformed)) {
    expect(() => parseSecretVault(value), label).toThrow(
      expect.objectContaining({ code: "VAULT_FORMAT_INVALID" }),
    );
  }
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
