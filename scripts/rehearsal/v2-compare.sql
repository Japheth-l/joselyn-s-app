-- Run against the MIGRATED (V2) database. Produces the same keys as v1-snapshot.sql, computed from the
-- V2 tables, so `diff v1-snapshot.txt v2-compare.txt` must print nothing. Read-only.
\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'
SELECT 'users.count', (count(*))::text FROM "User"
UNION ALL SELECT 'users.ids_md5', (md5(coalesce(string_agg(id, ',' ORDER BY id), '')))::text FROM "User"
UNION ALL SELECT 'users.login_md5', (md5(coalesce(string_agg(id || ':' || email || ':' || "passwordHash", ',' ORDER BY id), '')))::text FROM "User"
UNION ALL SELECT 'users.contact_md5', (md5(coalesce(string_agg(id || ':' || name || ':' || phone, ',' ORDER BY id), '')))::text FROM "User"
UNION ALL SELECT 'businesses.count', (count(*))::text FROM "Business"
UNION ALL SELECT 'businesses.ids_md5', (md5(coalesce(string_agg(id, ',' ORDER BY id), '')))::text FROM "Business"
UNION ALL SELECT 'businesses.owner_md5', (md5(coalesce(string_agg(b.id || ':' || m."userId", ',' ORDER BY b.id), '')))::text FROM "Business" b JOIN "Membership" m ON m."businessId" = b.id AND m.role = 'OWNER'
UNION ALL SELECT 'businesses.location_md5', (md5(coalesce(string_agg(id || ':' || lat || ':' || lng || ':' || city, ',' ORDER BY id), '')))::text FROM "Business"
UNION ALL SELECT 'styles.count', (count(*))::text FROM "Style"
UNION ALL SELECT 'styles.ids_md5', (md5(coalesce(string_agg(id, ',' ORDER BY id), '')))::text FROM "Style"
UNION ALL SELECT 'business_styles.count', (count(*))::text FROM "BusinessStyle"
UNION ALL SELECT 'business_styles.price_minor_sum', (coalesce(sum("priceMinor"), 0)::bigint)::text FROM "BusinessStyle"
UNION ALL SELECT 'fabric.count', (count(*))::text FROM "FabricListing"
UNION ALL SELECT 'fabric.ids_md5', (md5(coalesce(string_agg(id, ',' ORDER BY id), '')))::text FROM "FabricListing"
UNION ALL SELECT 'fabric.price_minor_sum', (coalesce(sum("pricePerUnitMinor"), 0)::bigint)::text FROM "FabricListing"
UNION ALL SELECT 'fabric.qty_centi_sum', (coalesce(sum("qtyOnHandCenti"), 0)::bigint)::text FROM "FabricListing"
UNION ALL SELECT 'orders.count', (count(*))::text FROM "Order"
UNION ALL SELECT 'orders.ids_md5', (md5(coalesce(string_agg(id, ',' ORDER BY id), '')))::text FROM "Order"
UNION ALL SELECT 'orders.customer_md5', (md5(coalesce(string_agg(id || ':' || "customerId", ',' ORDER BY id), '')))::text FROM "Order"
UNION ALL SELECT 'orders.business_md5', (md5(coalesce(string_agg(id || ':' || "businessId", ',' ORDER BY id), '')))::text FROM "Order"
UNION ALL SELECT 'orders.paid.count', (count(*))::text FROM "Payment" WHERE provider = 'LEGACY' AND status = 'SUCCEEDED'
UNION ALL SELECT 'orders.paid.total_minor_sum', (coalesce(sum("amountMinor"), 0)::bigint)::text FROM "Payment" WHERE provider = 'LEGACY' AND status = 'SUCCEEDED'
UNION ALL SELECT 'orders.paid.refs_md5', (md5(coalesce(string_agg("orderId" || ':' || "providerRef", ',' ORDER BY "orderId"), '')))::text FROM "Payment" WHERE provider = 'LEGACY' AND status = 'SUCCEEDED'
UNION ALL SELECT 'orders.with_measurements', (count(*))::text FROM "MeasurementRecord" WHERE id LIKE 'mr\_%'
UNION ALL SELECT 'payouts.count', (count(*))::text FROM "LegacyPayout"
UNION ALL SELECT 'payouts.ids_md5', (md5(coalesce(string_agg(id || ':' || "userId" || ':' || "orderId" || ':' || role || ':' || status, ',' ORDER BY id), '')))::text FROM "LegacyPayout"
UNION ALL SELECT 'payouts.amount_minor_sum', (coalesce(sum(round(amount * 100)), 0)::bigint)::text FROM "LegacyPayout"
UNION ALL SELECT 'payouts.unpaid_minor_sum', (coalesce(sum("amountMinor"), 0)::bigint)::text FROM "LedgerEntry" WHERE account = 'PARTNER_PAYABLE'
UNION ALL SELECT 'reviews.count', (count(*))::text FROM "Review"
UNION ALL SELECT 'reviews.md5', (md5(coalesce(string_agg(id || ':' || "orderId" || ':' || "businessId" || ':' || "customerId" || ':' || rating, ',' ORDER BY id), '')))::text FROM "Review"
UNION ALL SELECT 'notifications.count', (count(*))::text FROM "Notification"
UNION ALL SELECT 'notifications.ids_md5', (md5(coalesce(string_agg(id, ',' ORDER BY id), '')))::text FROM "Notification"
UNION ALL SELECT 'photos.count', (count(*))::text FROM "BusinessPhoto"
UNION ALL SELECT 'photos.md5', (md5(coalesce(string_agg(id || ':' || url, ',' ORDER BY id), '')))::text FROM "BusinessPhoto"
ORDER BY 1;
