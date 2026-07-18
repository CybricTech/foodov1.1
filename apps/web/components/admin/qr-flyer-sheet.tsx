import type { CSSProperties, ReactNode } from "react";
import { KITCHYN_LOGO_DATA_URI } from "@/lib/kitchyn-logo";

/**
 * Print-exact reproduction of the "Skip the Queue" flyer (A4 portrait).
 * Every position/size below was measured off the original template to <0.5mm.
 * Pure presentation. `brandInk` recolours all brand marks; `qrSvg` is a
 * pre-coloured inline <svg> string. `custom` scales logo/headline/tagline via
 * CSS variables — omitting it (or passing the defaults) reproduces the template
 * exactly.
 */
export const DEFAULT_TAGLINE =
  "Browse the menu, place your order\nand pay securely **from your phone.**";

export type FlyerCustom = {
  /** Logo box scale, 1 = template size (71×30mm). */
  logoScale?: number;
  /** Headline (SKIP THE / QUEUE) scale, 1 = template size. */
  headlineScale?: number;
  /** Tagline font size in mm, default 4.75. */
  taglineSize?: number;
};

/** Renders a line with `**bold**` segments (used for the editable tagline). */
function renderRich(line: string): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function QrFlyerSheet({
  merchantName,
  logoSrc,
  brandInk,
  storefrontHost,
  qrSvg,
  tagline = DEFAULT_TAGLINE,
  custom = {},
}: {
  merchantName: string;
  logoSrc: string | null;
  brandInk: string;
  storefrontHost: string;
  qrSvg: string;
  tagline?: string;
  custom?: FlyerCustom;
}) {
  const styleVars = {
    "--brand": brandInk,
    "--logo-scale": custom.logoScale ?? 1,
    "--headline-scale": custom.headlineScale ?? 1,
    "--tagline-size": `${custom.taglineSize ?? 4.75}mm`,
  } as CSSProperties;

  const taglineLines = tagline.split("\n");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SHEET_CSS }} />
      <div className="qf-sheet" style={styleVars}>
        {/* Merchant logo */}
        <div className="qf-logo-box">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt={merchantName} />
          ) : (
            <span className="qf-logo-fallback">{merchantName}</span>
          )}
        </div>
        <div className="qf-logo-divider" />

        {/* Headline */}
        <div className="qf-skip">Skip the</div>
        <div className="qf-queue">Queue</div>

        {/* Phone divider */}
        <div className="qf-pd-line qf-pd-line--l" />
        <div className="qf-pd-line qf-pd-line--r" />
        <div className="qf-pd-icon">
          <svg viewBox="0 0 44.4 38" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="13.4" y="1.2" width="17.6" height="35.6" rx="4" />
            <path d="M18.8 4.6h6.8" />
            <path d="M20.4 33h3.6" />
            <path d="M7.6 11.4 2.4 14.8M8 18.2H1.6M7.6 25 2.4 21.6" strokeWidth="1.7" />
            <path d="M36.8 11.4 42 14.8M36.4 18.2h6.4M36.8 25 42 21.6" strokeWidth="1.7" />
          </svg>
        </div>

        {/* Tagline */}
        <p className="qf-tagline">
          {taglineLines.map((line, i) => (
            <span key={i}>
              {renderRich(line)}
              {i < taglineLines.length - 1 && <br />}
            </span>
          ))}
        </p>

        {/* QR + frame */}
        <div className="qf-qr-frame">
          <div className="qf-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        </div>

        {/* Scan hint */}
        <div className="qf-scan-icon">
          <svg viewBox="0 0 32.8 50.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1.5" y="1.5" width="29.8" height="47.8" rx="5.5" />
            <path d="M12.9 6.7h7" />
            <path d="M21.4 21.6h-1.2l-1.5-1.8h-4.6l-1.5 1.8h-1.2a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2z" strokeWidth="1.7" />
            <circle cx="16.4" cy="26.3" r="2.4" strokeWidth="1.7" />
          </svg>
        </div>
        <div className="qf-scan-text">
          Scan with your
          <br />
          Phone camera
        </div>

        {/* Info pill */}
        <div className="qf-pill" />
        <div className="qf-pill-divider" />
        <div className="qf-pill-icon qf-pill-icon--globe">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
          </svg>
        </div>
        <div className="qf-pt qf-pt--t1 qf-pt--t1l">CAN&rsquo;T SCAN?</div>
        <div className="qf-pt qf-pt--t2l">
          Visit: <b>{storefrontHost}</b>
        </div>
        <div className="qf-pill-icon qf-pill-icon--headset">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z" />
            <path d="M21 16v2a4 4 0 0 1-4 4h-5" />
          </svg>
        </div>
        <div className="qf-pt qf-pt--t1 qf-pt--t1r">NEED HELP?</div>
        <div className="qf-pt qf-pt--t2r">Ask our staff</div>

        {/* Powered by Kitchyn */}
        <div className="qf-powered-by">POWERED BY</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="qf-kitchyn-logo" src={KITCHYN_LOGO_DATA_URI} alt="Kitchyn" />
        <div className="qf-bottom-line qf-bottom-line--l" />
        <div className="qf-bottom-line qf-bottom-line--r" />
      </div>
    </>
  );
}

const SHEET_CSS = `
.qf-sheet {
  position: relative;
  width: 210mm;
  height: 297mm;
  background: #fff;
  overflow: hidden;
  font-family: "Plus Jakarta Sans", system-ui, sans-serif;
  color: #000;
  /* Force brand backgrounds/colours to print even when "Background graphics" is off. */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.qf-sheet > * { position: absolute; }

/* Logo box is centred on (105mm, 21mm) so scaling grows symmetrically. */
.qf-logo-box {
  left: 50%; top: 21mm; transform: translate(-50%, -50%);
  width: calc(71mm * var(--logo-scale, 1));
  height: calc(30mm * var(--logo-scale, 1));
  display: flex; align-items: center; justify-content: center;
}
.qf-logo-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
.qf-logo-fallback {
  font-weight: 800; font-size: 9mm; letter-spacing: 0.3mm;
  color: var(--brand); text-align: center; line-height: 1.1;
}
.qf-logo-divider {
  left: 50%; transform: translateX(-50%);
  top: 38.1mm; width: 8.5mm; height: 0.4mm; background: var(--brand);
}

.qf-skip, .qf-queue {
  left: 0; width: 100%; text-align: center;
  font-weight: 800; text-transform: uppercase; line-height: 1; white-space: nowrap;
}
.qf-skip  { top: 43.4mm; font-size: calc(21.7mm * var(--headline-scale, 1)); color: #000; letter-spacing: 1.24mm; padding-left: 1.24mm; }
.qf-queue { top: 60.1mm; font-size: calc(30.2mm * var(--headline-scale, 1)); color: var(--brand); letter-spacing: 1.7mm; padding-left: 1.7mm; }

.qf-pd-line { top: 96.1mm; height: 0.4mm; background: var(--brand); }
.qf-pd-line--l { left: 69.5mm; width: 27.8mm; }
.qf-pd-line--r { left: 112.4mm; width: 28mm; }
.qf-pd-icon { left: 99.2mm; top: 91.5mm; width: 11.1mm; height: 9.5mm; color: var(--brand); }
.qf-pd-icon svg { width: 100%; height: 100%; display: block; }

.qf-tagline {
  left: 0; width: 100%; top: 101.7mm; text-align: center;
  font-size: var(--tagline-size, 4.75mm);
  line-height: calc(var(--tagline-size, 4.75mm) * 1.16);
  letter-spacing: 0.25mm; font-weight: 400;
}
.qf-tagline strong { font-weight: 700; }

.qf-qr-frame {
  left: 54.2mm; top: 118.8mm; width: 101.4mm; height: 101.4mm;
  border: 3.2mm solid var(--brand); border-radius: 6.8mm;
  display: flex; align-items: center; justify-content: center; background: #fff;
}
.qf-qr { width: 78mm; height: 78mm; }
.qf-qr svg { width: 100%; height: 100%; display: block; shape-rendering: crispEdges; }

.qf-scan-icon { left: 80.9mm; top: 223.5mm; width: 8.2mm; height: 12.7mm; color: #000; }
.qf-scan-icon svg { width: 100%; height: 100%; display: block; }
.qf-scan-text {
  left: 93.6mm; top: 223.8mm; font-size: 4.75mm; line-height: 5.5mm;
  letter-spacing: 0.27mm; font-weight: 500; text-align: left;
}

.qf-pill {
  left: 30.7mm; top: 242.5mm; width: 148.4mm; height: 23.3mm;
  border: 0.35mm solid #707070; border-radius: 4mm;
}
.qf-pill-divider { left: 124.8mm; top: 248.4mm; width: 0.35mm; height: 11.6mm; background: #707070; }
.qf-pill-icon { color: var(--brand); }
.qf-pill-icon svg { width: 100%; height: 100%; display: block; }
.qf-pill-icon--globe { left: 35.7mm; top: 248.9mm; width: 10.8mm; height: 10.8mm; }
.qf-pill-icon--headset { left: 132.2mm; top: 248.4mm; width: 11.9mm; height: 10.6mm; }
.qf-pt { line-height: 1; white-space: nowrap; }
.qf-pt--t1 { font-size: 4.55mm; font-weight: 700; letter-spacing: -0.15mm; color: #000; }
.qf-pt--t1l { left: 49.2mm; top: 248.4mm; }
.qf-pt--t1r { left: 146.5mm; top: 248.4mm; }
.qf-pt--t2l { left: 49.2mm; top: 253.9mm; font-size: 5.05mm; font-weight: 400; }
.qf-pt--t2l b { color: var(--brand); font-weight: 700; }
.qf-pt--t2r { left: 146.5mm; top: 254mm; font-size: 4.38mm; font-weight: 400; }

.qf-powered-by {
  left: 0; width: 100%; top: 269.3mm; text-align: center;
  font-size: 3.2mm; font-weight: 700; letter-spacing: 0.05mm; line-height: 1;
}
.qf-kitchyn-logo { left: 50%; transform: translateX(-50%); top: 274.5mm; width: 38.1mm; }
.qf-bottom-line { top: 278.2mm; width: 63.2mm; height: 0.4mm; background: var(--brand); }
.qf-bottom-line--l { left: 14.3mm; }
.qf-bottom-line--r { right: 14.3mm; }
`;
