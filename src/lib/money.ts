// Money is always an integer number of pesewas (1 GHS = 100 pesewas). Never use floats for amounts.

export function formatMoney(minor: number | null | undefined): string {
  if (minor == null) return "—";
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const cedis = Math.floor(abs / 100).toLocaleString("en-GH");
  const pesewas = String(abs % 100).padStart(2, "0");
  return `${sign}GH₵ ${cedis}.${pesewas}`;
}

/** Parse a cedi amount typed by a person ("150", "150.5", "1,200.00") into pesewas, or null if invalid. */
export function parseCedis(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  const s = String(input).replace(/[,\s]/g, "").replace(/^GH₵|^GHS/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Basis-point share of an amount, rounded half up to the nearest pesewa. 1% = 100 bps. */
export function bpsOf(minor: number, bps: number): number {
  return Math.floor((minor * bps + 5000) / 10000);
}

export function sumMinor(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
