// Outbound channels. Each returns what actually happened; "SENT" means the provider accepted the message,
// not that the person received it.

export type ChannelResult = { status: "SENT" | "FAILED" | "SKIPPED"; providerMessageId?: string; error?: string };

export function toGhanaInternational(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("233")) return digits;
  if (digits.startsWith("0")) return "233" + digits.slice(1);
  return digits;
}

export async function sendSms(phone: string, text: string): Promise<ChannelResult> {
  const key = process.env.ARKESEL_API_KEY;
  if (!key) return { status: "SKIPPED", error: "SMS provider not configured" };
  try {
    const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ sender: (process.env.SMS_SENDER_ID || "Ntoma").slice(0, 11), message: text, recipients: [toGhanaInternational(phone)] }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.status !== "success") return { status: "FAILED", error: String(json.message ?? res.status).slice(0, 200) };
    return { status: "SENT", providerMessageId: json.data?.[0]?.id ? String(json.data[0].id) : undefined };
  } catch (e) {
    return { status: "FAILED", error: e instanceof Error ? e.message.slice(0, 200) : "SMS failed" };
  }
}

export async function sendEmail(to: string, subject: string, text: string): Promise<ChannelResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { status: "SKIPPED", error: "Email provider not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "FAILED", error: String(json.message ?? res.status).slice(0, 200) };
    return { status: "SENT", providerMessageId: json.id };
  } catch (e) {
    return { status: "FAILED", error: e instanceof Error ? e.message.slice(0, 200) : "Email failed" };
  }
}

/** WhatsApp needs a Meta WhatsApp Business account and approved templates; not configured yet. */
export async function sendWhatsApp(): Promise<ChannelResult> {
  return { status: "SKIPPED", error: "WhatsApp is not configured" };
}
