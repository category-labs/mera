// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  redirects: { "/demo": "/" },
  integrations: [
    starlight({
      title: "mera",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/category-labs/mera",
        },
      ],
      head: [
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://api.fontshare.com" },
        },
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://cdn.fontshare.com",
            crossorigin: true,
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://api.fontshare.com/v2/css?f[]=satoshi@300,301,400,401,500,501,700,701&display=swap",
          },
        },
      ],
      customCss: [
        "@fontsource-variable/jetbrains-mono",
        "./src/styles/mera.css",
      ],
      components: {
        Hero: "./src/components/Hero.astro",
        ThemeProvider: "./src/components/ThemeProvider.astro",
        ThemeSelect: "./src/components/ThemeSelect.astro",
      },
      sidebar: [
        { label: "Getting started", slug: "getting-started" },
        {
          label: "Concepts",
          items: [
            "concepts/passkeys-and-prf",
            "concepts/derived-and-wrapped",
            "concepts/signing-sessions",
            "concepts/security-model",
            "concepts/authenticator-support",
          ],
        },
        {
          label: "Recipes",
          items: [
            "recipes/derive-accounts",
            "recipes/use-an-existing-secret",
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Overview", slug: "reference" },
            {
              label: "Passkeys",
              items: [
                "reference/create-passkey",
                "reference/create-passkey-with-prf-output",
                "reference/get-passkey-prf-output",
                "reference/get-deterministic-prf-salt-v1",
              ],
            },
            {
              label: "Signing sessions",
              items: [
                "reference/create-secp256k1-signing-session",
                "reference/create-ed25519-signing-session",
                "reference/to-viem-account",
              ],
            },
            {
              label: "Secret vault",
              items: [
                "reference/create-secret-vault",
                "reference/get-secret-vault-prf-output",
                "reference/unwrap-secret-vault",
                "reference/parse-secret-vault",
                "reference/secret-vault-format",
              ],
            },
            {
              label: "Addresses",
              items: [
                "reference/get-evm-address",
                "reference/is-evm-address",
                "reference/get-solana-address",
                "reference/is-solana-address",
              ],
            },
            { label: "Errors", slug: "reference/errors" },
          ],
        },
      ],
    }),
  ],
});
