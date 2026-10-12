import "server-only";

/** Convert a Ghanaian number like 024 123 4567 or +233241234567 to 233241234567. */
export function toInternational(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("233")) return digits;
  if (digits.startsWith("0")) return "233" + digits.slice(1);
  return digits;
}

/**
 * Send an SMS through Arkesel. Without ARKESEL_API_KEY the message is only logged,
 * so development and demos work without an SMS account. Never throws: a failed SMS
 * must not break the action that triggered it.
 */
export async function sendSms(phone: string, message: string) {
  const apiKey = process.env.ARKESEL_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== "test") console.log(`[sms:demo] to ${toInternational(phone)}: ${message}`);
    return;
  }
  try {
    const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: (process.env.SMS_SENDER_ID || "Ntoma").slice(0, 11),
        message,
        recipients: [toInternational(phone)],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`[sms] Arkesel returned ${res.status}: ${await res.text()}`);
  } catch (err) {
    console.error("[sms] send failed", err);
  }
}
