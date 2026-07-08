# Local repeatable-build / verification environment for @category-labs/mera.
#
# This image pins the toolchain so you can build and inspect the exact npm
# tarball locally before cutting a release. It is deliberately NOT part of the
# publish path: the release workflow (.github/workflows/release.yml) builds and
# publishes on a GitHub-hosted runner so npm provenance can attest that the
# published artifact was built from this source at this commit. Building here and
# uploading the tarball would weaken provenance to "a runner uploaded a file",
# so publishing is left to the runner and this Dockerfile stays a local tool.
#
# The pinned Node version here should track .nvmrc (which the runner uses) so the
# local build matches CI closely.
#
# Build + extract the tarball locally:
#   docker build -o type=local,dest=./out .
#   # -> ./out/category-labs-mera-<version>.tgz
#
# Inspect what would ship without extracting:
#   docker build --target build -t mera-build . && \
#     docker run --rm mera-build npm pack --dry-run

# Pin to a specific Node 24 line for reproducibility. package.json requires
# node >=24; bump this tag intentionally rather than tracking a floating one.
FROM node:24.10.0-bookworm-slim AS build

WORKDIR /app

# Install dependencies from the lockfile first so this layer caches across
# source-only changes. npm ci fails if package.json and the lockfile disagree.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the build context (already trimmed by .dockerignore to the
# library sources + manifest).
COPY . .

# Lint, compile, and produce the tarball. tsc emits dist/ per tsconfig.json;
# npm pack honors the "files" allowlist in package.json.
RUN mkdir -p /out \
  && npm run lint \
  && npm run build \
  && npm pack --pack-destination /out

# Export stage: `docker build -o type=local,dest=./out .` copies ONLY the
# tarball out of this final scratch stage, nothing else.
FROM scratch AS artifact
COPY --from=build /out/*.tgz /
