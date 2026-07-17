# Demo network

A private, disposable network the demo runs against, one Railway service for
the `evm/` directory. The network holds no real value: state is wiped on
every restart, and the demo funds accounts automatically until they show
on-chain activity, so an account emptied on purpose stays empty.

`evm/` runs anvil from the
[monad-foundry fork](https://github.com/category-labs/foundry) with
`--network monad` behind a guard server (`evm/server.mts`). The guard
forwards the `eth_*`, `net_*`, and `web3_*` namespaces, refuses anvil's
cheat methods, and funds accounts through one guarded method:
`demo_fundAccount(address)` tops a balance below 10 DEMON up by 100 for
accounts that have never sent a transaction, and is a no-op otherwise.

Run it locally with Docker. The image downloads an amd64 binary, so the
platform flag keeps it working on other hosts, such as Apple Silicon:

```sh
docker build --platform linux/amd64 -t demo-evm demo/network/evm \
  && docker run --rm --platform linux/amd64 -p 8545:8545 demo-evm
```

Then point the demo at it via `demo/.env` (see `demo/.env.example`).
