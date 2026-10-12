import { NextResponse, type NextRequest } from "next/server";
import { markPaid } from "@/lib/order-events";
import { validWebhookSignature } from "@/lib/payments";

// Paystack calls this when a payment succeeds, even if the client closed the browser.
// Configure it at Paystack dashboard -> Settings -> API Keys & Webhooks: <APP_URL>/api/paystack/webhook
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!validWebhookSignature(raw, req.headers.get("x-paystack-signature"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  const event = JSON.parse(raw);
  if (event.event === "charge.success" && event.data?.currency === "GHS") {
    await markPaid(event.data.reference, event.data.amount / 100);
  }
  return NextResponse.json({ received: true });
}
