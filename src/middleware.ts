import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/server/session";

// Fast redirect to login for signed-in areas. This is a convenience only: every page and action
// re-checks the session (including revocation and suspension) against the database.
const PRIVATE_PREFIXES = ["/account", "/orders", "/order", "/measurements", "/notifications", "/support", "/settings", "/biz", "/pro", "/admin", "/files", "/pay/sandbox"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  const url = new URL("/login", req.url);
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|uploads/|.*\\.(?:png|svg|jpg|ico|webmanifest|js)$).*)"],
};
