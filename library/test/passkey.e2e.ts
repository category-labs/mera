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

test("creates a PRF-capable passkey and returns stable PRF output", async ({
  page,
}) => {
  await withVirtualAuthenticator(page, async () => {
    const result = await page.evaluate(async () => {
      const mera = await import("@category-labs/mera");
      const salt = new Uint8Array(32).fill(5);
      const otherSalt = new Uint8Array(32).fill(6);
      const credential = await mera.createPasskeyWithPrfOutput({
        rp: { id: "localhost", name: "Mera Test" },
        user: { name: "nad", displayName: "nad" },
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
        returnedSalt: Array.from(credential.prfSalt),
        initial: Array.from(credential.prfOutput),
        second: Array.from(second.prfOutput),
        discoveredCredentialId: discovered.credentialId,
        discovered: Array.from(discovered.prfOutput),
        other: Array.from(other.prfOutput),
      };
    });

    expect(result.credentialId).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(result.returnedSalt).toEqual(new Array(32).fill(5));
    expect(result.initial).toHaveLength(32);
    expect(result.initial).toEqual(result.second);
    expect(result.discoveredCredentialId).toBe(result.credentialId);
    expect(result.discovered).toEqual(result.second);
    expect(result.initial).not.toEqual(result.other);
  });
});

test("PRF output helpers use the default salt when prfSalt is omitted", async ({
  page,
}) => {
  await withVirtualAuthenticator(page, async () => {
    const result = await page.evaluate(async () => {
      const mera = await import("@category-labs/mera");
      const created = await mera.createPasskeyWithPrfOutput({
        rp: { id: "localhost", name: "Mera Test" },
        user: { name: "nad", displayName: "nad" },
      });

      // Omission uses the same stable salt for later sign-ins.
      const repeated = await mera.getPasskeyPrfOutput({
        rpId: "localhost",
        credential: created,
      });

      const documentedSalt = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode("mera.prf.salt.v1"),
        ),
      );

      return {
        credentialId: created.credentialId,
        expectedSalt: Array.from(documentedSalt),
        prfSalt: Array.from(created.prfSalt),
        prfOutput: Array.from(created.prfOutput),
        repeated: Array.from(repeated.prfOutput),
      };
    });

    expect(result.credentialId).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(result.prfSalt).toHaveLength(32);
    expect(result.prfSalt).toEqual(result.expectedSalt);
    expect(result.prfOutput).toHaveLength(32);
    expect(result.prfOutput).toEqual(result.repeated);
  });
});

test("secret-vault functions create separate vaults and decrypt them", async ({
  page,
}) => {
  await withVirtualAuthenticator(page, async () => {
    const result = await page.evaluate(async () => {
      const mera = await import("@category-labs/mera");
      const firstPhrase =
        "legal winner thank year wave sausage worth useful legal winner thank yellow";
      const secondPhrase =
        "letter advice cage absurd amount doctor acoustic avoid letter advice cage above";

      const firstVault = await mera.createSecretVaultWithNewPasskey({
        rp: { id: "localhost", name: "Mera Test" },
        user: { name: "nad", displayName: "nad" },
        secret: new TextEncoder().encode(firstPhrase),
      });

      const secondVault = await mera.createSecretVaultWithExistingPasskey({
        rpId: "localhost",
        credential: firstVault.credential,
        secret: new TextEncoder().encode(secondPhrase),
      });

      const parsedFirst = mera.parseSecretVault(JSON.stringify(firstVault));
      const parsedSecond = mera.parseSecretVault(JSON.stringify(secondVault));
      const firstSecret = await mera.decryptSecretVaultWithPasskey({
        rpId: "localhost",
        vault: parsedFirst,
      });
      const secondSecret = await mera.decryptSecretVaultWithPasskey({
        rpId: "localhost",
        vault: parsedSecond,
      });

      const tampered = {
        ...parsedFirst,
        ciphertext: `${parsedFirst.ciphertext[0] === "A" ? "B" : "A"}${parsedFirst.ciphertext.slice(1)}`,
      };
      let tamperCode: string | undefined;
      try {
        await mera.decryptSecretVaultWithPasskey({
          rpId: "localhost",
          vault: tampered,
        });
      } catch (error) {
        tamperCode = mera.isMeraError(error) ? error.code : undefined;
      }

      const revealedFirst = new TextDecoder().decode(firstSecret);
      const revealedSecond = new TextDecoder().decode(secondSecret);
      firstSecret.fill(0);
      secondSecret.fill(0);

      return {
        firstPhrase,
        secondPhrase,
        firstSalt: firstVault.prfSalt,
        secondSalt: secondVault.prfSalt,
        firstCredential: firstVault.credential,
        secondCredential: secondVault.credential,
        revealedFirst,
        revealedSecond,
        tamperCode,
      };
    });

    expect(result.revealedFirst).toBe(result.firstPhrase);
    expect(result.revealedSecond).toBe(result.secondPhrase);
    expect(result.firstSalt).not.toBe(result.secondSalt);
    expect(result.secondCredential).toEqual(result.firstCredential);
    expect(result.tamperCode).toBe("DECRYPT_FAILED");
  });
});
