import "server-only";
import crypto from "crypto";

// Paystack supports MTN MoMo, Telecel Cash, AirtelTigo Money and cards in Ghana.
// Without PAYSTACK_SECRET_KEY the app runs in demo mode: a simulated checkout page
// marks the order paid, so the whole flow can be tried without moving real money.
const PAYSTACK = "https://api.paystack.co";

export const paymentsLive = () => Boolean(process.env.PAYSTACK_SECRET_KEY);

export function appUrl() {
  // Render sets RENDER_EXTERNAL_URL automatically, so APP_URL is optional there.
  return (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function newReference(orderId: string) {
  return `TC-${orderId}-${crypto.randomBytes(4).toString("hex")}`;
}

/** Start a Paystack checkout. Returns the page the client should be sent to. */
export async function startCheckout(opts: { email: string; amountCedis: number; reference: string; orderId: string }) {
  if (!paymentsLive()) {
    return `${appUrl()}/pay/demo?reference=${encodeURIComponent(opts.reference)}`;
  }
  const res = await fetch(`${PAYSTACK}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: opts.email,
      amount: Math.round(opts.amountCedis * 100), // pesewas
      currency: "GHS",
      reference: opts.reference,
      callback_url: `${appUrl()}/pay/callback`,
      channels: ["mobile_money", "card"],
      metadata: { orderId: opts.orderId },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json();
  if (!res.ok || !json.status) throw new Error(json.message || "Could not start payment");
  return json.data.authorization_url as string;
}

/** Ask Paystack whether a payment succeeded. Returns the amount paid in cedis, or null. */
export async function verifyPayment(reference: string): Promise<number | null> {
  if (!paymentsLive()) return null;
  const res = await fetch(`${PAYSTACK}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json();
  if (!res.ok || !json.status || json.data?.status !== "success" || json.data?.currency !== "GHS") return null;
  return json.data.amount / 100;
}

/** Check that a webhook really came from Paystack. */
export function validWebhookSignature(rawBody: string, signature: string | null) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
