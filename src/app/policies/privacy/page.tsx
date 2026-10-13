import { BRAND } from "@/lib/brand";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy</h1>
      <p>We collect only what we need to run your orders, and we follow Ghana's Data Protection Act, 2012 (Act 843).</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> name, email, phone number, city.</li>
        <li><strong>Location:</strong> only when you tap “Use my current location” for a delivery, a home measurement visit, or to sort tailors. Sorting tailors happens on your device and isn't sent to us. A delivery or visit location is stored with that order.</li>
        <li><strong>Measurements:</strong> the measurement profiles you save or that a professional takes for you.</li>
        <li><strong>Orders and payments:</strong> what you ordered, quotes, messages, payment references and amounts. Card numbers and Mobile Money PINs go directly to the payment provider; we never receive them.</li>
        <li><strong>Verification documents</strong> for businesses and professionals, kept private and visible only to our verification team.</li>
      </ul>
      <h2>Who can see what</h2>
      <ul>
        <li>A business sees your name, phone and the measurements for an order you placed with it. It never sees your budget or your address.</li>
        <li>A measurement professional or rider sees your address and phone only after accepting your job, and only for that job.</li>
        <li>Our staff see what they need for their role (for example, dispute staff see dispute evidence). Their sensitive actions are logged.</li>
        <li>We do not sell your data or show your location publicly.</li>
      </ul>
      <h2>Services we use</h2>
      <p>Payment processing (Paystack), SMS (Arkesel), email (Resend), file storage and hosting. They process data only to provide their service to {BRAND.name}.</p>
      <h2>Your rights</h2>
      <ul>
        <li>Download everything we hold about you from Settings → Privacy.</li>
        <li>Correct your details in Settings, and delete measurement profiles at any time.</li>
        <li>Delete your account from Settings. Your personal details are removed; order and payment records are kept without your name because the law requires financial records to be retained.</li>
      </ul>
      <p>Questions: {BRAND.supportEmail}</p>
    </>
  );
}
