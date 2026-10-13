import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Health check for the host: the app is up and can reach the database.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
