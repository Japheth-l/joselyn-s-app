import { NextResponse, type NextRequest } from "next/server";
import { markPaid } from "@/lib/order-events";
import { verifyPayment } from "@/lib/payments";

// Paystack sends the client back here after checkout.
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference") ?? req.nextUrl.searchParams.get("trxref") ?? "";
  const amount = reference ? await verifyPayment(reference) : null;
  if (amount != null) {
    const res = await markPaid(reference, amount);
    if (res.ok) return NextResponse.redirect(new URL(`/orders/${res.orderId}?paid=1`, req.url));
  }
  return NextResponse.redirect(new URL("/orders?payment=failed", req.url));
}
