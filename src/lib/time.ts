// All dates display in Ghana time (GMT, no daylight saving).
export const TIME_ZONE = "Africa/Accra";

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GH", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GH", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatTime(d: Date | string) {
  return new Date(d).toLocaleTimeString("en-GH", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
}

/** "2026-10-14T10:00" typed in a datetime-local input means Accra time, which is UTC. */
export function parseLocalDateTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(value + ":00Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseLocalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toLocalInput(d: Date) {
  return d.toISOString().slice(0, 16);
}

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}

export function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
