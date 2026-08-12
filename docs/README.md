# mera docs

The documentation website, built with [Astro Starlight](https://starlight.astro.build). Build the library before installing the docs because TypeScript examples compile against the local package.

```sh
npm ci
npm run build
cd docs
npm ci
npm run dev      # local dev server
npm run build    # static site in dist/
npm run preview  # serve the built site
```

Pages live in `src/content/docs/` as Markdown/MDX. Twoslash checks every TypeScript and TSX block and adds type and JSDoc details on hover. Hidden setup before `// ---cut---` keeps each short example valid on its own.

The visual style is `src/styles/mera.css`, which maps the demo app’s palette and the `site/` article’s typography onto Starlight's CSS variables. The landing page is `src/components/Hero.astro`; it embeds the hosted demo app through `src/components/DemoEmbed.astro`. The frame follows the demo's content height in stacked layouts and uses a viewport-sized sticky panel on wide screens.

Authoring guidance (page structure, voice, review checklist) lives in [AGENTS.md](./AGENTS.md).
