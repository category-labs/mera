# Private Solana network for the demo: solana-test-validator from Agave.
# The ledger lives in /tmp; a restart resets every balance, which the demo
# heals by requesting an airdrop again on the next balance poll.
FROM debian:bookworm-slim

# Pinned to the v3.0 line: Agave v3.1+ and v4 require io_uring at startup
# (a hard assertion in their filesystem helpers), and Railway's sandboxed
# runtime doesn't implement io_uring. Agave publishes glibc binaries, so
# this needs a debian base, not alpine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl bzip2 \
  && curl -fsSL https://github.com/anza-xyz/agave/releases/download/v3.0.14/solana-release-x86_64-unknown-linux-gnu.tar.bz2 \
    | tar -xj -C /opt \
  && rm -rf /var/lib/apt/lists/*

ENV PATH="/opt/solana-release/bin:${PATH}"

EXPOSE 8899

# A shell expands Railway's PORT; exec then makes the validator PID 1 so it
# receives the platform's stop signals directly. The validator starts its own
# faucet, so requestAirdrop works with no extra setup. The RPC service listens
# on all interfaces by default, so no bind flag is needed. --quiet suppresses
# the interactive dashboard, which would fill the deploy logs with escape
# codes.
CMD ["sh", "-c", "exec solana-test-validator --rpc-port ${PORT:-8899} --ledger /tmp/test-ledger --reset --limit-ledger-size 10000 --quiet"]
