import { NextResponse, type NextRequest } from "next/server";
import { log } from "@/server/log";
import { verifyByReference } from "@/server/services/payments";

// The payment provider sends the customer back here. We verify with the provider server-side;
// the browser's word is never taken as proof of payment.
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference") ?? req.nextUrl.searchParams.get("trxref") ?? "";
  if (!reference) return NextResponse.redirect(new URL("/orders", req.url));
  try {
    const payment = await verifyByReference(reference);
    if (!payment) return NextResponse.redirect(new URL("/orders?payment=unknown", req.url));
    const outcome = payment.status === "SUCCEEDED" ? "success" : payment.status === "FAILED" ? "failed" : "pending";
    return NextResponse.redirect(new URL(`/orders/${payment.orderId}?payment=${outcome}`, req.url));
  } catch (e) {
    log.error("payment.callback_failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.redirect(new URL("/orders?payment=pending", req.url));
  }
}
