import { NextResponse, type NextRequest } from "next/server";
import { log } from "@/server/log";
import { handleWebhook } from "@/server/services/payments";

// Paystack → Settings → API Keys & Webhooks → Webhook URL: <APP_URL>/api/payments/paystack/webhook
// Authenticated by HMAC signature; safe to receive the same event more than once.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  try {
    const result = await handleWebhook("PAYSTACK", raw, req.headers);
    return NextResponse.json({ received: true, applied: result.applied });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/signature/i.test(message)) return new NextResponse("Invalid signature", { status: 401 });
    if (/not configured|not set/i.test(message)) return new NextResponse("Payments not configured", { status: 503 });
    log.error("payment.webhook_failed", { error: message });
    // 500 makes Paystack retry later, which is what we want for a transient failure.
    return new NextResponse("Error", { status: 500 });
  }
}
