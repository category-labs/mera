---
title: mera
description: A wagmi connector for passkey accounts.
---

Creates a [wagmi](https://wagmi.sh) connector for a [passkey account](/concepts/passkey-accounts/). Connecting runs a passkey ceremony, which shows a prompt. By default, every signing request runs its own ceremony and ends its [signing session](/concepts/signing-sessions/) once it settles, so no key stays in memory between requests. The connector lives in the `@category-labs/mera/wagmi` entry point, which requires `@wagmi/core` (`^3.0.0`) and `viem` (`^2.28.0`) as optional peer dependencies.

## Import

```ts
import { mera } from "@category-labs/mera/wagmi";
```

## Usage

```ts
import { mera } from "@category-labs/mera/wagmi";
import { connect, createConfig, http } from "@wagmi/core";
import { sepolia } from "viem/chains";

const config = createConfig({
  chains: [sepolia],
  connectors: [mera({ rp: { id: "account.example.com", name: "Example" } })],
  transports: { [sepolia.id]: http() },
});
const [passkey] = config.connectors;

await connect(config, { connector: passkey });
```

## Parameters

### options.rp

- Type: `{ id: string; name: string }`
- Required

Relying party the passkeys belong to. `rp.name` is shown when `connect` creates a passkey.

### options.accountIndex

- Type: `number`
- Optional; defaults to 0

Account number passed to [deriveEvmPrivateKey](/reference/derive-evm-private-key/). An integer from 0 to 2³¹ − 1.

### options.webAuthnClient

- Type: `WebAuthnClient`
- Optional; defaults to the built-in browser client

Client that runs the ceremonies. [WebAuthnClient](/reference/web-authn-client/) covers supplying one for a runtime without `navigator.credentials`.

### options.keepSessionOpen

- Type: `boolean`
- Optional; defaults to `false`

Keeps the signing session that connecting opens, or that the first signing request after a page load opens, so later requests sign without a prompt. The derived key stays in memory until `disconnect`, a `connect` to another account, or a page unload. The [signing sessions](/concepts/signing-sessions/#how-long-to-keep-a-session) page covers the trade-off.

## Returns

A wagmi `CreateConnectorFn` for a connector with the id `"mera"` and the name `"Passkey"`.

### connect

`connect({ connector })` asks for any passkey the relying party has and connects its account. `connect({ connector, create: { user } })` creates a passkey for `user`, the `{ name, displayName }` pair [createPasskeyWithPrfOutput](/reference/create-passkey-with-prf-output/) takes, and connects its account. `create` runs one ceremony, or two on authenticators that evaluate the PRF only at sign-in. When the second prompt of a `create` is dismissed, the new passkey stays on the authenticator, and a later `connect` without `create` offers it. `connect({ connector, immediate: true })` asks only for passkeys already on this device, and rejects at once with `UserRejectedRequestError` when there is none; [getPasskeyPrfOutput](/reference/get-passkey-prf-output/) lists where immediate requests run.

Reconnecting after a page load restores the stored account and shows no prompt. Signing requests run one at a time. Each runs a ceremony restricted to the stored credential, so requests made together prompt one after another. With `keepSessionOpen`, signing after a connect shows no prompt, and only the first request after a page load runs one. A passkey that opens a different address than the stored one is refused with `UnauthorizedProviderError` (code 4100).

### Provider

The provider that `getProvider` returns answers these methods:

- `eth_accounts`, `eth_requestAccounts`, and `eth_chainId`.
- `wallet_switchEthereumChain`, for the config's chains.
- `personal_sign` and `eth_signTypedData_v4`.
- `eth_sendTransaction`, for legacy, EIP-2930, and EIP-1559 transactions. viem fills, signs, and sends each one through the config's transport for the current chain, or the chain's default RPC when the config has none. Transactions sent at the same time get consecutive nonces.

Other `eth_sign*`, `personal_*`, and `wallet_*` methods reject with `MethodNotSupportedRpcError` (code -32004). That includes EIP-5792 `wallet_sendCalls`; viem's `sendCalls` with `experimental_fallback: true` sends one transaction per call instead. A transaction with a blob, an EIP-7702 authorization, or a field outside the standard request fields, and typed data whose domain `chainId` is not the current chain, reject with `InvalidParamsRpcError` (code -32602) before any prompt. Every other method goes to the transport.

## Errors

- [`INPUT_INVALID`](/reference/errors/#input_invalid): `accountIndex` is not an integer from 0 to 2³¹ − 1, which `mera` throws when called, or `connect` gets both `create` and `immediate`.

A dismissed or timed-out prompt rejects `connect` or the signing request with viem's `UserRejectedRequestError` (code 4001). Browsers give the same `NotAllowedError` when the page lacks focus or runs in a cross-origin iframe without the WebAuthn permissions, so those cases reject the same way.

Every other ceremony failure rejects `connect` with its `MeraError`, such as [`PRF_UNAVAILABLE`](/reference/errors/#prf_unavailable) or [`PASSKEY_OPERATION_FAILED`](/reference/errors/#passkey_operation_failed). A signing request reaches the connector through viem, which wraps the `MeraError` in its own error; `error.walk((cause) => cause instanceof MeraError)` returns it.

## Notes

The connector keeps the account's address and credential metadata, and no key material, under `mera.account` in the storage passed to `createConfig`. The record names its `rp.id` and `accountIndex`, and reconnecting ignores a record for other values. `disconnect` deletes the record. With `storage: null`, the account stays connected until the page unloads.

The connector starts on the config's first chain after a page load.

## See also

- [Use mera with wagmi](/recipes/use-mera-with-wagmi/): creating, signing in, signing, and disconnecting.
- [toViemAccount](/reference/to-viem-account/): a viem account for an app without wagmi.
- [deriveEvmPrivateKey](/reference/derive-evm-private-key/): the derivation behind the account.
- [Signing sessions](/concepts/signing-sessions/): how long a session holds the key.
