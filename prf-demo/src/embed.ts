const RESIZE_MESSAGE_TYPE = "mera:prf-demo:resize";

function reportHeightWhenEmbedded(): void {
  if (window.self === window.top) return;

  document.documentElement.dataset.embedded = "true";
  let lastHeight = 0;

  const report = (): void => {
    const height = Math.ceil(
      document.documentElement.getBoundingClientRect().height,
    );
    if (height === lastHeight) return;
    lastHeight = height;
    window.parent.postMessage({ type: RESIZE_MESSAGE_TYPE, height }, "*");
  };

  new ResizeObserver(report).observe(document.body);
  report();
}

export { reportHeightWhenEmbedded };
