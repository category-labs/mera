import { utf8ToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import {
  createSecretVault,
  createSecretVaultWithExistingPasskey,
  createSecretVaultWithNewPasskey,
  decryptSecretVault,
  decryptSecretVaultWithPasskey,
  getDeterministicPrfSaltV1,
  type PasskeyCredentialTransport,
  type PasskeySecretVault,
  parseSecretVault,
} from "../dist/index.js";
import { expectError, withStubbedGlobal } from "./helpers.js";

const PRF_OUTPUT = new Uint8Array(32).fill(7);
const PRF_SALT = new Uint8Array(32).fill(9);
// A real 12-word BIP-39 phrase stands in for an opaque secret; the library
// neither knows nor cares that these bytes are a mnemonic.
const SECRET = utf8ToBytes(
  "legal winner thank year wave sausage worth useful legal winner thank yellow",
);

async function createTestVault(
  secret: Uint8Array = SECRET,
): Promise<PasskeySecretVault> {
  return createSecretVault({
    credential: {
      credentialId: "AQIDBA",
      transports: ["internal"],
      prfSalt: PRF_SALT,
      prfOutput: PRF_OUTPUT,
    },
    secret,
  });
}

function readPrfSalt(
  publicKey:
    | PublicKeyCredentialRequestOptions
    | PublicKeyCredentialCreationOptions
    | undefined,
): Uint8Array {
  const first = publicKey?.extensions?.prf?.eval?.first;
  if (!(first instanceof ArrayBuffer)) {
    throw new Error("expected PRF salt as an ArrayBuffer");
  }
  return new Uint8Array(first);
}

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

test("createSecretVault snapshots caller-owned byte inputs before async work", async () => {
  const prfSalt = new Uint8Array(PRF_SALT);
  const prfOutput = new Uint8Array(PRF_OUTPUT);
  const secret = new Uint8Array(SECRET);

  const pending = createSecretVault({
    credential: {
      credentialId: "AQIDBA",
      prfSalt,
      prfOutput,
    },
    secret,
  });

  prfSalt.fill(1);
  prfOutput.fill(2);
  secret.fill(0);

  const vault = await pending;

  expect(vault.prfSalt).toBe("CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk");
  await expect(
    decryptSecretVault({ vault, prfOutput: PRF_OUTPUT }),
  ).resolves.toEqual(SECRET);
});

test("secret-vault creation rejects an empty secret before prompting", async () => {
  let ceremonyCount = 0;
  const navigator = {
    credentials: {
      async create() {
        ceremonyCount += 1;
        throw new Error("creation must not start");
      },
      async get() {
        ceremonyCount += 1;
        throw new Error("assertion must not start");
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

  expect(ceremonyCount).toBe(0);
});

test("secret-vault ceremony helpers check WebAuthn before Web Crypto", async () => {
  const vault = await createTestVault();

  await withStubbedGlobal("navigator", undefined, async () => {
    await withStubbedGlobal("crypto", undefined, async () => {
      await expect(
        createSecretVaultWithNewPasskey({
          rp: { id: "example.com", name: "Mera Test" },
          user: { name: "nad", displayName: "nad" },
          secret: SECRET,
        }),
      ).rejects.toMatchObject({ code: "PASSKEY_OPERATION_FAILED" });

      await expect(
        createSecretVaultWithExistingPasskey({
          rpId: "example.com",
          secret: SECRET,
        }),
      ).rejects.toMatchObject({ code: "PASSKEY_OPERATION_FAILED" });

      await expect(
        decryptSecretVaultWithPasskey({ rpId: "example.com", vault }),
      ).rejects.toMatchObject({ code: "PASSKEY_OPERATION_FAILED" });
    });
  });
});

test("secret-vault creation preserves PRF failures and caller-owned secrets", async () => {
  const newPasskeySecret = new Uint8Array(SECRET);
  const existingPasskeySecret = new Uint8Array(SECRET);
  const navigator = {
    credentials: {
      async create() {
        return {
          type: "public-key",
          rawId: new Uint8Array([1, 2, 3, 4]).buffer,
          response: {},
          getClientExtensionResults: () => ({ prf: { enabled: false } }),
        };
      },
      async get() {
        return {
          type: "public-key",
          rawId: new Uint8Array([1, 2, 3, 4]).buffer,
          getClientExtensionResults: () => ({ prf: {} }),
        };
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

test("createSecretVaultWithExistingPasskey rejects an empty credential ID without prompting", async () => {
  let asserted = false;
  const navigator = {
    credentials: {
      async get() {
        asserted = true;
        throw new Error("assertion must not start");
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    await expect(
      createSecretVaultWithExistingPasskey({
        rpId: "example.com",
        credential: { credentialId: "" },
        secret: SECRET,
      }),
    ).rejects.toMatchObject({ code: "INPUT_INVALID" });
  });

  expect(asserted).toBe(false);
});

test("createSecretVaultWithNewPasskey owns a random salt and snapshots the secret", async () => {
  let releaseCreation: (() => void) | undefined;
  const creationGate = new Promise<void>((resolve) => {
    releaseCreation = resolve;
  });
  let evaluatedSalt: Uint8Array | undefined;

  const navigator = {
    credentials: {
      async create({ publicKey }: CredentialCreationOptions) {
        evaluatedSalt = readPrfSalt(publicKey);
        await creationGate;
        return {
          type: "public-key",
          rawId: new Uint8Array([1, 2, 3, 4]).buffer,
          response: { getTransports: () => ["internal"] },
          getClientExtensionResults: () => ({
            prf: {
              enabled: true,
              results: { first: evaluatedSalt?.buffer },
            },
          }),
        };
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
      credentialId: "AQIDBA",
      transports: ["internal"],
    });
    expect(vault.prfSalt).not.toBe(
      Buffer.from(getDeterministicPrfSaltV1()).toString("base64url"),
    );
    await expect(
      decryptSecretVault({ vault, prfOutput: evaluatedSalt }),
    ).resolves.toEqual(SECRET);
  });
});

test("createSecretVaultWithExistingPasskey snapshots inputs and preserves transports", async () => {
  let releaseAssertion: (() => void) | undefined;
  const assertionGate = new Promise<void>((resolve) => {
    releaseAssertion = resolve;
  });
  let evaluatedSalt: Uint8Array | undefined;

  const navigator = {
    credentials: {
      async get({ publicKey }: CredentialRequestOptions) {
        evaluatedSalt = readPrfSalt(publicKey);
        await assertionGate;
        return {
          type: "public-key",
          rawId: new Uint8Array([1, 2, 3, 4]).buffer,
          getClientExtensionResults: () => ({
            prf: { results: { first: evaluatedSalt?.buffer } },
          }),
        };
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    const transports: PasskeyCredentialTransport[] = ["usb"];
    const credential = { credentialId: "AQIDBA", transports };
    const secret = new Uint8Array(SECRET);
    const pending = createSecretVaultWithExistingPasskey({
      rpId: "example.com",
      credential,
      secret,
    });

    credential.credentialId = "BQYHCA";
    transports[0] = "nfc";
    secret.fill(0);
    releaseAssertion?.();

    const vault = await pending;
    if (evaluatedSalt === undefined) {
      throw new Error("expected a PRF salt");
    }

    expect(vault.credential).toEqual({
      credentialId: "AQIDBA",
      transports: ["usb"],
    });
    await expect(
      decryptSecretVault({ vault, prfOutput: evaluatedSalt }),
    ).resolves.toEqual(SECRET);
  });
});

test("decryptSecretVaultWithPasskey snapshots the vault before prompting", async () => {
  const stored = await createTestVault();
  const vault = {
    ...stored,
    credential: {
      ...stored.credential,
      transports: [...(stored.credential.transports ?? [])],
    },
  };
  let releaseAssertion: (() => void) | undefined;
  const assertionGate = new Promise<void>((resolve) => {
    releaseAssertion = resolve;
  });

  const navigator = {
    credentials: {
      async get() {
        await assertionGate;
        return {
          type: "public-key",
          rawId: new Uint8Array([1, 2, 3, 4]).buffer,
          getClientExtensionResults: () => ({
            prf: { results: { first: PRF_OUTPUT.buffer } },
          }),
        };
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    const pending = decryptSecretVaultWithPasskey({
      rpId: "example.com",
      vault,
    });

    vault.credential.credentialId = "BQYHCA";
    vault.prfSalt = "invalid";
    vault.nonce = "invalid";
    vault.ciphertext = "invalid";
    releaseAssertion?.();

    await expect(pending).resolves.toEqual(SECRET);
  });
});

test("decryptSecretVault fails with the wrong PRF output", async () => {
  const vault = await createTestVault();

  await expect(
    decryptSecretVault({ vault, prfOutput: new Uint8Array(32).fill(1) }),
  ).rejects.toMatchObject({ code: "DECRYPT_FAILED" });
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

test("secret vault AAD is independent of credential metadata and PRF salt", async () => {
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

test("parseSecretVault round-trips canonical vault JSON", async () => {
  const vault = await createTestVault();

  expect(parseSecretVault(JSON.stringify(vault))).toEqual(vault);
});

test("parseSecretVault drops fields outside the v1 schema", async () => {
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

test("parseSecretVault rejects empty ciphertext", async () => {
  const vault = await createTestVault();

  expectError(
    () => parseSecretVault({ ...vault, ciphertext: "" }),
    "VAULT_FORMAT_INVALID",
  );
});

test("parseSecretVault rejects a non-empty ciphertext shorter than the GCM tag", async () => {
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

test("createSecretVault rejects an empty secret", async () => {
  await expect(
    createSecretVault({
      credential: {
        credentialId: "AQIDBA",
        prfSalt: PRF_SALT,
        prfOutput: PRF_OUTPUT,
      },
      secret: new Uint8Array(0),
    }),
  ).rejects.toMatchObject({ code: "INPUT_INVALID" });
});

test("createSecretVault rejects an empty credential id", async () => {
  await expect(
    createSecretVault({
      credential: {
        credentialId: "",
        prfSalt: PRF_SALT,
        prfOutput: PRF_OUTPUT,
      },
      secret: SECRET,
    }),
  ).rejects.toMatchObject({ code: "INPUT_INVALID" });
});

test("createSecretVault rejects a wrong-length PRF salt", async () => {
  await expect(
    createSecretVault({
      credential: {
        credentialId: "AQIDBA",
        prfSalt: new Uint8Array(16),
        prfOutput: PRF_OUTPUT,
      },
      secret: SECRET,
    }),
  ).rejects.toMatchObject({ code: "INPUT_INVALID" });
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
