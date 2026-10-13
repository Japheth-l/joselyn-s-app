import { describe, expect, it } from "vitest";
import { ORDER_STATUS } from "@/lib/enums";
import { canTransition, nextStatuses, TRANSITIONS } from "@/server/order-machine";

describe("order state machine", () => {
  it("only uses known statuses", () => {
    for (const t of TRANSITIONS) {
      expect(ORDER_STATUS).toHaveProperty(t.to);
      for (const f of t.from) expect(ORDER_STATUS).toHaveProperty(f);
    }
  });
  it("has no way to skip payment or production", () => {
    expect(canTransition("AWAITING_PAYMENT", "IN_PRODUCTION", ["BUSINESS", "CUSTOMER", "ADMIN", "SYSTEM"])).toBe(false);
    expect(canTransition("QUOTED", "READY", ["BUSINESS", "ADMIN", "SYSTEM"])).toBe(false);
    expect(canTransition("IN_PRODUCTION", "COMPLETED", ["BUSINESS", "CUSTOMER", "ADMIN", "SYSTEM"])).toBe(false);
    expect(canTransition("READY", "DELIVERED", ["RIDER", "CUSTOMER"])).toBe(false);
  });
  it("enforces who may act", () => {
    expect(canTransition("MEASUREMENTS_CONFIRMED", "IN_PRODUCTION", ["BUSINESS"])).toBe(true);
    expect(canTransition("MEASUREMENTS_CONFIRMED", "IN_PRODUCTION", ["CUSTOMER"])).toBe(false);
    expect(canTransition("PICKED_UP", "IN_TRANSIT", ["BUSINESS"])).toBe(false);
    expect(canTransition("DELIVERED", "COMPLETED", ["RIDER"])).toBe(false);
    expect(canTransition("IN_PRODUCTION", "CANCELLED", ["CUSTOMER", "BUSINESS"])).toBe(false);
  });
  it("lets only an admin resume or close a dispute", () => {
    expect(canTransition("DISPUTED", "IN_PRODUCTION", ["ADMIN"])).toBe(true);
    expect(canTransition("DISPUTED", "IN_PRODUCTION", ["CUSTOMER", "BUSINESS"])).toBe(false);
    expect(canTransition("DISPUTED", "REFUNDED", ["ADMIN"])).toBe(true);
  });
  it("terminal statuses have no exits", () => {
    expect(nextStatuses("CANCELLED")).toEqual([]);
    expect(nextStatuses("REFUNDED")).toEqual([]);
    expect(nextStatuses("COMPLETED")).toEqual(["DISPUTED"]);
  });
});
