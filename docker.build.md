# Building & publishing `@category-labs/mera`

How the npm package is built and published. There are two distinct build paths,
on purpose:

- **Release (CI):** the package is built **and** published on a GitHub-hosted
  runner (`.github/workflows/release.yml`) so npm **provenance** is honest — the
  signed attestation certifies the published artifact was built from this repo at
  this commit by this workflow.
- **Local verification (Docker):** the `Dockerfile` reproduces the build in a
  pinned toolchain so you can inspect the exact tarball before tagging. It is
  **not** in the publish path.

This is loosely the JS-ecosystem analog of monad-bft's `.deb` pipeline: instead
of staging a filesystem and running `dpkg-deb`, we compile TypeScript and
`npm publish`. See `debian.build.md` for the `.deb` that inspired this.

> Why not build in Docker and publish that tarball? npm provenance is signed with
> the runner's OIDC token and attests to *what the runner observed*. If the build
> happens inside an opaque `docker build` and the runner only uploads the
> resulting `.tgz`, the attestation degrades to "a runner uploaded a file" —
> it can't link the bytes to the source. So the runner builds what it publishes,
> and Docker stays a local tool. `.nvmrc` pins the runner's Node to match the
> Dockerfile so the two builds stay close.

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

## Local verification build (Docker)

`Dockerfile` builds in a pinned Node image, runs `lint` + `build`, and packs the
tarball. A final `scratch` stage holds only the `.tgz` so `docker build -o`
extracts just the artifact. Use this to inspect exactly what a release would ship
before you tag; it does not publish.

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

## Release (GitHub Actions)

`.github/workflows/release.yml` has two paths:

**Real publish — on a `v*` tag:**

```bash
npm version <patch|minor|major>   # bumps package.json + creates the vX.Y.Z tag
git push --follow-tags            # pushing the tag triggers the release
```

The `publish` job runs on `ubuntu-latest` (GitHub-hosted, required for
provenance) with `id-token: write`, and:

1. `actions/setup-node` with `.nvmrc` + `registry-url`.
2. `npm ci` then `npm run build` — the build the attestation covers.
3. Guard: fail if `name@version` is already on npm (versions are immutable).
4. `npm publish --provenance` — `publishConfig` in `package.json` sets
   `access: public` + `provenance: true`. Auth via `secrets.NPM_TOKEN`.

**Dry-run — on `workflow_dispatch`:**

Run the workflow manually from the Actions tab. The `dry-run` job does
`npm ci` → `npm run build` → `npm publish --dry-run`. It contacts no registry,
needs no secrets and no OIDC, and omits `--provenance` (only meaningful on a real
publish). Safe to run before any of the prerequisites below exist — use it to
validate checkout/build/pack resolution end-to-end.

## One-time setup required before the first publish

None of these are needed for the `workflow_dispatch` dry-run; they gate only the
real `v*`-tag publish.

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
4. **The GitHub repo must be PUBLIC.** npm provenance is not supported for
   private repositories — `npm publish --provenance` will *fail*, not silently
   skip, if `category-labs/mera` is private. Make the repo public before pushing
   the first `v*` tag. (The workflow includes a preflight step that fails early
   with a clear message if the repo is still private.)

### First publish (bootstrapping a brand-new package)

The scope/package don't exist on npm until the first successful publish. Once
prerequisites 1–4 are met, the normal tag flow (`npm version` + `git push
--follow-tags`) creates the package and its first provenance attestation in one
go. If the first tagged run has trouble, publishing `0.1.0` once from a
maintainer's machine (`npm publish`) creates the package; subsequent releases go
through CI as usual.

### Later: migrate off the long-lived token (trusted publishing)

npm supports OIDC **trusted publishing**, which removes the `NPM_TOKEN` secret
entirely and generates provenance automatically. To adopt it later: on npmjs.com,
under the package's **Trusted Publisher** settings, register org `category-labs`,
repo `mera`, workflow filename `release.yml`, and environment `npm-publish`; then
drop the `NODE_AUTH_TOKEN`/`NPM_TOKEN` wiring from `release.yml` (the
`id-token: write` permission is already present). Requires npm ≥ 11.5.1 (the
runner already has this). Recommended once the token-based flow is proven.

## Local checklist before tagging a release

```bash
npm ci
npm run lint
npm test                       # builds + runs Playwright tests
docker build -o type=local,dest=./out .   # confirm the packaged artifact
tar -tzf out/*.tgz | sort      # eyeball the contents
```
