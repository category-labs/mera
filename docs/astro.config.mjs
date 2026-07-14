// @ts-check

import { unified } from "@astrojs/markdown-remark";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { visit } from "unist-util-visit";

const site = process.env.DOCS_SITE;
const configuredBase = process.env.DOCS_BASE;

if (configuredBase && !configuredBase.startsWith("/")) {
  throw new Error("DOCS_BASE must start with a forward slash");
}

const base = configuredBase?.replace(/\/+$/, "") ?? "";
/** @param {string} path */
const withBase = (path) => `${base}${path}`;
const socialImage = site
  ? new URL(withBase("/og.png"), site).href
  : withBase("/og.png");

/** @type {import("unified").Plugin<[], import("mdast").Root>} */
const prefixRootRelativeLinks = () => (tree) => {
  visit(tree, "link", (node) => {
    if (node.url.startsWith("/")) {
      node.url = withBase(node.url);
    }
  });
};

// https://astro.build/config
export default defineConfig({
  site,
  base: base || undefined,
  redirects: { "/demo": withBase("/") },
  markdown: {
    processor: unified({ remarkPlugins: [prefixRootRelativeLinks] }),
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
          attrs: {
            property: "og:image:alt",
            content:
              "mera. Accounts on any chain and platform, backed by a passkey. npm install @category-labs/mera",
          },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:card", content: "summary_large_image" },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:image", content: socialImage },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:image:alt",
            content:
              "mera. Accounts on any chain and platform, backed by a passkey. npm install @category-labs/mera",
          },
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
        Header: "./src/components/Header.astro",
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
            "concepts/derived-accounts-and-secret-vaults",
            "concepts/signing-sessions",
            "concepts/security-model",
            "concepts/authenticator-support",
          ],
        },
        {
          label: "Recipes",
          items: ["recipes/derive-accounts", "recipes/use-an-existing-secret"],
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
                "reference/create-secret-vault-with-new-passkey",
                "reference/create-secret-vault-with-existing-passkey",
                "reference/decrypt-secret-vault-with-passkey",
                "reference/create-secret-vault",
                "reference/get-secret-vault-prf-output",
                "reference/decrypt-secret-vault",
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
