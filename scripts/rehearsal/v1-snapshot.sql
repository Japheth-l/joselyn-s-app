-- Run against a V1-schema database (the Render backup restored, or a recovered database).
-- Output: one "key|value" line per check. Read-only.
-- The same keys are produced from the V2 schema by v2-compare.sql, so `diff` shows any difference.
\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'
SELECT 'users.count', (count(*))::text FROM "User"
UNION ALL SELECT 'users.ids_md5', (md5(coalesce(string_agg(id, ',' ORDER BY id), '')))::text FROM "User"
UNION ALL SELECT 'users.login_md5', (md5(coalesce(string_agg(id || ':' || email || ':' || "passwordHash", ',' ORDER BY id), '')))::text FROM "User"
UNION ALL SELECT 'users.contact_md5', (md5(coalesce(string_agg(id || ':' || name || ':' || phone, ',' ORDER BY id), '')))::text FROM "User"
UNION ALL SELECT 'businesses.count', (count(*))::text FROM "Business"
UNION ALL SELECT 'businesses.ids_md5', (md5(coalesce(string_agg(id, ',' ORDER BY id), '')))::text FROM "Business"
UNION ALL SELECT 'businesses.owner_md5', (md5(coalesce(string_agg(id || ':' || "ownerId", ',' ORDER BY id), '')))::text FROM "Business"
UNION ALL SELECT 'businesses.location_md5', (md5(coalesce(string_agg(id || ':' || lat || ':' || lng || ':' || city, ',' ORDER BY id), '')))::text FROM "Business"
UNION ALL SELECT 'styles.count', (count(*))::text FROM "Style"
UNION ALL SELECT 'styles.ids_md5', (md5(coalesce(string_agg(id, ',' ORDER BY id), '')))::text FROM "Style"
UNION ALL SELECT 'business_styles.count', (count(*))::text FROM "BusinessStyle"
UNION ALL SELECT 'business_styles.price_minor_sum', (coalesce(sum(round(price * 100)), 0)::bigint)::text FROM "BusinessStyle"
UNION ALL SELECT 'fabric.count', (count(*))::text FROM "Material"
UNION ALL SELECT 'fabric.ids_md5', (md5(coalesce(string_agg(id, ',' ORDER BY id), '')))::text FROM "Material"
UNION ALL SELECT 'fabric.price_minor_sum', (coalesce(sum(round("pricePerYard" * 100)), 0)::bigint)::text FROM "Material"
UNION ALL SELECT 'fabric.qty_centi_sum', (coalesce(sum(round("yardsInStock" * 100)), 0)::bigint)::text FROM "Material"
UNION ALL SELECT 'orders.count', (count(*))::text FROM "Order"
UNION ALL SELECT 'orders.ids_md5', (md5(coalesce(string_agg(id, ',' ORDER BY id), '')))::text FROM "Order"
UNION ALL SELECT 'orders.customer_md5', (md5(coalesce(string_agg(id || ':' || "clientId", ',' ORDER BY id), '')))::text FROM "Order"
UNION ALL SELECT 'orders.business_md5', (md5(coalesce(string_agg(id || ':' || "businessId", ',' ORDER BY id), '')))::text FROM "Order"
UNION ALL SELECT 'orders.paid.count', (count(*))::text FROM "Order" WHERE "paymentStatus" = 'PAID'
UNION ALL SELECT 'orders.paid.total_minor_sum', (coalesce(sum(round(total * 100)), 0)::bigint)::text FROM "Order" WHERE "paymentStatus" = 'PAID'
UNION ALL SELECT 'orders.paid.refs_md5', (md5(coalesce(string_agg(id || ':' || coalesce("paymentRef", 'LEGACY-' || id), ',' ORDER BY id), '')))::text FROM "Order" WHERE "paymentStatus" = 'PAID'
UNION ALL SELECT 'orders.with_measurements', (count(*))::text FROM "Order" WHERE measurements IS NOT NULL
UNION ALL SELECT 'payouts.count', (count(*))::text FROM "Payout"
UNION ALL SELECT 'payouts.ids_md5', (md5(coalesce(string_agg(id || ':' || "userId" || ':' || "orderId" || ':' || role || ':' || status, ',' ORDER BY id), '')))::text FROM "Payout"
UNION ALL SELECT 'payouts.amount_minor_sum', (coalesce(sum(round(amount * 100)), 0)::bigint)::text FROM "Payout"
UNION ALL SELECT 'payouts.unpaid_minor_sum', (coalesce(sum(round(amount * 100)) FILTER (WHERE status <> 'PAID'), 0)::bigint)::text FROM "Payout"
UNION ALL SELECT 'reviews.count', (count(*))::text FROM "Review"
UNION ALL SELECT 'reviews.md5', (md5(coalesce(string_agg(id || ':' || "orderId" || ':' || "businessId" || ':' || "clientId" || ':' || rating, ',' ORDER BY id), '')))::text FROM "Review"
UNION ALL SELECT 'notifications.count', (count(*))::text FROM "Notification"
UNION ALL SELECT 'notifications.ids_md5', (md5(coalesce(string_agg(id, ',' ORDER BY id), '')))::text FROM "Notification"
UNION ALL SELECT 'photos.count', (count(*))::text FROM "BusinessPhoto"
UNION ALL SELECT 'photos.md5', (md5(coalesce(string_agg(id || ':' || url, ',' ORDER BY id), '')))::text FROM "BusinessPhoto"
ORDER BY 1;
