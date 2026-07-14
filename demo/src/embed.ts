/**
 * When the demo runs inside the post's iframe, report its content height to the
 * embedding page so the frame can fit the content without dead whitespace on
 * the short sign-in screen or an inner scrollbar on the tall signed-in screen.
 *
 * Standalone (opened in its own tab), this is a no-op: the app keeps its
 * centered, viewport-filling layout. Setting `data-embedded` before render lets
 * the CSS drop `min-height: 100vh` so the measured height is the content instead
 * of the viewport.
 *
 * The height is non-sensitive, so it's posted to "*"; the embedding page is the
 * side that validates the message origin before resizing anything.
 */
function reportHeightWhenEmbedded(): void {
  if (window.self === window.top) return;

  document.documentElement.dataset.embedded = "true";

  let last = 0;
  const post = (): void => {
    const height = Math.ceil(
      document.documentElement.getBoundingClientRect().height,
    );

    // Some embedding layouts size the frame from the viewport instead of the
    // reported height, leaving empty space below the hugged content where the
    // connect screen's footer link should sit. When the frame is taller than
    // the content, `data-footer-pinned` switches the link to fixed positioning
    // at the frame's bottom edge. The content column reserves the link's band
    // (see styles.css), so pinning keeps the measured height stable and the
    // two states cannot flip-flop through the resize feedback loop.
    document.documentElement.dataset.footerPinned = String(
      window.innerHeight > height + 8,
    );

    if (height === last) return;
    last = height;
    window.parent.postMessage({ type: "mera:resize", height }, "*");
  };

  new ResizeObserver(post).observe(document.body);
  window.addEventListener("load", post);
  // The observer tracks content size only; a frame-only resize (embedding
  // layout change) must also re-evaluate pinning.
  window.addEventListener("resize", post);
  post();
}

export { reportHeightWhenEmbedded };
