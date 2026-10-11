import type { CSSProperties } from "react";

// A CSS-only preview of a fabric design, so the catalogue works before real photos are uploaded.
export function swatchStyle(design: string, color: string): CSSProperties {
  switch (design) {
    case "KENTE":
      return { background: `repeating-linear-gradient(90deg, ${color} 0 14px, #e9b630 14px 22px, #0d7352 22px 30px, #1c1917 30px 33px)` };
    case "WAX_PRINT":
      return { background: `radial-gradient(circle at 25% 25%, #fff8 0 6px, transparent 7px) 0 0/22px 22px, radial-gradient(circle at 75% 75%, #0004 0 5px, transparent 6px) 0 0/22px 22px, ${color}` };
    case "LACE":
      return { background: `radial-gradient(circle, transparent 0 4px, #fff9 5px 6px, transparent 7px) 0 0/16px 16px, ${color}` };
    case "BATIK":
      return { background: `repeating-radial-gradient(circle at 30% 40%, ${color} 0 8px, #fff6 9px 11px, ${color} 12px 18px)` };
    case "SMOCK_CLOTH":
      return { background: `repeating-linear-gradient(90deg, ${color} 0 6px, #f5f0e6 6px 9px, #1c1917 9px 10px)` };
    default:
      return { background: color };
  }
}

export function Swatch({ design, color, className = "" }: { design: string; color: string; className?: string }) {
  return <div aria-hidden className={`rounded-lg border border-stone-200 ${className}`} style={swatchStyle(design, color)} />;
}
