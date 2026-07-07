# mera docs

The documentation website, built with [Astro Starlight](https://starlight.astro.build). A standalone package: run the commands below from this directory.

```sh
npm ci
npm run dev      # local dev server
npm run build    # static site in dist/
npm run preview  # serve the built site
```

Pages live in `src/content/docs/` as Markdown/MDX. The visual style is `src/styles/mera.css`, which maps the demo app’s palette and the `site/` article’s typography onto Starlight's CSS variables. The landing page is `src/components/Hero.astro`; it embeds the hosted demo app through `src/components/DemoEmbed.astro` in a fixed-height panel that the demo scrolls inside.

Authoring guidance (page structure, voice, review checklist) lives in [AGENTS.md](./AGENTS.md).
