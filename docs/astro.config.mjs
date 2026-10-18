// @ts-check

import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

const site = "https://mera.category.xyz";
const socialImage = `${site}/og.png`;
const socialImageAlt =
  "mera. Accounts on any chain and platform, from a passkey. npm install @category-labs/mera";

// https://astro.build/config
export default defineConfig({
  site,
  redirects: {
    "/concepts/derived-accounts-and-secret-vaults":
      "/concepts/passkey-accounts/",
    "/recipes/derive-accounts": "/recipes/create-passkey-accounts/",
    "/concepts/authenticator-support": "/authenticator-support/",
  },
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
      // Starlight emits twitter:card, and X falls back to og:image.
      head: [
        {
          tag: "meta",
          attrs: { property: "og:image", content: socialImage },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:type", content: "image/png" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:width", content: "1200" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:height", content: "630" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:alt", content: socialImageAlt },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:image:alt", content: socialImageAlt },
        },
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
        Footer: "./src/components/Footer.astro",
        Header: "./src/components/Header.astro",
        Hero: "./src/components/Hero.astro",
        Search: "./src/components/Search.astro",
        ThemeProvider: "./src/components/ThemeProvider.astro",
        ThemeSelect: "./src/components/ThemeSelect.astro",
      },
      sidebar: [
        { label: "Getting started", slug: "getting-started" },
        {
          label: "Concepts",
          items: [
            "concepts/passkey-accounts",
            "concepts/signing-sessions",
            "concepts/security-model",
            "concepts/secret-vaults",
            {
              label: "Foundations",
              items: [
                "concepts/passkeys-and-prf",
                "concepts/entropy-keys-and-accounts",
              ],
            },
          ],
        },
        {
          label: "Recipes",
          items: [
            "recipes/create-passkey-accounts",
            "recipes/use-mera-with-react-native",
            "recipes/use-mera-with-chrome-extensions",
            "recipes/send-a-transaction-with-viem",
            "recipes/use-mera-with-wagmi",
            "recipes/use-an-existing-secret",
          ],
        },
        { label: "Authenticator support", slug: "authenticator-support" },
        {
          label: "Reference",
          items: [
            { label: "Overview", slug: "reference" },
            {
              label: "Passkeys",
              items: [
                "reference/create-passkey-with-prf-output",
                "reference/get-passkey-prf-output",
                "reference/web-authn-client",
              ],
            },
            {
              label: "Key derivation",
              items: [
                "reference/derive-evm-private-key",
                "reference/derive-solana-private-key",
              ],
            },
            {
              label: "Signing sessions",
              items: [
                "reference/create-secp256k1-signing-session",
                "reference/secp256k1-signing-session",
                "reference/create-ed25519-signing-session",
                "reference/ed25519-signing-session",
                "reference/to-viem-account",
              ],
            },
            {
              label: "wagmi",
              items: ["reference/mera"],
            },
            {
              label: "Secret vault",
              items: [
                "reference/create-secret-vault-with-new-passkey",
                "reference/create-secret-vault-with-existing-passkey",
                "reference/decrypt-secret-vault-with-passkey",
                "reference/parse-secret-vault",
                "reference/secret-vault-format",
              ],
            },
            {
              label: "Addresses",
              items: [
                "reference/get-evm-address",
                "reference/get-solana-address",
              ],
            },
            { label: "Errors", slug: "reference/errors" },
          ],
        },
      ],
    }),
  ],
});
