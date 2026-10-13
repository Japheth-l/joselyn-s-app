import { db } from "@/lib/db";
import type { PaymentProvider } from "./provider";

// Sandbox provider for development, tests and clearly-labelled demo deployments (PAYMENTS_MODE=sandbox).
// The customer approves on a page that says "Sandbox: no real money", which records an approval event;
// verification then reads that event through the same code path as a real provider.

export const sandbox: PaymentProvider = {
  name: "SANDBOX",
  live: false,

  async initialize(p) {
    return { redirectUrl: `/pay/sandbox?reference=${encodeURIComponent(p.reference)}` };
  },

  async verify(reference) {
    const payment = await db.payment.findUnique({ where: { providerRef: reference } });
    const approved = await db.paymentEvent.findUnique({ where: { provider_eventKey: { provider: "SANDBOX", eventKey: `approve:${reference}` } } });
    return {
      status: approved ? "SUCCEEDED" : "PENDING",
      amountMinor: payment?.amountMinor ?? 0,
      currency: "GHS",
      eventKey: `verify:${reference}`,
    };
  },

  parseWebhook() {
    throw new Error("The sandbox provider has no webhooks");
  },

  async refund() {
    return { status: "SUCCEEDED", providerRef: `sandbox-refund-${Date.now()}` };
  },
};
