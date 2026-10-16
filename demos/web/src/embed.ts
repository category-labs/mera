// Frame and content heights can disagree by a few pixels of rounding in a
// content-sized frame; without this slack the footer pin could flip-flop.
const FOOTER_PIN_SLACK_PX = 8;

/**
 * Inside an iframe, reports the content height to the embedding page so the
 * frame can fit it. The height is not sensitive, so it posts to "*"; the
 * embedder checks the message origin. Standalone, this does nothing.
 *
 * `data-embedded` drops the viewport-filling layout, so the measured height
 * is the content's. `data-footer-pinned` pins the footer to the bottom of a
 * frame taller than the content, for embedders that size the frame from the
 * viewport.
 */
function reportHeightWhenEmbedded(): void {
  if (window.self === window.top) return;
  document.documentElement.dataset.embedded = "true";

  let last = 0;
  const post = (): void => {
    const height = Math.ceil(
      document.documentElement.getBoundingClientRect().height,
    );
    document.documentElement.dataset.footerPinned = String(
      window.innerHeight > height + FOOTER_PIN_SLACK_PX,
    );
    if (height === last) return;
    last = height;
    window.parent.postMessage({ type: "mera:resize", height }, "*");
  };

  new ResizeObserver(post).observe(document.body);
  window.addEventListener("load", post);
  // A frame-only resize leaves the content size alone, but changes pinning.
  window.addEventListener("resize", post);
  post();
}

export { reportHeightWhenEmbedded };
