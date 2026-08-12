// @ts-check

import { fileURLToPath } from "node:url";
import { defineEcConfig } from "@astrojs/starlight/expressive-code";
import ecTwoSlash from "expressive-code-twoslash";

const docsDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineEcConfig({
  plugins: [
    ecTwoSlash({
      cwd: docsDirectory,
      tsConfigPath: "tsconfig.twoslash.json",
      includeJsDoc: true,
      instanceConfigs: {
        twoslash: {
          // Version 0.6.1 ignores `false`; an always-matching trigger applies
          // Twoslash to every block in the configured languages.
          explicitTrigger: /^/,
          languages: ["ts", "tsx"],
        },
      },
    }),
  ],
});
