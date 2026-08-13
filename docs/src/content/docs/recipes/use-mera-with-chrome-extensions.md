---
title: Use mera with Chrome extensions
description: Integration options for mera in Chrome extensions
---

There are a few integration options for mera for Chrome extensions, each with its own trade-offs.

## Integration options

### The relying party ID

The relying party ID decides who the passkeys belong to. For an extension, there are two options:
- extension ID
- host URL (e.g., a website such as account.example.com)

With the **extension ID**, the passkey can only be used inside the extension. A website or a mobile app won't be able to reuse them. The ID must also never change.

With a **URL**, the same passkeys work on the website and in the extension. Chrome 122+ lets the extension use them when the manifest lists that exact host:

```json
{
  "minimum_chrome_version": "122",
  "host_permissions": ["https://account.example.com/*"]
}
```

### Running the WebAuthn ceremony

The ceremony can run on an extension page or on the relying party website page.

On an extension page, Chrome shows its own passkey prompt. Password managers that watch websites and intercept WebAuthn requests, such as 1Password, do not see prompts on extension pages, so the requests are handled by Chrome's own prompt, which may not allow routing to arbitrary authenticators. At the moment of writing, it only allowed authenticating with Chrome's built-in password manager or Apple Passwords (Platform's manager) and didn't allow routing to a browser extension. 

On the website, the extension opens a page. The page runs the ceremony and sends the [PRF output](/concepts/passkeys-and-prf/) back with `postMessage`. This way 3rd-party password managers like 1Password can intercept the request. The trade-off is that the host must serve that page and that the PRF output crosses a message channel, so both ends must pin who they talk to. The extension must accept a message only from the website origin, and only from the window it opened:

```ts
const passkeyWindow = window.open("https://account.example.com/passkey");

window.addEventListener("message", (event) => {
  if (event.origin !== "https://account.example.com") return;
  if (event.source !== passkeyWindow) return;
});
```

The page must post only to the extension's origin, with the extension ID as a fixed string:

```ts
declare const prfOutput: Uint8Array;
// ---cut---
window.opener.postMessage(prfOutput, "chrome-extension://EXTENSION_ID");
```

### Notes
- When running a WebAuthn ceremony in the extension side panel, it often shows no prompt at all, and the request hangs.

## Check out the demo

The [Chrome extension demo](https://github.com/category-labs/mera/tree/main/demos/extension) binds passkeys to `mera.category.xyz`. It opens a page on that host and receives the PRF output with `postMessage`. A `key` in the demo manifest fixes the extension ID, and the page posts only to that ID.

## See also

- [Create passkey accounts](/recipes/create-passkey-accounts/): derive and use accounts from the PRF output.
- [Authenticator support](/authenticator-support/): browser and operating system support.