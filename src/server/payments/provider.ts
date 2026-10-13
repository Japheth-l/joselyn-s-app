// One interface for every payment provider, so the rest of the app never talks to Paystack directly.

export type PaymentCheck = {
  status: "SUCCEEDED" | "FAILED" | "PENDING";
  amountMinor: number;
  currency: string;
  /** Unique id of this confirmation, used to ignore duplicates. */
  eventKey: string;
};

export type WebhookEvent =
  | { kind: "charge"; eventKey: string; reference: string; status: "SUCCEEDED" | "FAILED"; amountMinor: number; currency: string }
  | { kind: "refund"; eventKey: string; refundRef: string; status: "SUCCEEDED" | "FAILED" }
  | { kind: "ignored"; eventKey: string };

export interface PaymentProvider {
  name: "PAYSTACK" | "SANDBOX";
  /** Shown to people so nobody mistakes sandbox for real money. */
  live: boolean;
  initialize(p: { reference: string; amountMinor: number; email: string; callbackUrl: string; metadata: Record<string, string> }): Promise<{ redirectUrl: string }>;
  verify(reference: string): Promise<PaymentCheck>;
  /** Throws if the signature is invalid. */
  parseWebhook(rawBody: string, headers: Headers): WebhookEvent;
  refund(p: { reference: string; amountMinor: number }): Promise<{ status: "PROCESSING" | "SUCCEEDED" | "FAILED"; providerRef: string | null }>;
}
