# mera

Accounts on any chain and platform, backed by a passkey.

mera is an experimental TypeScript library for building passkey-backed accounts. It gives applications authenticator-bound entropy and lockable signing sessions while leaving account derivation, recovery, storage, and product flows under application control.

Developers can use mera to:

- create new accounts from a passkey without adding smart-account contracts or a custody service;
- protect an existing recovery phrase, private key, or other secret with a passkey;
- keep account derivation and recovery choices in the application;
- use the same passkey across web, iOS, and Android applications tied to the same domain.

## Documentation and demo

Installation, guides, compatibility information, the security model, the API reference, and the live demo are on the [mera documentation website](https://determined-tenderness-production-79fe.up.railway.app/).

## Repository

- [`src/`](./src/) contains the library source.
- [`demo/`](./demo/) contains the live demo application source.
- [`docs/`](./docs/) contains the documentation website.
- [`test/`](./test/) contains the library test suite.

## Status

mera is an experimental reference implementation. The documentation describes its [security model](https://determined-tenderness-production-79fe.up.railway.app/concepts/security-model/) and [known authenticator support](https://determined-tenderness-production-79fe.up.railway.app/concepts/authenticator-support/).

## Contributing

Issues and pull requests are welcome. See the [contribution guide](./CONTRIBUTING.md) and [code of conduct](./CODE_OF_CONDUCT.md).

mera is developed by [Category Labs](https://github.com/category-labs).

## License

Licensed under either the [Apache License 2.0](./LICENSE-APACHE) or the [MIT License](./LICENSE-MIT), at the licensee's option.
