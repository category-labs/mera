// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
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
      customCss: [
        "@fontsource-variable/newsreader/opsz.css",
        "@fontsource-variable/newsreader/opsz-italic.css",
        "@fontsource-variable/fraunces/opsz.css",
        "@fontsource-variable/fraunces/opsz-italic.css",
        "./src/styles/mera.css",
      ],
      sidebar: [
        { label: "Getting started", slug: "getting-started" },
        { label: "Live demo", slug: "demo" },
      ],
    }),
  ],
});
