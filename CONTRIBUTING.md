# Contributing to mera

Issues and pull requests are welcome. Focused fixes can go directly to a pull request. Open an issue before starting broad work or a public API change so the approach can be discussed first.

Participation in the project is governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Repository guidance

[AGENTS.md](./AGENTS.md) defines the repository's design, API, documentation, TypeScript, and review principles. Changes to the documentation website follow the additional structure and mechanics in [docs/AGENTS.md](./docs/AGENTS.md).

## Development

The repository requires Node.js 24 or newer and npm. Install the root dependencies before running library checks:

```sh
npm ci
```

Run the checks relevant to the change:

```sh
npm run check       # lint and format checks for the repository
npm test            # library build, test typecheck, and Playwright tests
npm run check:pack  # publishable package contents, exports, and types
```

`npm run check` applies to every change; biome verifies formatting and lint across the repository, including CSS and SVG files, and `npm run format` fixes the formatting failures it reports. Run `npm test` for library or test changes. Run `npm run check:pack` when packaged files, exports, types, or package metadata change.

The demo compiles against the built library and writes to `docs/public/demo`, where the documentation website serves it at `/demo/`:

```sh
npm run build
cd demo
npm ci
npm run build
```

Build the documentation website from its package directory. Its landing page embeds the demo, so run the demo build above first:

```sh
cd docs
npm ci
npm run build
```
