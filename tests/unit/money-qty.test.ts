import { describe, expect, it } from "vitest";
import { bpsOf, formatMoney, parseCedis } from "@/lib/money";
import { formatQty, parseQty, priceForQty } from "@/lib/qty";

describe("money (integer pesewas)", () => {
  it("parses cedi input exactly, without floating point drift", () => {
    expect(parseCedis("150")).toBe(15000);
    expect(parseCedis("0.1")).toBe(10);
    expect(parseCedis("1,200.05")).toBe(120005);
    expect(parseCedis("GH₵ 20.5")).toBe(2050);
    expect(parseCedis("19.99")).toBe(1999); // 19.99 * 100 is 1998.9999… as a float
  });
  it("rejects invalid or over-precise amounts", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e3", "12.3.4"]) expect(parseCedis(bad)).toBeNull();
  });
  it("formats GHS", () => {
    expect(formatMoney(120005)).toBe("GH₵ 1,200.05");
    expect(formatMoney(5)).toBe("GH₵ 0.05");
    expect(formatMoney(-250)).toBe("-GH₵ 2.50");
    expect(formatMoney(null)).toBe("—");
  });
  it("takes basis-point shares as whole pesewas", () => {
    expect(bpsOf(44400, 1000)).toBe(4440);
    expect(bpsOf(333, 1000)).toBe(33);
    expect(bpsOf(335, 1000)).toBe(34); // 33.5 rounds half up
    expect(Number.isInteger(bpsOf(12345, 250))).toBe(true);
  });
});

describe("fabric quantities (hundredths)", () => {
  it("parses and formats", () => {
    expect(parseQty("2.5")).toBe(250);
    expect(parseQty("6")).toBe(600);
    expect(parseQty("0.333")).toBeNull();
    expect(formatQty(250, "YARD")).toBe("2.5 yards");
    expect(formatQty(100, "METRE")).toBe("1 metre");
  });
  it("prices quantities in whole pesewas", () => {
    expect(priceForQty(4500, 250)).toBe(11250);
    expect(priceForQty(3333, 150)).toBe(5000); // 4999.5 rounds up
  });
});
