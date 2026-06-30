# monad-bft `.deb` build — findings

Notes on how the Debian package is built for **category-labs/monad-bft**, gathered
via the monad-bft codebase MCP (read-only, public repo).

Ref commit inspected: `2d2282e058d6eb4cb81159a48d96b4d17aa9a2b2`.

## TL;DR

- There is **no `.deb` build/publish GitHub Actions workflow** committed in the
  public `monad-bft` repo. The actual `dpkg-deb`/packaging+publish step lives
  outside this repo (internal release pipeline).
- What the repo *does* contain is the **`.deb` payload source tree** under
  `debian/`: the staged filesystem (what lands on disk) plus the `DEBIAN/`
  maintainer scripts (install/remove hooks). No `DEBIAN/control` is committed at
  this ref — it is generated at build time.
- The package is a classic "staged root + `DEBIAN/` metadata" layout, so the
  build is effectively: compile binaries → drop them into `debian/...` → generate
  `DEBIAN/control` → `dpkg-deb --build debian <name>.deb`.

## What's in `.github/workflows/` (none build a .deb)

| Workflow | Purpose |
|---|---|
| `rust.yml` | CI on `self-hosted`: lockfile verify, `cargo sort`, `cargo +nightly fmt`, `cargo shear`, `cargo clippy`, `cargo test --release`, WASM check. Also copies `debian/etc/sysctl.d/90-monad-network-buffer.conf` into `/etc/sysctl.d/` to tune network buffers for the test run. |
| `build-builder.yml` | Builds & pushes the **builder Docker image** (`docker/builder/Dockerfile`) to the private registry `peach10.devcore4.com` (`category-labs/builder`). Triggers on `docker/builder/**` for `master`/`release**`/`staging**`. Runs on `ubuntu-24.04-32`. |
| `benchmarks.yml` | Benchmarks. |
| `fuzz.yml` | Fuzzing. |
| `license.yml` + `license.sh` | License header checks. |
| `openrpc.yml` | OpenRPC spec generation/check. |
| `claude.yml`, `test-command.yml` | Bot / slash-command tooling. |

The private registry usage in `build-builder.yml` is the strongest signal that
release artifacts (the `.deb` included) are produced by internal infra, not by a
public workflow.

## The `.deb` payload: `debian/` tree

Standard packaging layout — every path under `debian/` (except `DEBIAN/`) maps to
the on-disk install location.

```
debian/
├── DEBIAN/                      # package control metadata + maintainer scripts
│   ├── preinst                  # pre-install hook
│   ├── postinst                 # post-install hook (enables/starts services)
│   ├── prerm                    # pre-remove hook (stops services)
│   └── postrm                   # post-remove hook (cleanup, optional TrieDB wipe)
│   # NOTE: no `control` file committed here at this ref — generated at build time
├── etc/
│   ├── security/limits.d/       # → /etc/security/limits.d/ (90-monad-nofile.conf)
│   └── sysctl.d/                # → /etc/sysctl.d/ (90-monad-network-buffer.conf)
├── opt/monad/                   # → /opt/monad/
│   ├── backup/                  #   key backup folder (left behind on purge)
│   └── scripts/                 #   clear-old-artifacts.sh / .cron, etc.
└── usr/lib/systemd/system/      # → /usr/lib/systemd/system/  (systemd units)
```

### systemd units shipped (`debian/usr/lib/systemd/system/`)

- `monad-bft.service` — the consensus/BFT node (`/usr/local/bin/monad-node`)
- `monad-execution.service` — execution client (`/usr/local/bin/monad`)
- `monad-execution-genesis.service`
- `monad-archiver.service`
- `monad-blockcapd.service`
- `monad-checker.service`
- `monad-cruft.service` + `monad-cruft.timer` (periodic cleanup)
- `monad-exec-events-uploader.service`
- `monad-indexer.service`
- `monad-ledger-tail.service`
- `monad-mpt.service`
- `monad-rpc.service`
- `monad-txgen.service`
- `set-hugepages.service` (enabled/started at install; sets up hugepages)

#### `monad-bft.service` (key details)

- `ExecStart=/usr/local/bin/monad-node` with config rooted at
  `/home/monad/monad-bft/config/...` (secp + bls identities, `node.toml`,
  `forkpoint/forkpoint.toml`, `validators/validators.toml`, `peers.toml`).
- Data paths: WAL, mempool/controlpanel/statesync IPC sockets, `ledger/`, and
  `--triedb-path /dev/triedb`.
- OTel endpoint `http://127.0.0.1:4317`; metrics every 1s.
- Reads `KEYSTORE_PASSWORD` from env (`EnvironmentFile=-/home/monad/.env`).
- Runs as `User=monad`/`Group=monad`, pinned to CPUs 8–11
  (`AllowedCPUs`/`CPUAffinity`), `DeviceAllow=/dev/triedb rw`,
  `LimitNOFILE=1048576`, `LimitMEMLOCK=infinity`,
  `MemoryDenyWriteExecute=false`, `Restart=no`.

#### `monad-execution.service` (key details)

- `ExecStart=/usr/local/bin/monad --chain "$CHAIN" --db /dev/triedb
  --block_db .../ledger --statesync .../statesync.sock --sq_thread_cpu 1
  --log_level INFO`.
- Pinned to CPUs 1–7, `DeviceAllow=/dev/triedb rw`, same memlock/NOFILE tuning,
  `Restart=no`, `User/Group=monad`.

## Maintainer scripts (`debian/DEBIAN/`)

### `preinst` (arg: `install` | `upgrade` | `abort-upgrade`)

- On fresh `install`: removes the obsolete `/etc/sysctl.d/99-custom.conf`
  (superseded by `90-monad-network-buffer`).
- Hardware advisories (non-fatal): warns if Hyper-Threading is enabled
  (recommends disabling) and warns if cores-per-socket < 16 (minimum required).
- Large commented-out block for interactive `/dev/triedb` udev-symlink setup
  (partition + udev rule) — currently disabled.

### `postinst` (arg: `configure`)

- `ldconfig`.
- If systemd is PID 1: `daemon-reexec`, `daemon-reload`; start+enable
  `set-hugepages.service`; enable+start `monad-cruft.timer`; `sysctl -p`.
- Always `sysctl --system` at the end (applies the shipped sysctl drop-in).

### `prerm` (arg: `remove` | `upgrade`)

- On `remove` (systemd present): `daemon-reload`, stop all
  `/etc/systemd/system/monad-*.service`, stop+disable `set-hugepages.service`
  and remove its unit file.

### `postrm` (arg: `remove` | `purge`)

- Removes `/usr/local/bin/monadctl`.
- Removes `/etc/security/limits.d/90-monad-nofile.conf` and
  `/etc/sysctl.d/90-monad-network-buffer.conf`.
- Strips the `clear-old-artifacts` cron entry for user `monad` and removes the
  associated script/cron files. **Leaves the key backup folder in place.**
- `systemctl reset-failed` for any leftover `monad-*` services.
- Interactive only: `whiptail` prompt offering to **wipe TrieDB**
  (`blkdiscard /dev/triedb`). Skipped in non-interactive environments.

## Notable referenced-but-not-here paths

These are referenced by the maintainer scripts / units but the build script that
materializes some of them (and `DEBIAN/control`) is not in the public repo:

- `/usr/local/bin/monad-node`, `/usr/local/bin/monad`, `/usr/local/bin/monadctl`
  — installed binaries (built elsewhere, copied in at package-build time).
- `DEBIAN/control` — generated at build time (Package/Version/Architecture/
  Depends/Installed-Size).
- `/opt/monad/scripts/clear-old-artifacts.{sh,cron}` and
  `set-hugepages.service` body — present in the tree but the build driver wires
  them up.

## Open follow-ups (need access beyond the public repo)

1. The internal/devops repo or release pipeline that runs `dpkg-deb --build`
   and generates `DEBIAN/control` (Version, Depends, Architecture).
2. The live Actions tab / `release**` / `staging**` branches, in case a `.deb`
   job exists off this commit.
3. Where the resulting `.deb` is published (likely the same private
   `peach10.devcore4.com` infra used by `build-builder.yml`).
