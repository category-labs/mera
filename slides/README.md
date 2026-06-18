# mera slides

A short Slidev deck introducing `mera`: passkeys, the WebAuthn PRF extension, and the derived vs. wrapped account modes. About 5–10 minutes.

## Run

```sh
cd slides
npm install
npm run dev
```

Opens at <http://localhost:3030>. Press `f` for fullscreen, `o` for overview, `←` / `→` to navigate.

## Build a static deck

```sh
npm run build      # outputs to dist/
npm run export     # produces a PDF
```

The deck lives in [`slides.md`](./slides.md); look-and-feel is in [`style.css`](./style.css).
