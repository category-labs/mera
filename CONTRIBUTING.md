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

`npm run check` applies to every change; biome verifies formatting and lint across the repository, including CSS and SVG files, and `npm run format` fixes the formatting failures it reports. Run `npm test` for library or test changes. Run `npm run check:pack` when packaged files, exports, types, or package metadata change; it also typechecks the built public types without the DOM libs, which is what keeps them usable from React Native.

The demo compiles against the built library and writes to `docs/public/demo`, where the documentation website serves it at `/demo/`:

```sh
npm run build
cd demo
npm ci
npm run build
```

The passkey PRF model also compiles against the built library. It writes to `docs/public/prf-demo`, where the website serves it as a standalone page at `/prf-demo/`:

```sh
cd prf-demo
npm ci
npm test
npm run build
```

The mobile demo installs the library as a packed copy of `dist/`, which installing does not build, so build it first. Typecheck the app, and bundle it to check that Metro resolves everything:

```sh
npm run build
cd demo-mobile
npm ci
npm run typecheck
npx expo export --platform android
```

Running it on a device needs Xcode or Android Studio, a passkey provider with PRF, and the domain association files described in [demo-mobile/README.md](./demo-mobile/README.md).

Build the documentation website from its package directory. Run both web demo builds above first so their generated files are present:

```sh
cd docs
npm ci
npm run build
```

## Releases

A GitHub workflow publishes the library to npm as `@category-labs/mera`. A release takes three steps: merge the version bump, push a matching tag, then create the GitHub release that carries the notes for the version.

Bump `version` in `package.json` and merge that change to `main`. Then tag the merge commit:

```sh
git tag v0.2.0
git push origin v0.2.0
```

The tag starts the workflow, which builds and publishes in the same job, so the provenance attestation covers the artifact it built. Publishing fails if the tag does not read `v<version>` from `package.json`, or if that version is already on npm. Both checks run before any registry write.

The workflow authenticates through npm trusted publishing, and the repository holds no npm token. npm accepts the publish only when its trusted publisher for the package names this repository and the workflow file, so renaming either means updating the setting on npmjs.com.

Once npm has the version, create the release from the tag and write its notes.

Running the workflow by hand from the Actions tab does a dry run and writes nothing to the registry.
