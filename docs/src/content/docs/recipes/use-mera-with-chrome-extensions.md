---
title: Use mera with Chrome extensions
description: Choose the relying party ID and the page that runs passkey ceremonies in a Chrome extension.
---

A Chrome extension runs mera on its own pages. Two choices shape the integration: the relying party ID the passkeys belong to, and the page that runs the WebAuthn ceremony.

## Choose the relying party ID

An extension can use its own extension ID or the host of a website, such as `account.example.com`.

With the **extension ID**, the passkeys work only inside the extension; a website or a mobile app cannot use them. The ID must also never change.

With a **host**, the same passkeys work on the website and in the extension. Chrome 122 and later let the extension use them when the manifest lists that exact host:

```json
{
  "minimum_chrome_version": "122",
  "host_permissions": ["https://account.example.com/*"]
}
```

## Choose where the ceremony runs

The ceremony runs on an extension page or on a page of the relying party's website.

On an extension page, Chrome shows its own passkey prompt. Password managers that intercept WebAuthn requests on websites, such as 1Password, never see it. As of 2026-08, the prompt offered only Chrome's built-in password manager and Apple Passwords. In the side panel, it often does not appear at all, and the request hangs.

On the website, the extension opens a page that runs the ceremony and sends the [PRF output](/concepts/passkeys-and-prf/) back with `postMessage`, so the password managers that intercept WebAuthn can answer. The host must serve that page, and the PRF output crosses a message channel, so both ends pin who they talk to. The extension accepts a message only from the website's origin, and only from the window it opened:

```ts
const passkeyWindow = window.open("https://account.example.com/passkey");

window.addEventListener("message", (event) => {
  if (event.origin !== "https://account.example.com") return;
  if (event.source !== passkeyWindow) return;
});
```

The page posts only to the extension's origin, with the extension ID as a fixed string:

```ts
declare const prfOutput: Uint8Array;
// ---cut---
window.opener.postMessage(prfOutput, "chrome-extension://EXTENSION_ID");
```

## The demo

The [Chrome extension demo](https://github.com/category-labs/mera/tree/main/demos/extension) binds passkeys to `mera.category.xyz`. From the side panel, it opens a page on that host and receives the PRF output with `postMessage`. A `key` in the demo manifest fixes the extension ID, and the page posts only to that ID.

## See also

- [Create passkey accounts](/recipes/create-passkey-accounts/): derive and use accounts from the PRF output.
- [Authenticator support](/authenticator-support/): browser and operating system support.
