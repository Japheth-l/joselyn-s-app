import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runMaintenance } from "@/server/services/maintenance";

// Run every 15 minutes by a scheduler (e.g. a Render cron job):
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("CRON_SECRET is not set", { status: 503 });
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await runMaintenance());
}
