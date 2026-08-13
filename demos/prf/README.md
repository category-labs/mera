# mera PRF demo

This standalone page is an interactive visualization of how passkey PRF output
can determine BIP-39, EVM, and Solana account data.

## Development

Build the mera library before starting or building this app:

```sh
npm ci
npm run build
npm run dev -w mera-prf-demo
```

The production build writes to `docs/public/prf-demo/`:

```sh
npm test -w mera-prf-demo
npm run build -w mera-prf-demo
```

## Embed

The hosted page is available at `https://mera.category.xyz/prf-demo/`. This
example follows content height changes and limits the applied height to 1600
pixels:

```html
<iframe
  data-mera-prf-demo
  src="https://mera.category.xyz/prf-demo/"
  title="mera passkey PRF model"
  style="display:block;width:100%;height:900px;border:0"
></iframe>
<script>
  const frame = document.querySelector("iframe[data-mera-prf-demo]");

  window.addEventListener("message", (event) => {
    if (
      event.origin !== "https://mera.category.xyz" ||
      event.source !== frame.contentWindow ||
      event.data?.type !== "mera:prf-demo:resize" ||
      !Number.isFinite(event.data.height) ||
      event.data.height <= 0
    ) {
      return;
    }

    frame.style.height = `${Math.min(1600, Math.ceil(event.data.height))}px`;
  });
</script>
```

Only the content height crosses the frame boundary. Inputs and derived values
stay inside the frame.
