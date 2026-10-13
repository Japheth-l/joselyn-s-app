import { describe, expect, it } from "vitest";
import { buildQuoteLines, deliveryFeeMinor, serviceFeeMinor } from "@/server/pricing";

const fees = { serviceFeeBps: 250, serviceFeeCapMinor: 2000 };

describe("pricing", () => {
  it("adds a capped service fee and totals in pesewas", () => {
    const q = buildQuoteLines({ labourMinor: 20000, fabricMinor: 27000, measurementMinor: 3000, otherMinor: 0, discountMinor: 1000 }, fees);
    const subtotal = 20000 + 27000 + 3000 - 1000;
    expect(q.lines.map((l) => l.kind)).toEqual(["LABOUR", "FABRIC", "MEASUREMENT", "DISCOUNT", "SERVICE_FEE"]);
    expect(q.totalMinor).toBe(subtotal + serviceFeeMinor(subtotal, fees));
    expect(q.lines.reduce((t, l) => t + l.amountMinor, 0)).toBe(q.totalMinor);
    expect(serviceFeeMinor(10_000_000, fees)).toBe(2000);
  });
  it("refuses a discount bigger than the quote", () => {
    expect(() => buildQuoteLines({ labourMinor: 100, fabricMinor: 0, measurementMinor: 0, otherMinor: 0, discountMinor: 500 }, fees)).toThrow(/discount/);
  });
  it("charges delivery per started kilometre", () => {
    const s = { deliveryBaseMinor: 1500, deliveryPerKmMinor: 300 };
    expect(deliveryFeeMinor(0, s)).toBe(1500);
    expect(deliveryFeeMinor(2.1, s)).toBe(1500 + 3 * 300);
  });
});
