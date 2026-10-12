import { db } from "@/lib/db";

// Default wording for every notification. Administrators can override any of them (NotificationTemplate).
// Placeholders use {{name}}.
export const TEMPLATES = {
  "quote.requested": "New quote request #{{order}}: {{item}}. Reply with your price and completion date.",
  "quote.submitted": "{{business}} sent a quote of {{amount}} for order #{{order}}. Compare and accept it in the app.",
  "quote.declined": "{{business}} can't take order #{{order}}.",
  "quote.accepted": "Your quote for order #{{order}} was accepted. We'll tell you when payment arrives.",
  "quote.revision": "{{business}} proposed a change to order #{{order}}: new total {{amount}}. Nothing changes unless you approve it.",
  "quote.revision.approved": "The customer approved your revised quote for order #{{order}}.",
  "quote.revision.rejected": "The customer kept the original quote for order #{{order}}.",
  "payment.received": "Payment of {{amount}} received for order #{{order}}. Thank you!",
  "payment.received.business": "Order #{{order}} has been paid ({{amount}}).",
  "order.cancelled": "Order #{{order}} was cancelled. {{reason}}",
  "order.status": "Order #{{order}}: {{status}}.",
  "order.ready.choose": "Order #{{order}} is ready. Choose delivery or pickup in the app.",
  "order.ready.pickup": "Order #{{order}} is ready to collect at {{business}}, {{address}}. Show code {{code}} when you collect it.",
  "order.delivery.code": "Your delivery code for order #{{order}} is {{code}}. Give it to the rider only when you receive your item.",
  "order.completed": "Order #{{order}} is complete. Please leave a review!",
  "appointment.requested": "New measurement visit near you: {{when}}. Fee {{amount}}.",
  "appointment.accepted": "{{name}} will come to measure you on {{when}}. Phone: {{phone}}.",
  "appointment.failed": "Your measurement visit for order #{{order}} didn't happen: {{reason}}. Please book a new time.",
  "measurements.submitted": "Measurements for order #{{order}} are ready for you to review.",
  "delivery.available": "New delivery near you: {{fee}}.",
  "delivery.accepted": "{{name}} will deliver order #{{order}}. Phone: {{phone}}.",
  "delivery.failed": "Delivery of order #{{order}} failed: {{reason}}.",
  "message.new": "New message about order #{{order}} from {{name}}.",
  "dispute.opened": "A dispute was opened on order #{{order}}. Our team will review it.",
  "dispute.updated": "Update on dispute #{{dispute}}: {{status}}.",
  "refund.processed": "A refund of {{amount}} for order #{{order}} has been processed.",
  "verification.decided": "Your {{subject}} verification: {{status}}. {{note}}",
  "payout.sent": "We've sent you {{amount}} by Mobile Money (ref {{reference}}).",
  "review.received": "{{business}} received a {{rating}}★ review.",
  "support.reply": "We've replied to your support request: {{subject}}.",
} as const;
export type TemplateKey = keyof typeof TEMPLATES;

export async function renderTemplate(key: TemplateKey, vars: Record<string, string | number>) {
  const override = await db.notificationTemplate.findUnique({ where: { key } });
  const text = override?.body ?? TEMPLATES[key];
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] == null ? "" : String(vars[k]))).replace(/\s+/g, " ").trim();
}
