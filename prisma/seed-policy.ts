// What the seed script is allowed to write, kept apart from seed.ts so it can be unit-tested.
//
// • Demo users and businesses are only ever written to a database on this machine (localhost or a Unix socket).
// • An administrator for any other database needs ADMIN_EMAIL and ADMIN_PASSWORD set explicitly; there is no
//   fallback password. The development defaults below apply to local databases only.

export const DEV_ADMIN_EMAIL = "admin@ntoma.example";
export const DEV_ADMIN_PASSWORD = "local-admin-password";
export const MIN_ADMIN_PASSWORD_LENGTH = 12;
const KNOWN_PASSWORDS = new Set([DEV_ADMIN_PASSWORD, "demo-password", "password", "changeme", "admin"]);

// A refusal by policy: printed as a one-line message, not a stack trace.
export class SeedRefused extends Error {}

export function isLocalDatabase(url: string | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  // A host query parameter overrides the host in the URL; only a Unix socket path counts as local.
  const override = parsed.searchParams.get("host");
  if (override !== null && !override.startsWith("/")) return false;
  const host = parsed.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export type AdminCredentials = { email: string; password: string; source: "environment" | "development default" };

// Returns the administrator to create, or throws with every problem found. Never includes the password in a message.
export function adminCredentials(env: Record<string, string | undefined>, opts: { explicitRequired: boolean }): AdminCredentials {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const password = env.ADMIN_PASSWORD ?? "";
  if (!opts.explicitRequired) {
    return {
      email: email || DEV_ADMIN_EMAIL,
      password: password || DEV_ADMIN_PASSWORD,
      source: password ? "environment" : "development default",
    };
  }
  const problems: string[] = [];
  if (!email) problems.push("ADMIN_EMAIL is not set");
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push("ADMIN_EMAIL is not an email address");
  else if (email === DEV_ADMIN_EMAIL) problems.push(`ADMIN_EMAIL must not be the development address ${DEV_ADMIN_EMAIL}`);
  if (!password) problems.push("ADMIN_PASSWORD is not set");
  else if (password.length < MIN_ADMIN_PASSWORD_LENGTH) problems.push(`ADMIN_PASSWORD is shorter than ${MIN_ADMIN_PASSWORD_LENGTH} characters`);
  else if (KNOWN_PASSWORDS.has(password.toLowerCase()) || password.toLowerCase() === email) problems.push("ADMIN_PASSWORD is a known default");
  if (problems.length) throw new SeedRefused(`Administrator credentials rejected: ${problems.join("; ")}.`);
  return { email, password, source: "environment" };
}
