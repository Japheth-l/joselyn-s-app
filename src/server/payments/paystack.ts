import crypto from "crypto";
import type { PaymentProvider } from "./provider";

// Paystack (Ghana): MTN MoMo, Telecel Cash, AirtelTigo Money and cards. Amounts are in pesewas.
const API = "https://api.paystack.co";

function secret() {
  const s = process.env.PAYSTACK_SECRET_KEY;
  if (!s) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return s;
}

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.status) throw new Error(`Paystack ${path} failed: ${json.message ?? res.status}`);
  return json.data;
}

export const paystack: PaymentProvider = {
  name: "PAYSTACK",
  live: !String(process.env.PAYSTACK_SECRET_KEY ?? "").startsWith("sk_test_"),

  async initialize(p) {
    const data = await call("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: p.email, amount: p.amountMinor, currency: "GHS", reference: p.reference,
        callback_url: p.callbackUrl, channels: ["mobile_money", "card"], metadata: p.metadata,
      }),
    });
    return { redirectUrl: data.authorization_url };
  },

  async verify(reference) {
    const data = await call(`/transaction/verify/${encodeURIComponent(reference)}`);
    const status = data.status === "success" ? "SUCCEEDED" : ["failed", "abandoned", "reversed"].includes(data.status) ? "FAILED" : "PENDING";
    return { status, amountMinor: Number(data.amount), currency: String(data.currency), eventKey: `verify:${reference}:${data.id}` };
  },

  parseWebhook(rawBody, headers) {
    const sig = headers.get("x-paystack-signature") ?? "";
    const expected = crypto.createHmac("sha512", secret()).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("Invalid Paystack signature");
    const event = JSON.parse(rawBody);
    const d = event.data ?? {};
    if (event.event === "charge.success") {
      return { kind: "charge", eventKey: `charge:${d.id}`, reference: d.reference, status: "SUCCEEDED", amountMinor: Number(d.amount), currency: String(d.currency) };
    }
    if (event.event === "refund.processed" || event.event === "refund.failed") {
      return { kind: "refund", eventKey: `${event.event}:${d.id ?? d.refund_reference}`, refundRef: String(d.id ?? d.refund_reference), status: event.event === "refund.processed" ? "SUCCEEDED" : "FAILED" };
    }
    return { kind: "ignored", eventKey: `${event.event}:${d.id ?? ""}` };
  },

  async refund(p) {
    const data = await call("/refund", { method: "POST", body: JSON.stringify({ transaction: p.reference, amount: p.amountMinor }) });
    const status = data.status === "processed" ? "SUCCEEDED" : data.status === "failed" ? "FAILED" : "PROCESSING";
    return { status, providerRef: data.id ? String(data.id) : null };
  },
};
