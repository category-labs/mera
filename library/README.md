# mera

Accounts on any chain and platform, from a passkey.

mera is a TypeScript library for creating accounts from a passkey. It derives 32 secret bytes from the passkey, turns them into account keys with the standards wallet apps use, and enables signing sessions. Recovery, storage, and product flows such as funding remain under application control.

Developers can use mera to:

- create new accounts from a passkey without requiring a smart-account contract or custody service;
- give users an account they can recover on any device that has the passkey;
- export accounts as a standard recovery phrase that wallet apps can import;
- secure an existing recovery phrase, private key, or other data with a passkey;
- use the same passkey across web, iOS, and Android applications tied to the same domain.

## Supported platforms

- Web browsers
- Chrome extensions
- React Native on iOS 18 or later and Android 9 or later

Native applications can reuse passkeys created with mera by using the platform's WebAuthn APIs.

See [authenticator support](https://mera.category.xyz/authenticator-support/) for browser and OS support.

## Documentation and demos

Installation instructions, guides, compatibility details, the security model, API reference, and live demos are available on the [mera documentation website](https://mera.category.xyz/). The [passkey PRF model](https://mera.category.xyz/prf-demo/) demonstrates how a passkey determines account data.

## Status

mera is currently in preview, and the API may change before version 1.0. Category Labs has completed an internal security review. The documentation outlines its [security model](https://mera.category.xyz/concepts/security-model/).

## Contributing

Issues and pull requests are welcome in the [mera repository](https://github.com/category-labs/mera). See the [contribution guide](https://github.com/category-labs/mera/blob/main/CONTRIBUTING.md) and [code of conduct](https://github.com/category-labs/mera/blob/main/CODE_OF_CONDUCT.md).

mera is developed by [Category Labs](https://github.com/category-labs).

## License

Licensed under either the [Apache License 2.0](https://github.com/category-labs/mera/blob/main/LICENSE-APACHE) or the [MIT License](https://github.com/category-labs/mera/blob/main/LICENSE-MIT), at the licensee's option.
