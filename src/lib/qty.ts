// Fabric quantities are integer hundredths of the listing's unit (2.5 yards = 250).
export const UNITS = { YARD: { one: "yard", many: "yards", short: "yd" }, METRE: { one: "metre", many: "metres", short: "m" } } as const;
export type Unit = keyof typeof UNITS;

export function formatQty(centi: number, unit: string = "YARD", short = false): string {
  const u = UNITS[unit as Unit] ?? UNITS.YARD;
  const n = centi / 100;
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
  return `${text} ${short ? u.short : n === 1 ? u.one : u.many}`;
}

export function parseQty(input: string | number | null | undefined): number | null {
  if (input == null || input === "") return null;
  const s = String(input).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Price for a quantity: unit price (pesewas) × hundredths / 100, rounded half up. */
export function priceForQty(unitPriceMinor: number, qtyCenti: number): number {
  return Math.floor((unitPriceMinor * qtyCenti + 50) / 100);
}
