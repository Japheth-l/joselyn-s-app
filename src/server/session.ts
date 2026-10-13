import { SignJWT, jwtVerify } from "jose";

// Edge-safe helpers, also used by middleware. The token carries the user's session version so
// bumping User.sessionVersion revokes every existing session.
export const SESSION_COOKIE = "ntoma_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

export type SessionClaims = { userId: string; sv: number };

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims) {
  return new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${SESSION_MAX_AGE}s`).sign(key());
}

export async function readSession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (typeof payload.userId !== "string" || typeof payload.sv !== "number") return null;
    return { userId: payload.userId, sv: payload.sv };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE,
};
