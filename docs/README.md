# mera docs

The documentation website, built with [Astro Starlight](https://starlight.astro.build). A standalone package: run the commands below from this directory.

```sh
npm ci
npm run dev      # local dev server
npm run build    # static site in dist/
npm run preview  # serve the built site
```

Pages live in `src/content/docs/` as Markdown/MDX. The visual style is `src/styles/mera.css`, which maps the palette and typography of the `site/` article onto Starlight's CSS variables. `src/components/DemoEmbed.astro` embeds the hosted demo app and follows its `mera:resize` height protocol (see `demo/src/embed.ts`).

Authoring guidance (page structure, voice, review checklist) lives in [AGENTS.md](./AGENTS.md).
