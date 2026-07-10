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
    if (height === last) return;
    last = height;
    window.parent.postMessage({ type: "mera:resize", height }, "*");
  };

  new ResizeObserver(post).observe(document.body);
  window.addEventListener("load", post);
  post();
}

export { reportHeightWhenEmbedded };
