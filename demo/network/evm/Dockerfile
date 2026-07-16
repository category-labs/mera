# Private EVM network for the demo: anvil from the monad-foundry fork behind
# a guard server. The guard owns the public port, forwards ordinary JSON-RPC,
# refuses anvil's cheat methods, and funds accounts through demo_fundAccount
# (see server.mts). State is in memory only; a restart resets every balance,
# which the demo heals by asking for funds again on the next balance poll.
FROM node:24-alpine

# The alpine (musl) build must run on an alpine base; the linux build is glibc.
RUN apk add --no-cache ca-certificates curl \
  && curl -fsSL https://github.com/category-labs/foundry/releases/download/v1.7.1-monad-v1.0.0/foundry_v1.7.1-monad-v1.0.0_alpine_amd64.tar.gz \
    | tar -xz -C /usr/local/bin anvil

COPY server.mts /srv/server.mts

EXPOSE 8545

# The guard reads PORT itself and starts anvil on localhost, so anvil is
# never reachable from outside the container. Node 24 runs the TypeScript
# source directly by stripping the (erasable-only) type syntax.
CMD ["node", "/srv/server.mts"]
