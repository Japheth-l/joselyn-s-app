import type { Prisma } from "@prisma/client";
import { conflict, invalid, notFound } from "./errors";

type Tx = Prisma.TransactionClient;
type Row = { qtyOnHandCenti: number; qtyReservedCenti: number };

// All stock changes go through these functions. Each is a single conditional SQL statement, so two
// concurrent orders can never take the same stock, and each writes an InventoryMovement row.

async function movement(tx: Tx, listingId: string, type: string, qtyCenti: number, row: Row, orderId: string | null, actorId: string | null, note = "") {
  await tx.inventoryMovement.create({
    data: { listingId, type, qtyCenti, onHandAfter: row.qtyOnHandCenti, reservedAfter: row.qtyReservedCenti, orderId, actorId, note },
  });
}

/** Reserve stock for an order. Throws CONFLICT when not enough is available. */
export async function reserveStock(tx: Tx, p: { listingId: string; qtyCenti: number; orderId: string; actorId: string | null; expiresAt: Date | null }) {
  if (!Number.isInteger(p.qtyCenti) || p.qtyCenti <= 0) throw invalid("Choose a quantity above zero.");
  const rows = await tx.$queryRaw<Row[]>`
    UPDATE "FabricListing" SET "qtyReservedCenti" = "qtyReservedCenti" + ${p.qtyCenti}, "updatedAt" = NOW()
    WHERE "id" = ${p.listingId} AND "status" = 'ACTIVE' AND "qtyOnHandCenti" - "qtyReservedCenti" >= ${p.qtyCenti}
    RETURNING "qtyOnHandCenti", "qtyReservedCenti"`;
  if (rows.length === 0) throw conflict("Sorry, there isn't enough of that fabric left. Please choose a smaller quantity or another fabric.");
  await movement(tx, p.listingId, "RESERVE", p.qtyCenti, rows[0], p.orderId, p.actorId);
  return tx.fabricReservation.create({ data: { listingId: p.listingId, orderId: p.orderId, qtyCenti: p.qtyCenti, expiresAt: p.expiresAt } });
}

/** Release an active reservation (cancelled, declined or expired order). No-op if already released or consumed. */
export async function releaseReservation(tx: Tx, reservationId: string, actorId: string | null, note = "") {
  const claimed = await tx.fabricReservation.updateMany({ where: { id: reservationId, status: "ACTIVE" }, data: { status: "RELEASED" } });
  if (claimed.count === 0) return;
  const r = await tx.fabricReservation.findUniqueOrThrow({ where: { id: reservationId } });
  const rows = await tx.$queryRaw<Row[]>`
    UPDATE "FabricListing" SET "qtyReservedCenti" = "qtyReservedCenti" - ${r.qtyCenti}, "updatedAt" = NOW()
    WHERE "id" = ${r.listingId} RETURNING "qtyOnHandCenti", "qtyReservedCenti"`;
  await movement(tx, r.listingId, "RELEASE", r.qtyCenti, rows[0], r.orderId, actorId, note);
}

/** Turn an active reservation into a stock deduction (fabric is cut or handed over). */
export async function consumeReservation(tx: Tx, reservationId: string, actorId: string | null) {
  const claimed = await tx.fabricReservation.updateMany({ where: { id: reservationId, status: "ACTIVE" }, data: { status: "CONSUMED" } });
  if (claimed.count === 0) return;
  const r = await tx.fabricReservation.findUniqueOrThrow({ where: { id: reservationId } });
  const rows = await tx.$queryRaw<Row[]>`
    UPDATE "FabricListing" SET "qtyOnHandCenti" = "qtyOnHandCenti" - ${r.qtyCenti}, "qtyReservedCenti" = "qtyReservedCenti" - ${r.qtyCenti}, "updatedAt" = NOW()
    WHERE "id" = ${r.listingId} RETURNING "qtyOnHandCenti", "qtyReservedCenti"`;
  await movement(tx, r.listingId, "DEDUCT", r.qtyCenti, rows[0], r.orderId, actorId);
}

export async function releaseOrderReservations(tx: Tx, orderId: string, actorId: string | null, note = "") {
  const active = await tx.fabricReservation.findMany({ where: { orderId, status: "ACTIVE" } });
  for (const r of active) await releaseReservation(tx, r.id, actorId, note);
}

export async function consumeOrderReservations(tx: Tx, orderId: string, actorId: string | null) {
  const active = await tx.fabricReservation.findMany({ where: { orderId, status: "ACTIVE" } });
  for (const r of active) await consumeReservation(tx, r.id, actorId);
}

/** Restock (positive) or correct (signed) the stock on hand. On-hand can never drop below what is reserved. */
export async function adjustStock(tx: Tx, p: { listingId: string; deltaCenti: number; type: "RESTOCK" | "ADJUST"; actorId: string; note: string }) {
  if (!Number.isInteger(p.deltaCenti) || p.deltaCenti === 0) throw invalid("Enter a quantity change.");
  if (p.type === "RESTOCK" && p.deltaCenti < 0) throw invalid("A restock must add stock.");
  const rows = await tx.$queryRaw<Row[]>`
    UPDATE "FabricListing" SET "qtyOnHandCenti" = "qtyOnHandCenti" + ${p.deltaCenti}, "updatedAt" = NOW()
    WHERE "id" = ${p.listingId} AND "qtyOnHandCenti" + ${p.deltaCenti} >= "qtyReservedCenti"
    RETURNING "qtyOnHandCenti", "qtyReservedCenti"`;
  if (rows.length === 0) {
    const exists = await tx.fabricListing.count({ where: { id: p.listingId } });
    if (!exists) throw notFound("That fabric listing");
    throw conflict("You can't reduce stock below the amount already reserved for orders.");
  }
  await movement(tx, p.listingId, p.type, p.deltaCenti, rows[0], null, p.actorId, p.note);
}
