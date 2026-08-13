# mera Chrome side-panel demo

Chrome 122+ extension uses mera passkey accounts in a paper-trading app.

## Build and install

Build mera from the repository root, then build the extension:

```sh
npm run build
cd demo-extension
npm ci
npm run build
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**,
and select `demo-extension/dist`.

## Relying party setup

Chrome 122 or later lets an extension create and open passkeys for an HTTPS
host when the manifest grants that host:

```json
{
  "minimum_chrome_version": "122",
  "host_permissions": ["https://mera.category.xyz/*"]
}
```

Pass `mera.category.xyz`, without `https://` or a path, as `rp.id` when creating a passkey and as `rpId` when opening one. The passkey prompt opens on that site so password managers that rely on intercepting WebAuthn requests (such as 1Password) can answer.

## Test

Run from `demo-extension`:

```sh
npm test
```

The suite builds the extension and tests its manifest, storage, network rules,
trades, passkey flow, locking, and recovery timeout. Before review, also check
a real PRF-capable passkey, narrow widths, both panel sides, keyboard use, and
screen-reader labels.
