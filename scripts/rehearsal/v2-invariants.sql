-- Run against the MIGRATED (V2) database. Read-only. Every line must end in PASS (INFO lines are context).
\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'
WITH c(name, value, ok) AS (
  SELECT 'migrations.applied', (SELECT string_agg(migration_name, ',' ORDER BY migration_name) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),
         (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name IN ('0000_baseline','0001_v2')) = 2
  UNION ALL SELECT 'migrations.unfinished', (SELECT count(*)::text FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL),
         (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) = 0
  UNION ALL SELECT 'ledger.total_equals_successful_payments',
         (SELECT coalesce(sum("amountMinor"),0) FROM "LedgerEntry")::text || ' vs ' || (SELECT coalesce(sum("amountMinor"),0) FROM "Payment" WHERE status = 'SUCCEEDED')::text,
         (SELECT coalesce(sum("amountMinor"),0) FROM "LedgerEntry") = (SELECT coalesce(sum("amountMinor"),0) FROM "Payment" WHERE status = 'SUCCEEDED')
  UNION ALL SELECT 'orders.amount_paid_matches_payments', (SELECT count(*)::text FROM "Order" o WHERE o."amountPaidMinor" <> (SELECT coalesce(sum(p."amountMinor"),0) FROM "Payment" p WHERE p."orderId" = o.id AND p.status = 'SUCCEEDED')),
         NOT EXISTS (SELECT 1 FROM "Order" o WHERE o."amountPaidMinor" <> (SELECT coalesce(sum(p."amountMinor"),0) FROM "Payment" p WHERE p."orderId" = o.id AND p.status = 'SUCCEEDED'))
  UNION ALL SELECT 'ledger.no_negative_customer_funds', (SELECT count(*)::text FROM (SELECT "orderId" FROM "LedgerEntry" WHERE account = 'CUSTOMER_FUNDS' GROUP BY 1 HAVING sum("amountMinor") < 0) x),
         NOT EXISTS (SELECT 1 FROM "LedgerEntry" WHERE account = 'CUSTOMER_FUNDS' GROUP BY "orderId" HAVING sum("amountMinor") < 0)
  UNION ALL SELECT 'ledger.payables_have_party', (SELECT count(*)::text FROM "LedgerEntry" WHERE account = 'PARTNER_PAYABLE' AND ("partyId" IS NULL OR "partyType" IS NULL)),
         NOT EXISTS (SELECT 1 FROM "LedgerEntry" WHERE account = 'PARTNER_PAYABLE' AND ("partyId" IS NULL OR "partyType" IS NULL))
  UNION ALL SELECT 'ledger.no_negative_partner_balance', (SELECT count(*)::text FROM (SELECT 1 FROM "LedgerEntry" WHERE account = 'PARTNER_PAYABLE' GROUP BY "partyType","partyId" HAVING sum("amountMinor") < 0) x),
         NOT EXISTS (SELECT 1 FROM "LedgerEntry" WHERE account = 'PARTNER_PAYABLE' GROUP BY "partyType","partyId" HAVING sum("amountMinor") < 0)
  UNION ALL SELECT 'ledger.no_negative_platform_revenue_entries', (SELECT count(*)::text FROM "LedgerEntry" WHERE account = 'PLATFORM_REVENUE' AND "amountMinor" < 0),
         NOT EXISTS (SELECT 1 FROM "LedgerEntry" WHERE account = 'PLATFORM_REVENUE' AND "amountMinor" < 0)
  UNION ALL SELECT 'orders.every_order_has_quotation', (SELECT count(*)::text FROM "Order" o WHERE NOT EXISTS (SELECT 1 FROM "Quotation" q WHERE q."orderId" = o.id)),
         NOT EXISTS (SELECT 1 FROM "Order" o WHERE NOT EXISTS (SELECT 1 FROM "Quotation" q WHERE q."orderId" = o.id))
  UNION ALL SELECT 'orders.accepted_quote_lines_sum_to_total', (SELECT count(*)::text FROM "Quotation" q WHERE q.status = 'ACCEPTED' AND q."totalMinor" <> (SELECT coalesce(sum(l."amountMinor"),0) FROM "QuotationLine" l WHERE l."quotationId" = q.id)),
         NOT EXISTS (SELECT 1 FROM "Quotation" q WHERE q.status = 'ACCEPTED' AND q."totalMinor" <> (SELECT coalesce(sum(l."amountMinor"),0) FROM "QuotationLine" l WHERE l."quotationId" = q.id))
  UNION ALL SELECT 'orders.status_is_v2', (SELECT count(*)::text FROM "Order" WHERE status NOT IN ('QUOTE_REQUESTED','QUOTED','AWAITING_PAYMENT','AWAITING_MEASUREMENTS','MEASUREMENTS_CONFIRMED','IN_PRODUCTION','QUALITY_CHECK','READY','DELIVERY_ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED','COLLECTED','COMPLETED','CANCELLED','DISPUTED','REFUNDED')),
         NOT EXISTS (SELECT 1 FROM "Order" WHERE status NOT IN ('QUOTE_REQUESTED','QUOTED','AWAITING_PAYMENT','AWAITING_MEASUREMENTS','MEASUREMENTS_CONFIRMED','IN_PRODUCTION','QUALITY_CHECK','READY','DELIVERY_ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED','COLLECTED','COMPLETED','CANCELLED','DISPUTED','REFUNDED'))
  UNION ALL SELECT 'orders.migration_event_per_order', (SELECT count(*)::text FROM "Order" o WHERE NOT EXISTS (SELECT 1 FROM "OrderEvent" e WHERE e."orderId" = o.id AND e.type = 'MIGRATED')),
         NOT EXISTS (SELECT 1 FROM "Order" o WHERE NOT EXISTS (SELECT 1 FROM "OrderEvent" e WHERE e."orderId" = o.id AND e.type = 'MIGRATED'))
  UNION ALL SELECT 'users.every_user_is_customer', (SELECT count(*)::text FROM "User" u WHERE NOT EXISTS (SELECT 1 FROM "RoleAssignment" r WHERE r."userId" = u.id AND r.role = 'CUSTOMER')),
         NOT EXISTS (SELECT 1 FROM "User" u WHERE NOT EXISTS (SELECT 1 FROM "RoleAssignment" r WHERE r."userId" = u.id AND r.role = 'CUSTOMER'))
  UNION ALL SELECT 'users.admins', (SELECT count(*)::text FROM "RoleAssignment" WHERE role = 'ADMIN'), (SELECT count(*) FROM "RoleAssignment" WHERE role = 'ADMIN') > 0
  UNION ALL SELECT 'businesses.exactly_one_owner', (SELECT count(*)::text FROM "Business" b WHERE (SELECT count(*) FROM "Membership" m WHERE m."businessId" = b.id AND m.role = 'OWNER') <> 1),
         NOT EXISTS (SELECT 1 FROM "Business" b WHERE (SELECT count(*) FROM "Membership" m WHERE m."businessId" = b.id AND m.role = 'OWNER') <> 1)
  UNION ALL SELECT 'businesses.rating_from_reviews', (SELECT count(*)::text FROM "Business" b WHERE b."reviewCount" <> (SELECT count(*) FROM "Review" r WHERE r."businessId" = b.id)),
         NOT EXISTS (SELECT 1 FROM "Business" b WHERE b."reviewCount" <> (SELECT count(*) FROM "Review" r WHERE r."businessId" = b.id))
  UNION ALL SELECT 'fabric.stock_matches_movements', (SELECT count(*)::text FROM "FabricListing" f WHERE f."qtyOnHandCenti" <> (SELECT coalesce(sum(m."qtyCenti"),0) FROM "InventoryMovement" m WHERE m."listingId" = f.id AND m.type = 'RESTOCK')),
         NOT EXISTS (SELECT 1 FROM "FabricListing" f WHERE f."qtyOnHandCenti" <> (SELECT coalesce(sum(m."qtyCenti"),0) FROM "InventoryMovement" m WHERE m."listingId" = f.id AND m.type = 'RESTOCK'))
  UNION ALL SELECT 'orders.measurement_record_linked', (SELECT count(*)::text FROM "Order" o WHERE o."measurementRecordId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MeasurementRecord" r WHERE r.id = o."measurementRecordId")),
         NOT EXISTS (SELECT 1 FROM "Order" o WHERE o."measurementRecordId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MeasurementRecord" r WHERE r.id = o."measurementRecordId"))
  UNION ALL SELECT 'info.orders_by_status', (SELECT string_agg(status || '=' || n, ',' ORDER BY status) FROM (SELECT status, count(*) n FROM "Order" GROUP BY 1) s), NULL
  UNION ALL SELECT 'info.ledger_by_account', (SELECT string_agg(account || '=' || n, ',' ORDER BY account) FROM (SELECT account, sum("amountMinor") n FROM "LedgerEntry" GROUP BY 1) s), NULL
)
SELECT name, coalesce(value, ''), CASE WHEN ok IS NULL THEN 'INFO' WHEN ok THEN 'PASS' ELSE 'FAIL' END FROM c ORDER BY 1;
