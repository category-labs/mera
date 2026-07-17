# Demo networks

Private, disposable networks the demo runs against, one Railway service per
directory. Neither network holds real value: state is wiped on every restart,
and the demo funds accounts automatically until they show on-chain activity,
so an account emptied on purpose stays empty.

- `evm/` — anvil from the [monad-foundry fork](https://github.com/category-labs/foundry),
  run with `--network monad` behind a guard server (`evm/server.mts`). The
  guard forwards the `eth_*`, `net_*`, and `web3_*` namespaces, refuses
  anvil's cheat methods, and funds accounts through one guarded method:
  `demo_fundAccount(address)` tops a balance below 10 DEMON up by 100 for
  accounts that have never sent a transaction, and is a no-op otherwise.
- `solana/` — `solana-test-validator` from [Agave](https://github.com/anza-xyz/agave).
  Accounts are funded with the validator's built-in `requestAirdrop`; the
  demo airdrops only to addresses with no transaction history, and the
  airdrop itself creates history, so an address is funded once per ledger.

Run them locally with Docker. Both images download amd64 binaries, so the
platform flag keeps them working on other hosts, such as Apple Silicon:

```sh
docker build --platform linux/amd64 -t demo-evm demo/network/evm \
  && docker run --rm --platform linux/amd64 -p 8545:8545 demo-evm
docker build --platform linux/amd64 -t demo-solana demo/network/solana \
  && docker run --rm --platform linux/amd64 -p 8899:8899 demo-solana
```

Then point the demo at them via `demo/.env` (see `demo/.env.example`).
