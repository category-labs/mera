# mera docs

The documentation website, built with [Astro Starlight](https://starlight.astro.build). TypeScript examples compile against the local library workspace.

```sh
npm ci
npm run build
npm run dev -w docs      # local dev server
npm run build -w docs    # static site in docs/dist/
npm run preview -w docs  # serve the built site
```

`npm run build:site` builds the library, both embedded demos, and the production documentation site in deployment order.

Pages live in `src/content/docs/` as Markdown/MDX. Twoslash checks every TypeScript and TSX block and adds type and JSDoc details on hover. Hidden setup before `// ---cut---` keeps each short example valid on its own.

The visual style is `src/styles/mera.css`, which maps the demo app’s palette and the `site/` article’s typography onto Starlight's CSS variables. The landing page is `src/components/Hero.astro`; it embeds the hosted demo app through `src/components/DemoEmbed.astro`. The frame follows the demo's content height in stacked layouts and uses a viewport-sized sticky panel on wide screens.

Authoring guidance (page structure, voice, review checklist) lives in [AGENTS.md](./AGENTS.md).
