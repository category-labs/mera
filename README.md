# mera

Accounts on any chain and platform, from a passkey.

mera is a TypeScript library for building passkey accounts. It gives applications authenticator-bound entropy and signing sessions that zero their keys when ended, while leaving account derivation, recovery, storage, and product flows under application control.

Developers can use mera to:

- create new accounts from a passkey without adding smart-account contracts or a custody service;
- protect an existing recovery phrase, private key, or other secret with a passkey;
- keep account derivation and recovery choices in the application;
- use the same passkey across web, iOS, and Android applications tied to the same domain.

## Supported platforms

- Web browsers
- React Native on iOS 18 or later and Android 9 or later

See [authenticator support](https://mera.category.xyz/authenticator-support/) for browser and OS support.

## Documentation and demos

Installation, guides, compatibility information, the security model, the API reference, and the live demos are on the [mera documentation website](https://mera.category.xyz/). The [passkey PRF model](https://mera.category.xyz/prf-demo/) shows how stable PRF output determines account data.

## Repository

- [`src/`](./src/) contains the library source.
- [`demo/`](./demo/) contains the live demo application source.
- [`demo-extension/`](./demo-extension/) contains the unpacked Chrome side-panel demo.
- [`demo-mobile/`](./demo-mobile/) contains the Expo mobile demo.
- [`prf-demo/`](./prf-demo/) contains the standalone passkey PRF model.
- [`docs/`](./docs/) contains the documentation website.
- [`test/`](./test/) contains the library test suite.

## Status

mera is in preview. The API may change before 1.0. Category Labs has completed an internal security review. The documentation describes its [security model](https://mera.category.xyz/concepts/security-model/).

## Contributing

Issues and pull requests are welcome. See the [contribution guide](./CONTRIBUTING.md) and [code of conduct](./CODE_OF_CONDUCT.md).

mera is developed by [Category Labs](https://github.com/category-labs).

## License

Licensed under either the [Apache License 2.0](./LICENSE-APACHE) or the [MIT License](./LICENSE-MIT), at the licensee's option.
