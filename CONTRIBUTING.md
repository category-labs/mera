# Contributing to mera

Issues and pull requests are welcome. Focused fixes can go directly to a pull request. Open an issue before starting broad work or a public API change so the approach can be discussed first.

Participation in the project is governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Repository guidance

[AGENTS.md](./AGENTS.md) defines the repository's design, API, documentation, TypeScript, and review principles. Changes to the documentation website follow the additional structure and mechanics in [docs/AGENTS.md](./docs/AGENTS.md).

## Development

The repository requires Node.js 24 or newer and npm 12. Install every workspace from the root:

```sh
npm ci
```

Run the checks relevant to the change:

```sh
npm run check         # repository lint and format checks
npm test              # library tests
npm run test:demos    # web, extension, and PRF demos
npm run check:mobile  # mobile typecheck and Android export
npm run check:docs    # documentation snippets and site build
npm run check:pack    # package contents, exports, and public types
npm run check:all     # every check above
```

`npm run check` applies to every change; biome verifies formatting and lint across the repository, including CSS and SVG files, and `npm run format` fixes the formatting failures it reports. Run `npm test` for library or test changes. Run `npm run check:pack` when packaged files, exports, types, or package metadata change; it also typechecks the built public types without the DOM libs, so they stay usable from React Native.

Workspace commands run from the repository root. The web demo compiles against the built library and writes to `docs/public/demo`:

```sh
npm run build
npm run dev -w demos/web
npm run build -w demos/web
```

The Chrome side-panel demo writes its unpacked extension to `demos/extension/dist`:

```sh
npm test -w demos/extension
```

The passkey PRF model writes to `docs/public/prf-demo`:

```sh
npm test -w demos/prf
npm run build -w demos/prf
```

Typecheck and bundle the mobile demo to check Metro resolution:

```sh
npm run check:mobile
```

Running it on a device needs Xcode or Android Studio, a passkey provider with PRF, and the domain association files described in [demos/mobile/README.md](./demos/mobile/README.md).

Build the complete production site, including both embedded demos:

```sh
npm run build:site
```

## Releases

A GitHub workflow publishes the library to npm as `@category-labs/mera`. A release takes three steps: merge the version bump, push a matching tag, then create the GitHub release that carries the notes for the version.

Bump `version` in `library/package.json` and merge that change to `main`. Then tag the merge commit:

```sh
git tag v0.2.0
git push origin v0.2.0
```

The tag starts the workflow, which builds and publishes in the same job, so the provenance attestation covers the artifact it built. Publishing fails if the tag does not read `v<version>` from `library/package.json`, or if that version is already on npm. Both checks run before any registry write.

The workflow authenticates through npm trusted publishing, and the repository holds no npm token. npm accepts the publish only when its trusted publisher for the package names this repository and the workflow file, so renaming either means updating the setting on npmjs.com.

Once npm has the version, create the release from the tag and write its notes.

Running the workflow by hand from the Actions tab does a dry run and writes nothing to the registry.
