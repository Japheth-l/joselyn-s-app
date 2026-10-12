import { paystack } from "./paystack";
import type { PaymentProvider } from "./provider";
import { sandbox } from "./sandbox";

/**
 * The active provider: Paystack when a key is configured, the sandbox only when explicitly enabled
 * with PAYMENTS_MODE=sandbox, otherwise none (checkout is disabled with an explanation).
 */
export function paymentProvider(): PaymentProvider | null {
  if (process.env.PAYSTACK_SECRET_KEY && process.env.PAYMENTS_MODE !== "sandbox") return paystack;
  if (process.env.PAYMENTS_MODE === "sandbox") return sandbox;
  return null;
}

export function providerByName(name: string): PaymentProvider | null {
  if (name === "PAYSTACK" && process.env.PAYSTACK_SECRET_KEY) return paystack;
  if (name === "SANDBOX" && process.env.PAYMENTS_MODE === "sandbox") return sandbox;
  return null;
}

export function appUrl() {
  return (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
}
