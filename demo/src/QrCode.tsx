import encodeQR from "qr";
import { type ReactElement, useMemo } from "react";

/** Renders a crisp, scalable SVG QR code for the given text. */
function QrCode({ value }: { value: string }): ReactElement {
  const svg = useMemo(() => encodeQR(value, "svg", { border: 2 }), [value]);
  return (
    <div
      className="qr"
      role="img"
      aria-label="Account address QR code"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: locally generated, trusted SVG
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export { QrCode };
