import "server-only";

// Small helpers for reading FormData in server actions. Validation happens in the services.
export const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
export const optStr = (fd: FormData, key: string) => {
  const v = str(fd, key);
  return v === "" ? undefined : v;
};
export const optNum = (fd: FormData, key: string) => {
  const v = str(fd, key);
  if (v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
export const bool = (fd: FormData, key: string) => ["on", "true", "1", "yes"].includes(str(fd, key));
export const list = (fd: FormData, key: string) => fd.getAll(key).map(String).filter(Boolean);

/** Client IP for rate limiting (Render and most proxies set x-forwarded-for). */
export async function clientIp() {
  const { headers } = await import("next/headers");
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

/** Only allow same-site relative redirects (no //evil.com). */
export function safeNext(next: string | null | undefined, fallback = "/account") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
