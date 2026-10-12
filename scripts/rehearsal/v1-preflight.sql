-- Run against a RESTORED COPY of the V1 database before migrating it. Read-only.
-- Each line is "check|count|verdict". FAIL = the 0001_v2 migration will abort on this data (it is all-or-nothing,
-- so production would be left unchanged, but the deploy would fail). REVIEW = the migration succeeds but the
-- result needs a human decision. All checks should read OK on the real backup before merging PR #2.
\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'
WITH checks(name, n, bad) AS (
  -- V1 used `prisma db push`, so normally there is no migration history yet. After a failed V2 attempt the history
  -- exists with 0001_v2 unfinished/rolled back, which is fine. FAIL only if 0001_v2 already completed.
  SELECT 'v1.not_already_migrated',
    CASE WHEN to_regclass('public."_prisma_migrations"') IS NULL THEN 0
         ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM "_prisma_migrations" WHERE migration_name = ''0001_v2'' AND finished_at IS NOT NULL AND rolled_back_at IS NULL', false, true, '')))[1]::text::int END,
    'FAIL'
  UNION ALL SELECT 'info.migration_history_present', (to_regclass('public."_prisma_migrations"') IS NOT NULL)::int, 'INFO'
  -- Measurements are cast with ::JSONB and each value with ::NUMERIC; anything else aborts the migration.
  UNION ALL SELECT 'orders.measurements_invalid_json', count(*), 'FAIL' FROM "Order"
    WHERE measurements IS NOT NULL AND NOT pg_input_is_valid(measurements, 'jsonb')
  UNION ALL SELECT 'orders.measurements_not_object', count(*), 'FAIL' FROM "Order"
    WHERE measurements IS NOT NULL AND pg_input_is_valid(measurements, 'jsonb') AND jsonb_typeof(measurements::jsonb) <> 'object'
  UNION ALL SELECT 'orders.measurements_non_numeric', count(*), 'FAIL' FROM "Order" o,
    LATERAL jsonb_each_text(CASE WHEN pg_input_is_valid(o.measurements, 'jsonb') AND jsonb_typeof(o.measurements::jsonb) = 'object' THEN o.measurements::jsonb ELSE '{}'::jsonb END) e(k, v)
    WHERE NOT pg_input_is_valid(e.v, 'numeric')
  -- Generated slugs must be unique (unique index created by the migration).
  UNION ALL SELECT 'businesses.slug_collisions', count(*) - count(DISTINCT trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))) || '-' || right(id, 4)), 'FAIL' FROM "Business"
  UNION ALL SELECT 'styles.slug_collisions', count(*) - count(DISTINCT trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))) || '-' || right(id, 4)), 'FAIL' FROM "Style"
  -- Values the migration doesn't know how to map.
  UNION ALL SELECT 'orders.unknown_status', count(*), 'FAIL' FROM "Order"
    WHERE status NOT IN ('PLACED','AWAITING_MEASUREMENT','MEASURED','SEWING','READY','OUT_FOR_DELIVERY','COMPLETED','DECLINED','CANCELLED')
  UNION ALL SELECT 'orders.unknown_payment_status', count(*), 'FAIL' FROM "Order" WHERE "paymentStatus" NOT IN ('PAID','UNPAID')
  UNION ALL SELECT 'orders.unknown_kind', count(*), 'FAIL' FROM "Order" WHERE kind NOT IN ('SEW','FABRIC')
  UNION ALL SELECT 'users.unknown_role', count(*), 'FAIL' FROM "User" WHERE role NOT IN ('CLIENT','BUSINESS','MEASURER','RIDER','ADMIN')
  UNION ALL SELECT 'styles.unknown_category_goes_to_other', count(*), 'REVIEW' FROM "Style"
    WHERE category NOT IN ('DRESS','KABA_AND_SLIT','SHIRT','SUIT','SMOCK','TRADITIONAL','KIDS')
  -- Money cases that migrate but need a decision.
  UNION ALL SELECT 'orders.paid_but_cancelled_or_declined', count(*), 'REVIEW' FROM "Order"
    WHERE "paymentStatus" = 'PAID' AND status IN ('CANCELLED','DECLINED','PLACED')
  UNION ALL SELECT 'orders.total_not_sum_of_parts', count(*), 'REVIEW' FROM "Order"
    WHERE round(total * 100) <> round("laborPrice" * 100) + round("materialPrice" * 100) + round("measurementFee" * 100) + round("deliveryFee" * 100)
  UNION ALL SELECT 'orders.non_positive_paid_total', count(*), 'REVIEW' FROM "Order" WHERE "paymentStatus" = 'PAID' AND total <= 0
  UNION ALL SELECT 'payouts.business_owner_has_no_business', count(*), 'FAIL' FROM "Payout" p
    WHERE p.role = 'BUSINESS' AND NOT EXISTS (SELECT 1 FROM "Business" b WHERE b."ownerId" = p."userId")
  UNION ALL SELECT 'payouts.unknown_role', count(*), 'FAIL' FROM "Payout" WHERE role NOT IN ('BUSINESS','MEASURER','RIDER')
  UNION ALL SELECT 'payouts.exceed_order_payment', count(*), 'REVIEW' FROM (
      SELECT o.id FROM "Order" o JOIN "Payout" p ON p."orderId" = o.id
      GROUP BY o.id, o.total, o."paymentStatus"
      HAVING o."paymentStatus" <> 'PAID' OR sum(round(p.amount * 100)) > round(o.total * 100)) x
  UNION ALL SELECT 'payouts.on_unpaid_or_open_order', count(*), 'REVIEW' FROM "Payout" p JOIN "Order" o ON o.id = p."orderId"
    WHERE o.status <> 'COMPLETED' OR o."paymentStatus" <> 'PAID'
  -- Informational counts.
  UNION ALL SELECT 'info.users', count(*), 'INFO' FROM "User"
  UNION ALL SELECT 'info.orders', count(*), 'INFO' FROM "Order"
  UNION ALL SELECT 'info.demo_accounts_(@demo.gh)', count(*), 'INFO' FROM "User" WHERE email LIKE '%@demo.gh'
)
SELECT name, n, CASE WHEN bad = 'INFO' THEN 'INFO' WHEN n = 0 THEN 'OK' ELSE bad END FROM checks ORDER BY 1;
