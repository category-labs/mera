import { expect, type Page, test } from "@playwright/test";
import { startTestServer } from "./server.js";

// Owns the shared e2e harness: test server, CDP virtual authenticator
// (PRF-capable, discoverable, user-verified), page navigation, and teardown.
async function withVirtualAuthenticator(
  page: Page,
  run: () => Promise<void>,
): Promise<void> {
  const server = await startTestServer();
  const client = await page.context().newCDPSession(page);

  try {
    await client.send("WebAuthn.enable");
    await client.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        ctap2Version: "ctap2_1",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        hasPrf: true,
        automaticPresenceSimulation: true,
      },
    });

    await page.goto(server.url);
    await run();
  } finally {
    await client.send("WebAuthn.disable").catch(() => undefined);
    await server.close();
  }
}

test("creates a PRF-capable passkey and returns stable PRF output @e2e", async ({
  page,
}) => {
  await withVirtualAuthenticator(page, async () => {
    const result = await page.evaluate(async () => {
      const mera = await import("@category-labs/mera");
      const salt = new Uint8Array(32).fill(5);
      const otherSalt = new Uint8Array(32).fill(6);
      const credential = await mera.createPasskey({
        rp: { id: "localhost", name: "Mera Test" },
        user: {
          id: crypto.getRandomValues(new Uint8Array(32)),
          name: "nad",
          displayName: "nad",
        },
        prfSalt: salt,
      });
      const second = await mera.getPasskeyPrfOutput({
        rpId: "localhost",
        credential,
        prfSalt: salt,
      });
      // No credential: WebAuthn selects a discoverable credential for the
      // relying party, so this is a distinct path from the pinned call above.
      const discovered = await mera.getPasskeyPrfOutput({
        rpId: "localhost",
        prfSalt: salt,
      });
      const other = await mera.getPasskeyPrfOutput({
        rpId: "localhost",
        credential,
        prfSalt: otherSalt,
      });

      return {
        credentialId: credential.credentialId,
        atCreate: credential.prfOutput
          ? Array.from(credential.prfOutput)
          : null,
        second: Array.from(second.prfOutput),
        discoveredCredentialId: discovered.credentialId,
        discovered: Array.from(discovered.prfOutput),
        other: Array.from(other.prfOutput),
      };
    });

    expect(result.credentialId).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(result.atCreate).not.toBeNull();
    expect(result.atCreate).toHaveLength(32);
    expect(result.atCreate).toEqual(result.second);
    expect(result.discoveredCredentialId).toBe(result.credentialId);
    expect(result.discovered).toEqual(result.second);
    expect(result.atCreate).not.toEqual(result.other);
  });
});

test("createPasskeyWithPrfOutput returns the first PRF output in one call @e2e", async ({
  page,
}) => {
  await withVirtualAuthenticator(page, async () => {
    const result = await page.evaluate(async () => {
      const mera = await import("@category-labs/mera");
      const prfSalt = crypto.getRandomValues(new Uint8Array(32));
      const created = await mera.createPasskeyWithPrfOutput({
        rp: { id: "localhost", name: "Mera Test" },
        user: {
          id: crypto.getRandomValues(new Uint8Array(32)),
          name: "nad",
          displayName: "nad",
        },
        prfSalt,
      });

      // Same salt against the same credential reproduces the PRF output.
      const repeated = await mera.getPasskeyPrfOutput({
        rpId: "localhost",
        credential: created,
        prfSalt: created.prfSalt,
      });

      return {
        credentialId: created.credentialId,
        prfSalt: Array.from(created.prfSalt),
        prfOutput: Array.from(created.prfOutput),
        repeated: Array.from(repeated.prfOutput),
      };
    });

    expect(result.credentialId).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(result.prfSalt).toHaveLength(32);
    expect(result.prfOutput).toHaveLength(32);
    expect(result.prfOutput).toEqual(result.repeated);
  });
});

test("createSecretVault round-trips a secret through a real passkey ceremony @e2e", async ({
  page,
}) => {
  await withVirtualAuthenticator(page, async () => {
    const result = await page.evaluate(async () => {
      const mera = await import("@category-labs/mera");
      const phrase =
        "legal winner thank year wave sausage worth useful legal winner thank yellow";
      const credential = await mera.createPasskeyWithPrfOutput({
        rp: { id: "localhost", name: "Mera Test" },
        user: {
          id: crypto.getRandomValues(new Uint8Array(32)),
          name: "nad",
          displayName: "nad",
        },
        prfSalt: crypto.getRandomValues(new Uint8Array(32)),
      });
      const vault = await mera.createSecretVault({
        credential,
        secret: new TextEncoder().encode(phrase),
      });
      // Re-run the ceremony from the persisted vault, exactly as a reveal would.
      const { prfOutput } = await mera.getSecretVaultPrfOutput({
        rpId: "localhost",
        vault: mera.parseSecretVault(JSON.stringify(vault)),
      });
      const secret = await mera.unwrapSecretVault({ vault, prfOutput });

      return { phrase, revealed: new TextDecoder().decode(secret) };
    });

    expect(result.revealed).toBe(result.phrase);
  });
});
