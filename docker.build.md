# Building & publishing `@category-labs/mera`

How the npm package is built reproducibly (in Docker) and published (via GitHub
Actions on a version tag). The Docker image is the single source of truth for the
build environment — the same `docker build` runs locally and in CI.

This is the JS-ecosystem analog of monad-bft's `.deb` pipeline: instead of
staging a filesystem and running `dpkg-deb`, we compile TypeScript and run
`npm pack`. The shared idea is a **pinned builder image** (cf. monad-bft's
`docker/builder` image) so the artifact is identical everywhere. See
`debian.build.md` for the .deb that loosely inspired this.

## What ships

`@category-labs/mera` is a pure ESM TypeScript library. The published tarball
contains only:

- `dist/**` — compiled `.js`, `.js.map`, and `.d.ts` (no `.ts` sources)
- `README.md`, `LICENSE-MIT`, `LICENSE-APACHE`
- `package.json`

The contents are governed by the `files` allowlist in `package.json` (the npm
equivalent of the `.deb` staged tree). JS source maps (`sourceMap` in
`tsconfig.json`) ship so stack traces map to original line/column positions.
The maps are **bare**: their `sources` reference `../src/*.ts`, which are not
shipped, and `sourcesContent` is not embedded. A debugger therefore gets correct
line attribution but cannot open the original TS source ("source not found").
Declaration maps (`.d.ts.map`) are intentionally not emitted for the same
reason — they would dangle without the `.ts` sources. To make maps fully
self-contained without shipping `.ts` files, add `inlineSources: true`; to enable
full step-through, instead ship `src` (or the `.ts` sources) and re-enable
`declarationMap`.

Inspect exactly what would ship:

```bash
npm pack --dry-run          # on the host
# or, from the pinned environment:
docker build --target build -t mera-build . && docker run --rm mera-build npm pack --dry-run
```

## Reproducible build (Docker)

`Dockerfile` builds in a pinned Node image, runs `lint` + `build`, and packs the
tarball. A final `scratch` stage holds only the `.tgz` so `docker build -o`
extracts just the artifact.

```bash
# Build and extract the tarball to ./out/
docker build -o type=local,dest=./out .
# -> ./out/category-labs-mera-<version>.tgz
```

Pipeline inside the image:

1. `node:24.x-bookworm-slim` (pinned tag — bump intentionally; `package.json`
   requires `node >=24`).
2. `COPY package.json package-lock.json` → `npm ci` (lockfile-exact install,
   cached across source-only changes).
3. `COPY . .` — context already trimmed by `.dockerignore` to library sources +
   manifest (no `demo/`, `site/`, `test/`, `.git`, etc.).
4. `npm run lint && npm run build && npm pack` into `/out`.
5. `FROM scratch AS artifact` copies `/out/*.tgz` for `-o` export.

The tarball is byte-for-content identical to a host `npm pack` (verified: 30
files, ~24 kB).

### Why the container does not publish

`npm publish --provenance` must run on the GitHub Actions runner, not inside the
container: provenance attestation is signed with the runner's OIDC token, which
the container doesn't have. So the container's job ends at producing the `.tgz`;
the runner publishes that exact file.

## Release (GitHub Actions on tag)

`.github/workflows/release.yml` triggers on tags matching `v*`.

```bash
npm version <patch|minor|major>   # bumps package.json + creates the vX.Y.Z tag
git push --follow-tags            # pushing the tag triggers the release
```

Workflow steps:

1. `docker build -o type=local,dest=./out .` — build the tarball in the pinned
   image (same command as local).
2. `actions/setup-node` with `registry-url` (runner-side, only to run
   `npm publish`).
3. Guard: fail if `name@version` is already on npm (prevents duplicate publish).
4. `npm publish out/*.tgz` — `publishConfig` in `package.json` sets
   `access: public` + `provenance: true`. Auth via `secrets.NPM_TOKEN`.

`id-token: write` permission is granted for provenance.

## One-time setup required before the first publish

1. **Create the npm org/scope.** Unscoped `mera` is already taken on npm
   (an unrelated package), so this publishes as the scoped `@category-labs/mera`.
   The `category-labs` scope must exist on npm — create the org (or the scope)
   under the account that will own the package.
2. **Add the `NPM_TOKEN` secret.** Generate an npm **automation** (or granular
   publish) token with publish rights to `@category-labs/*` and add it as the
   `NPM_TOKEN` repository/environment secret.
3. **(Optional) Configure the `npm-publish` environment.** The release job
   targets a GitHub Actions `environment: npm-publish` — create it (and add
   required reviewers if you want a manual approval gate before publishing).

## Local checklist before tagging a release

```bash
npm ci
npm run lint
npm test                       # builds + runs Playwright tests
docker build -o type=local,dest=./out .   # confirm the packaged artifact
tar -tzf out/*.tgz | sort      # eyeball the contents
```
