import { db } from "@/lib/db";
import { AppError } from "./errors";

/**
 * Fixed-window rate limit stored in PostgreSQL, so it holds across server instances.
 * Throws when `key` has been used more than `limit` times in `windowSeconds`.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart") VALUES (${key}, 1, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < NOW() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < NOW() - make_interval(secs => ${windowSeconds}) THEN NOW() ELSE "RateLimit"."windowStart" END
    RETURNING "count"`;
  if (rows[0].count > limit) {
    throw new AppError("Too many attempts. Please wait a few minutes and try again.", "RATE_LIMITED");
  }
}
