import { BRAND } from "@/lib/brand";
import { formatMoney } from "@/lib/money";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Terms of use" };
export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const s = await getSettings();
  return (
    <>
      <h1>Terms of use</h1>
      <p>{BRAND.name} is a marketplace that connects customers in Ghana with independent tailors, seamstresses, tailoring companies, fabric sellers, measurement professionals and delivery riders. Those businesses and professionals are not our employees; each is responsible for its own work.</p>
      <h2>Accounts</h2>
      <ul>
        <li>You need an account to order. Give accurate details and keep your password private.</li>
        <li>Businesses, measurement professionals and riders must be verified by our team before customers can see them or they can take jobs. We can suspend an account that breaks these terms.</li>
      </ul>
      <h2>Quotes and orders</h2>
      <ul>
        <li>Businesses send itemised quotes. A quote is valid for {s.quoteValidityDays} days unless it says otherwise.</li>
        <li>When you accept a quote, the business agrees to make the item as described and you agree to pay the amounts shown.</li>
        <li>A business can propose a change after acceptance (for example a different fabric quantity). Nothing changes unless you approve it.</li>
        <li>Fabric reserved for an unpaid order is held for {s.reservationHours} hours, then released and the order cancelled.</li>
      </ul>
      <h2>Payments and fees</h2>
      <ul>
        <li>Payments are processed by a licensed payment provider (Paystack) by Mobile Money or card. We never see or store your card number or Mobile Money PIN.</li>
        <li>Customers pay a service fee of {s.serviceFeeBps / 100}% of the order (at most {formatMoney(s.serviceFeeCapMinor)}), shown on every quote. Businesses pay a commission of {s.commissionBps / 100}% of their sewing and fabric price.</li>
        <li>Money for an order is passed on to the business and professionals after the order is completed, and is paid out by Mobile Money. We do not hold money as a wallet or a bank.</li>
      </ul>
      <h2>Handover</h2>
      <ul>
        <li>Pickups and deliveries are confirmed with a one-time code shown in your order. Only share it when you have your item.</li>
        <li>If you don't confirm or raise a problem within {s.autoCompleteDays} days of handover, the order completes automatically.</li>
      </ul>
      <h2>Reviews and conduct</h2>
      <ul>
        <li>Only customers with a completed order can review that business, once per order. Reviews must be honest and must not contain personal information or abuse.</li>
        <li>Don't use the platform for fraud, harassment, counterfeit goods or to take a transaction off the platform to avoid fees.</li>
      </ul>
      <h2>Problems</h2>
      <p>See <a href="/policies/refunds">Cancellations, refunds & disputes</a>. These terms are governed by the laws of Ghana.</p>
    </>
  );
}
