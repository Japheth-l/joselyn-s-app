import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Record a sensitive action. Never pass passwords, tokens, payment secrets or measurement values in `data`.
 */
export async function audit(
  actorId: string | null,
  action: string,
  entity: { type: string; id: string },
  data: Record<string, unknown> = {},
  tx: Tx = db,
) {
  await tx.auditEvent.create({
    data: { actorId, action, entityType: entity.type, entityId: entity.id, data: data as Prisma.InputJsonValue },
  });
}
