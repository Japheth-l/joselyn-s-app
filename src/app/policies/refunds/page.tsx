import { formatMoney } from "@/lib/money";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Cancellations, refunds and disputes" };
export const dynamic = "force-dynamic";

export default async function RefundsPage() {
  const s = await getSettings();
  return (
    <>
      <h1>Cancellations, refunds and disputes</h1>
      <h2>Cancelling</h2>
      <ul>
        <li><strong>Before you pay:</strong> cancel any time, free.</li>
        <li><strong>After paying, before sewing starts:</strong> cancel from your order for a full refund, except the measurement visit fee (currently {formatMoney(s.homeMeasurementFeeMinor)}) if a professional already came to measure you. That fee goes to the professional.</li>
        <li><strong>After sewing has started:</strong> the order can't simply be cancelled, because the fabric has been cut. If something is wrong, raise a dispute.</li>
        <li>A business can withdraw before sewing starts; you then get a full refund.</li>
        <li>Unpaid orders are cancelled automatically after {s.reservationHours} hours so reserved fabric can be sold again. If a payment still arrives after that, it is refunded in full automatically.</li>
      </ul>
      <h2>Refunds</h2>
      <ul>
        <li>Refunds go back to the Mobile Money wallet or card you paid with, through the payment provider. They usually arrive within a few working days.</li>
        <li>Each refund is shown on your order with its status.</li>
      </ul>
      <h2>Disputes</h2>
      <ul>
        <li>Raise a dispute from the order page if, for example, the deadline was missed, the fit or fabric isn't what was agreed, the item was damaged, or the price changed without your approval.</li>
        <li>You can raise one up to 30 days after the order completes. Add photos as evidence.</li>
        <li>Money for an order is only passed on to the business when the order completes, so a dispute raised before completion keeps it held. If a refund is decided after completion, it is taken back from what the business is owed.</li>
        <li>Our team hears both sides and decides a remedy: no action, an alteration or remake, or a partial or full refund. You'll be notified of the decision with the reasons.</li>
      </ul>
      <h2>Changes to a quote</h2>
      <p>If a business needs to change the price or fabric after you accept, it must send you a revised quote. Nothing changes unless you approve it.</p>
    </>
  );
}
