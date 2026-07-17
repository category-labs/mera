# Demo network

A private, disposable network the demo runs against, one Railway service for
the `evm/` directory. The network holds no real value: state is wiped on
every restart, and the house stakes accounts with play money on demand.

`evm/` runs anvil from the
[monad-foundry fork](https://github.com/category-labs/foundry) with
`--network monad` behind a guard server (`evm/server.mts`). The guard
forwards the `eth_*`, `net_*`, and `web3_*` namespaces, refuses anvil's
cheat methods, and adds three behaviors of its own:

- `demo_fundAccount(address)` tops a balance below 100 DEMON up by 10,000
  and is a no-op otherwise.
- At boot it deploys the demo's stock contract
  (`evm/contracts/DemoStock.sol`) from the committed bytecode
  (`evm/demoStock.mts`) and reports its address through `demo_market`.
- It runs anvil with mixed mining: transactions mine instantly, and an
  interval block every 5 seconds keeps the stock price, a pure function of
  the head block's timestamp, moving between trades.

Run it locally with Docker. The image downloads an amd64 binary, so the
platform flag keeps it working on other hosts, such as Apple Silicon:

```sh
docker build --platform linux/amd64 -t demo-evm demo/network/evm \
  && docker run --rm --platform linux/amd64 -p 8545:8545 demo-evm
```

Then point the demo at it via `demo/.env` (see `demo/.env.example`).
