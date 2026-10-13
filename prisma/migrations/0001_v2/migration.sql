-- Ntoma V2: upgrade the V1 schema in place without deleting any rows.
-- Money moves from Float cedis to integer pesewas; fabric yards to hundredths of a yard.
-- See docs/V2_ARCHITECTURE.md (Migrations) for the mapping of V1 statuses and records.

-- ── Drop V1 constraints that change ──────────────────────────────────────────

-- DropForeignKey
ALTER TABLE "Business" DROP CONSTRAINT "Business_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Material" DROP CONSTRAINT "Material_businessId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_businessId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_materialId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_measurerId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_riderId_fkey";

-- DropForeignKey
ALTER TABLE "Payout" DROP CONSTRAINT "Payout_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Payout" DROP CONSTRAINT "Payout_userId_fkey";

-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_clientId_fkey";

-- DropIndex
DROP INDEX "Business_ownerId_key";

-- DropIndex
DROP INDEX "Order_paymentRef_key";

-- DropIndex
DROP INDEX "Payout_orderId_userId_key";

-- ── Keep V1 payout rows unchanged as LegacyPayout ──────────────────────────────
ALTER TABLE "Payout" RENAME TO "LegacyPayout";
ALTER TABLE "LegacyPayout" RENAME CONSTRAINT "Payout_pkey" TO "LegacyPayout_pkey";
ALTER TABLE "LegacyPayout" ALTER COLUMN "createdAt" DROP DEFAULT;
ALTER TABLE "LegacyPayout" ALTER COLUMN "status" DROP DEFAULT;

-- ── Material → FabricListing (same rows, integer money and quantities) ─────────
ALTER TABLE "Material" RENAME TO "FabricListing";
ALTER TABLE "FabricListing" RENAME CONSTRAINT "Material_pkey" TO "FabricListing_pkey";
ALTER TABLE "FabricListing" RENAME COLUMN "design" TO "fabricType";
ALTER TABLE "FabricListing"
  ADD COLUMN "pattern" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "colorName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'YARD',
  ADD COLUMN "pricePerUnitMinor" INTEGER,
  ADD COLUMN "qtyOnHandCenti" INTEGER,
  ADD COLUMN "qtyReservedCenti" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "minOrderCenti" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "widthInches" INTEGER,
  ADD COLUMN "careNotes" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "FabricListing" SET
  "pricePerUnitMinor" = ROUND("pricePerYard" * 100)::INTEGER,
  "qtyOnHandCenti" = ROUND("yardsInStock" * 100)::INTEGER,
  "photos" = CASE WHEN "imageUrl" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY["imageUrl"] END;
ALTER TABLE "FabricListing"
  ALTER COLUMN "pricePerUnitMinor" SET NOT NULL,
  ALTER COLUMN "qtyOnHandCenti" SET NOT NULL,
  DROP COLUMN "pricePerYard",
  DROP COLUMN "yardsInStock",
  DROP COLUMN "imageUrl";

-- ── New tables ───────────────────────────────────────────────────────────────
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "ghanaCardNumber" TEXT,
    "experience" TEXT NOT NULL DEFAULT '',
    "vehicle" TEXT,
    "feeMinor" INTEGER,
    "serviceLat" DOUBLE PRECISION,
    "serviceLng" DOUBLE PRECISION,
    "serviceRadiusKm" INTEGER NOT NULL DEFAULT 15,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "addressText" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedAddress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationApplication" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "businessId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "details" JSONB NOT NULL DEFAULT '{}',
    "documentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewerId" TEXT,
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "VerificationApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GarmentCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GarmentCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StyleOption" (
    "id" TEXT NOT NULL,
    "styleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "choices" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StyleOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "qtyCenti" INTEGER NOT NULL,
    "onHandAfter" INTEGER NOT NULL,
    "reservedAfter" INTEGER NOT NULL,
    "orderId" TEXT,
    "actorId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FabricReservation" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "qtyCenti" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FabricReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "revisionOfId" TEXT,
    "totalMinor" INTEGER NOT NULL DEFAULT 0,
    "depositMinor" INTEGER NOT NULL DEFAULT 0,
    "completionDate" TIMESTAMP(3),
    "fabricQtyCenti" INTEGER,
    "fabricListingId" TEXT,
    "message" TEXT NOT NULL DEFAULT '',
    "validUntil" TIMESTAMP(3),
    "submittedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuotationLine" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuotationLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeasurementProfile" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeasurementProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeasurementRecord" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "values" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "appointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "MeasurementRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "businessId" TEXT,
    "professionalId" TEXT,
    "profileId" TEXT,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "addressText" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "feeMinor" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "failureReason" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryAssignment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "leg" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "riderId" TEXT,
    "pickupName" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "dropoffName" TEXT NOT NULL,
    "dropoffAddress" TEXT NOT NULL,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "feeMinor" INTEGER NOT NULL,
    "proofCodeHash" TEXT NOT NULL,
    "failureReason" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "provider" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "disputeId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "providerRef" TEXT,
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "partyType" TEXT,
    "partyId" TEXT,
    "orderId" TEXT,
    "paymentId" TEXT,
    "refundId" TEXT,
    "payoutId" TEXT,
    "type" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "partyType" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'MOBILE_MONEY',
    "destination" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationRead" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationRead_pkey" PRIMARY KEY ("conversationId","userId")
);

CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationTemplate" (
    "key" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "ReviewReport" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedAdminId" TEXT,
    "remedy" TEXT,
    "resolution" TEXT,
    "refundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DisputeNote" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fromStaff" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "visibility" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- ── New columns on existing tables (nullable until filled) ─────────────────────
ALTER TABLE "User"
  ADD COLUMN "city" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN "notificationPrefs" JSONB NOT NULL DEFAULT '{"sms": true, "email": true, "whatsapp": false}',
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Business"
  ADD COLUMN "capacityPerWeek" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "completedOrders" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "kinds" TEXT[],
  ADD COLUMN "offersWorkshopFitting" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "operatingHours" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "payoutPhone" TEXT,
  ADD COLUMN "serviceRadiusKm" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "BusinessStyle" ADD COLUMN "priceMinor" INTEGER;

ALTER TABLE "Notification" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'GENERAL';

ALTER TABLE "Style"
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "complexity" TEXT NOT NULL DEFAULT 'MODERATE',
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "fabricQtyCenti" INTEGER,
  ADD COLUMN "indicativeLabourMinor" INTEGER,
  ADD COLUMN "measurementKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "occasions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "submittedByBusinessId" TEXT;

ALTER TABLE "Review"
  ADD COLUMN "businessResponse" TEXT,
  ADD COLUMN "customerId" TEXT,
  ADD COLUMN "respondedAt" TIMESTAMP(3),
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PUBLISHED';

ALTER TABLE "Order"
  ADD COLUMN "acceptedQuotationId" TEXT,
  ADD COLUMN "addressText" TEXT,
  ADD COLUMN "amountPaidMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "amountRefundedMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "budgetMinor" INTEGER,
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "handoverCodeHash" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "customerId" TEXT,
  ADD COLUMN "depositMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "designChoices" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "fabricListingId" TEXT,
  ADD COLUMN "fabricQtyCenti" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "fabricSource" TEXT NOT NULL DEFAULT 'BUSINESS',
  ADD COLUMN "instructions" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lat" DOUBLE PRECISION,
  ADD COLUMN "lng" DOUBLE PRECISION,
  ADD COLUMN "measurementRecordId" TEXT,
  ADD COLUMN "neededBy" TIMESTAMP(3),
  ADD COLUMN "number" SERIAL NOT NULL,
  ADD COLUMN "parentOrderId" TEXT,
  ADD COLUMN "previousStatus" TEXT,
  ADD COLUMN "referenceFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "totalMinor" INTEGER NOT NULL DEFAULT 0;

-- ── Users, roles, agents ──────────────────────────────────────────────────────
UPDATE "User" SET "isDemo" = ("email" LIKE '%@demo.gh');
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "isDemo";

-- Everyone can order as a customer.
INSERT INTO "RoleAssignment" ("id", "userId", "role", "permissions")
SELECT 'ra_c_' || "id", "id", 'CUSTOMER', ARRAY[]::TEXT[] FROM "User";
INSERT INTO "RoleAssignment" ("id", "userId", "role", "permissions")
SELECT 'ra_a_' || "id", "id", 'ADMIN', ARRAY['SUPER'] FROM "User" WHERE "role" = 'ADMIN';
INSERT INTO "RoleAssignment" ("id", "userId", "role", "permissions")
SELECT 'ra_m_' || "id", "id", "role", ARRAY[]::TEXT[] FROM "User" WHERE "role" IN ('MEASURER', 'RIDER');

INSERT INTO "AgentProfile" ("id", "userId", "kind", "verificationStatus", "ghanaCardNumber", "serviceLat", "serviceLng", "feeMinor", "vehicle")
SELECT 'ag_' || "id", "id", "role",
       CASE "verificationStatus" WHEN 'VERIFIED' THEN 'VERIFIED' WHEN 'REJECTED' THEN 'REJECTED' ELSE 'PENDING' END,
       "ghanaCardNumber", "lat", "lng",
       CASE WHEN "role" = 'MEASURER' THEN 3000 END,
       CASE WHEN "role" = 'RIDER' THEN 'MOTORBIKE' END
FROM "User" WHERE "role" IN ('MEASURER', 'RIDER');

INSERT INTO "VerificationApplication" ("id", "subjectType", "applicantId", "status", "details", "createdAt", "decidedAt")
SELECT 'va_' || "id", "role", "id",
       CASE "verificationStatus" WHEN 'VERIFIED' THEN 'APPROVED' WHEN 'REJECTED' THEN 'REJECTED' ELSE 'PENDING' END,
       jsonb_build_object('ghanaCardNumber', "ghanaCardNumber", 'migratedFromV1', true),
       "createdAt",
       CASE WHEN "verificationStatus" IN ('VERIFIED', 'REJECTED') THEN "createdAt" END
FROM "User" WHERE "role" IN ('MEASURER', 'RIDER');

-- ── Businesses become organisations with an owner membership ──────────────────
UPDATE "Business" b SET
  "kinds" = ARRAY[b."kind"],
  "slug" = trim(both '-' from lower(regexp_replace(b."name", '[^a-zA-Z0-9]+', '-', 'g'))) || '-' || right(b."id", 4),
  "payoutPhone" = b."phone",
  "isDemo" = u."isDemo"
FROM "User" u WHERE u."id" = b."ownerId";

INSERT INTO "Membership" ("id", "businessId", "userId", "role", "createdAt")
SELECT 'mem_' || "id", "id", "ownerId", 'OWNER', "createdAt" FROM "Business";

INSERT INTO "VerificationApplication" ("id", "subjectType", "applicantId", "businessId", "status", "details", "createdAt", "decidedAt")
SELECT 'va_' || "id", 'BUSINESS', "ownerId", "id",
       CASE "verificationStatus" WHEN 'VERIFIED' THEN 'APPROVED' WHEN 'REJECTED' THEN 'REJECTED' ELSE 'PENDING' END,
       jsonb_build_object('registrationNumber', "registrationNumber", 'migratedFromV1', true),
       "createdAt",
       CASE WHEN "verificationStatus" IN ('VERIFIED', 'REJECTED') THEN "createdAt" END
FROM "Business";

-- ── Catalogue ─────────────────────────────────────────────────────────────────
INSERT INTO "GarmentCategory" ("id", "slug", "name", "description", "sortOrder") VALUES
  ('cat_dresses', 'dresses-and-gowns', 'Dresses and gowns', 'Everyday dresses, gowns and jumpsuits.', 1),
  ('cat_kaba', 'kaba-and-slit', 'Kaba and slit', 'Fitted kaba tops with slit skirts.', 2),
  ('cat_shirts', 'shirts-and-trousers', 'Shirts and trousers', 'Shirts, trousers and matching sets.', 3),
  ('cat_suits', 'suits-and-formal', 'Suits and formal wear', 'Tailored suits, blazers and formal wear.', 4),
  ('cat_smocks', 'smocks-and-kaftans', 'Smocks and kaftans', 'Fugu, smocks, kaftans and agbada.', 5),
  ('cat_traditional', 'traditional', 'Traditional Ghanaian clothing', 'Kente wraps and ceremonial cloth.', 6),
  ('cat_children', 'childrens-clothing', 'Children''s clothing', 'Outfits for babies and children.', 7),
  ('cat_occasion', 'wedding-and-occasion', 'Wedding and occasion wear', 'Bridal, engagement and party outfits.', 8),
  ('cat_alterations', 'alterations-and-repairs', 'Alterations and repairs', 'Resizing, hemming and repairs.', 9),
  ('cat_other', 'other', 'Other', 'Anything else.', 99);

UPDATE "Style" SET
  "categoryId" = CASE "category"
    WHEN 'DRESS' THEN 'cat_dresses'
    WHEN 'KABA_AND_SLIT' THEN 'cat_kaba'
    WHEN 'SHIRT' THEN 'cat_shirts'
    WHEN 'SUIT' THEN 'cat_suits'
    WHEN 'SMOCK' THEN 'cat_smocks'
    WHEN 'TRADITIONAL' THEN 'cat_traditional'
    WHEN 'KIDS' THEN 'cat_children'
    ELSE 'cat_other' END,
  "slug" = trim(both '-' from lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g'))) || '-' || right("id", 4),
  "fabricQtyCenti" = ROUND("yardsNeeded" * 100)::INTEGER,
  "measurementKeys" = ARRAY['chest', 'waist', 'hips', 'shoulder', 'sleeve', 'topLength', 'trouserLength', 'neck'],
  "wearer" = CASE WHEN "category" = 'KIDS' THEN 'CHILDREN' ELSE "wearer" END;

UPDATE "BusinessStyle" SET "priceMinor" = ROUND("price" * 100)::INTEGER;

UPDATE "Business" b SET "skills" = COALESCE((
  SELECT array_agg(DISTINCT c."slug") FROM "BusinessStyle" bs
  JOIN "Style" s ON s."id" = bs."styleId" JOIN "GarmentCategory" c ON c."id" = s."categoryId"
  WHERE bs."businessId" = b."id"), ARRAY[]::TEXT[]);

-- Opening stock balance for each listing.
INSERT INTO "InventoryMovement" ("id", "listingId", "type", "qtyCenti", "onHandAfter", "reservedAfter", "note", "createdAt")
SELECT 'im_' || "id", "id", 'RESTOCK', "qtyOnHandCenti", "qtyOnHandCenti", 0, 'Opening balance carried over from V1', "createdAt"
FROM "FabricListing";

-- ── Orders ────────────────────────────────────────────────────────────────────
UPDATE "Order" o SET
  "customerId" = o."clientId",
  "fabricListingId" = o."materialId",
  "fabricQtyCenti" = ROUND(o."yards" * 100)::INTEGER,
  "fabricSource" = CASE WHEN o."ownFabric" THEN 'OWN' ELSE 'BUSINESS' END,
  "instructions" = o."notes",
  "budgetMinor" = CASE WHEN o."budget" IS NULL THEN NULL ELSE ROUND(o."budget" * 100)::INTEGER END,
  "addressText" = o."clientAddress",
  "lat" = o."clientLat",
  "lng" = o."clientLng",
  "measurementMethod" = CASE o."measurementMethod" WHEN 'AT_SHOP' THEN 'AT_WORKSHOP' ELSE o."measurementMethod" END,
  "isDemo" = u."isDemo",
  "status" = CASE
    WHEN o."status" = 'PLACED' THEN 'QUOTE_REQUESTED'
    WHEN o."status" IN ('DECLINED', 'CANCELLED') THEN 'CANCELLED'
    WHEN o."paymentStatus" <> 'PAID' THEN 'AWAITING_PAYMENT'
    WHEN o."status" = 'AWAITING_MEASUREMENT' THEN 'AWAITING_MEASUREMENTS'
    WHEN o."status" = 'MEASURED' THEN 'MEASUREMENTS_CONFIRMED'
    WHEN o."status" = 'SEWING' THEN 'IN_PRODUCTION'
    WHEN o."status" = 'READY' THEN 'READY'
    WHEN o."status" = 'OUT_FOR_DELIVERY' THEN 'IN_TRANSIT'
    WHEN o."status" = 'COMPLETED' THEN 'COMPLETED'
    ELSE o."status" END,
  "cancelReason" = CASE o."status" WHEN 'DECLINED' THEN 'Declined by the business (V1)' WHEN 'CANCELLED' THEN 'Cancelled by the customer (V1)' END,
  "completedAt" = CASE WHEN o."status" = 'COMPLETED' THEN o."updatedAt" END,
  "totalMinor" = CASE WHEN o."status" IN ('PLACED', 'DECLINED', 'CANCELLED') THEN 0 ELSE ROUND(o."total" * 100)::INTEGER END,
  "depositMinor" = CASE WHEN o."status" IN ('PLACED', 'DECLINED', 'CANCELLED') THEN 0 ELSE ROUND(o."total" * 100)::INTEGER END,
  "amountPaidMinor" = CASE WHEN o."paymentStatus" = 'PAID' THEN ROUND(o."total" * 100)::INTEGER ELSE 0 END
FROM "User" u WHERE u."id" = o."clientId";

UPDATE "Order" SET "kind" = 'CUSTOM' WHERE "kind" = 'SEW';

-- V1 orders had a fixed price. Record it as the business's accepted quotation, or as a
-- pending request for orders the business had not yet accepted.
INSERT INTO "Quotation" ("id", "orderId", "businessId", "status", "version", "totalMinor", "depositMinor", "message", "createdAt", "respondedAt")
SELECT 'qt_' || o."id", o."id", o."businessId",
       CASE WHEN o."status" = 'QUOTE_REQUESTED' THEN 'REQUESTED'
            WHEN o."status" = 'CANCELLED' AND o."cancelReason" LIKE 'Declined%' THEN 'DECLINED'
            WHEN o."status" = 'CANCELLED' THEN 'WITHDRAWN'
            ELSE 'ACCEPTED' END,
       1,
       o."totalMinor",
       o."depositMinor",
       CASE WHEN o."status" = 'QUOTE_REQUESTED' THEN 'Requested in V1 at an estimated ' || o."total" || ' GHS' ELSE 'Price fixed at checkout in V1' END,
       o."createdAt",
       CASE WHEN o."status" = 'QUOTE_REQUESTED' THEN NULL ELSE o."updatedAt" END
FROM "Order" o;

INSERT INTO "QuotationLine" ("id", "quotationId", "kind", "description", "amountMinor", "sortOrder")
SELECT 'ql_' || l.kind || '_' || o."id", 'qt_' || o."id", l.kind, l.description, ROUND(l.amount * 100)::INTEGER, l.sort
FROM "Order" o
CROSS JOIN LATERAL (VALUES
  ('LABOUR', 'Sewing', o."laborPrice", 1),
  ('FABRIC', 'Fabric', o."materialPrice", 2),
  ('MEASUREMENT', 'Measurement visit', o."measurementFee", 3),
  ('DELIVERY', 'Delivery', o."deliveryFee", 4)
) AS l(kind, description, amount, sort)
WHERE o."status" NOT IN ('QUOTE_REQUESTED', 'CANCELLED') AND l.amount > 0;

UPDATE "Order" o SET "acceptedQuotationId" = 'qt_' || o."id"
WHERE EXISTS (SELECT 1 FROM "Quotation" q WHERE q."id" = 'qt_' || o."id" AND q."status" = 'ACCEPTED');

INSERT INTO "OrderEvent" ("id", "orderId", "type", "toStatus", "actorRole", "note", "data", "createdAt")
SELECT 'ev_' || o."id", o."id", 'MIGRATED', o."status", 'SYSTEM', 'Carried over from V1',
       jsonb_build_object('v1Total', o."total", 'v1Fulfilment', o."fulfilment"), o."updatedAt"
FROM "Order" o;

-- Payments that V1 recorded as paid.
INSERT INTO "Payment" ("id", "orderId", "purpose", "amountMinor", "provider", "providerRef", "status", "createdAt", "verifiedAt")
SELECT 'pay_' || o."id", o."id", 'FULL', o."amountPaidMinor", 'LEGACY',
       COALESCE(o."paymentRef", 'LEGACY-' || o."id"), 'SUCCEEDED', o."createdAt", COALESCE(o."paidAt", o."updatedAt")
FROM "Order" o WHERE o."paymentStatus" = 'PAID';

INSERT INTO "LedgerEntry" ("id", "account", "orderId", "paymentId", "type", "amountMinor", "idempotencyKey", "memo", "createdAt")
SELECT 'le_pay_' || o."id", 'CUSTOMER_FUNDS', o."id", 'pay_' || o."id", 'PAYMENT_RECEIVED', o."amountPaidMinor",
       'legacy-payment-' || o."id", 'V1 payment', COALESCE(o."paidAt", o."updatedAt")
FROM "Order" o WHERE o."paymentStatus" = 'PAID';

-- Settlement of completed V1 orders: customer funds move to partners (from V1 payout rows)
-- and the remainder (V1 commission) to platform revenue.
INSERT INTO "LedgerEntry" ("id", "account", "partyType", "partyId", "orderId", "type", "amountMinor", "idempotencyKey", "memo", "createdAt")
SELECT 'le_lp_' || lp."id", 'PARTNER_PAYABLE',
       CASE WHEN lp."role" = 'BUSINESS' THEN 'BUSINESS' ELSE 'USER' END,
       CASE WHEN lp."role" = 'BUSINESS' THEN (SELECT b."id" FROM "Business" b WHERE b."ownerId" = lp."userId") ELSE lp."userId" END,
       lp."orderId", 'SETTLEMENT', ROUND(lp."amount" * 100)::INTEGER, 'legacy-payable-' || lp."id", 'V1 ' || lower(lp."role") || ' earnings', lp."createdAt"
FROM "LegacyPayout" lp;

INSERT INTO "LedgerEntry" ("id", "account", "orderId", "type", "amountMinor", "idempotencyKey", "memo", "createdAt")
SELECT 'le_set_' || o."id", 'CUSTOMER_FUNDS', o."id", 'SETTLEMENT', -o."amountPaidMinor", 'legacy-settle-' || o."id", 'V1 settlement', o."updatedAt"
FROM "Order" o WHERE o."status" = 'COMPLETED' AND o."paymentStatus" = 'PAID';

INSERT INTO "LedgerEntry" ("id", "account", "orderId", "type", "amountMinor", "idempotencyKey", "memo", "createdAt")
SELECT 'le_rev_' || o."id", 'PLATFORM_REVENUE', o."id", 'COMMISSION',
       o."amountPaidMinor" - COALESCE((SELECT SUM(ROUND(lp."amount" * 100))::INTEGER FROM "LegacyPayout" lp WHERE lp."orderId" = o."id"), 0),
       'legacy-revenue-' || o."id", 'V1 commission', o."updatedAt"
FROM "Order" o WHERE o."status" = 'COMPLETED' AND o."paymentStatus" = 'PAID';

-- V1 payouts already sent become payout records with matching ledger entries.
INSERT INTO "Payout" ("id", "partyType", "partyId", "amountMinor", "destination", "reference", "status", "createdById", "createdAt")
SELECT 'po_' || lp."id",
       CASE WHEN lp."role" = 'BUSINESS' THEN 'BUSINESS' ELSE 'USER' END,
       CASE WHEN lp."role" = 'BUSINESS' THEN (SELECT b."id" FROM "Business" b WHERE b."ownerId" = lp."userId") ELSE lp."userId" END,
       ROUND(lp."amount" * 100)::INTEGER, u."phone", COALESCE(lp."reference", 'V1'), 'PAID', 'migration', COALESCE(lp."paidAt", lp."createdAt")
FROM "LegacyPayout" lp JOIN "User" u ON u."id" = lp."userId" WHERE lp."status" = 'PAID';

INSERT INTO "LedgerEntry" ("id", "account", "partyType", "partyId", "payoutId", "type", "amountMinor", "idempotencyKey", "memo", "createdAt")
SELECT 'le_po1_' || p."id", 'PARTNER_PAYABLE', p."partyType", p."partyId", p."id", 'PAYOUT', -p."amountMinor", 'payout-debit-' || p."id", 'V1 payout', p."createdAt"
FROM "Payout" p;
INSERT INTO "LedgerEntry" ("id", "account", "payoutId", "type", "amountMinor", "idempotencyKey", "memo", "createdAt")
SELECT 'le_po2_' || p."id", 'PAYOUTS', p."id", 'PAYOUT', p."amountMinor", 'payout-credit-' || p."id", 'V1 payout', p."createdAt"
FROM "Payout" p;

-- Measurements: one "Me" profile per customer who had any, one record per order.
INSERT INTO "MeasurementProfile" ("id", "ownerId", "label", "createdAt")
SELECT 'mp_' || o."clientId", o."clientId", 'Me', MIN(o."createdAt")
FROM "Order" o WHERE o."measurements" IS NOT NULL GROUP BY o."clientId";

INSERT INTO "MeasurementRecord" ("id", "profileId", "revision", "values", "source", "status", "createdById", "createdAt", "confirmedAt")
SELECT 'mr_' || o."id", 'mp_' || o."clientId",
       ROW_NUMBER() OVER (PARTITION BY o."clientId" ORDER BY o."createdAt"),
       (SELECT jsonb_object_agg(k, jsonb_build_object('value', v::NUMERIC, 'unit', 'in')) FROM jsonb_each_text(o."measurements"::JSONB) AS m(k, v)),
       CASE o."measurementMethod" WHEN 'SELF' THEN 'SELF' WHEN 'HOME_VISIT' THEN 'PROFESSIONAL' ELSE 'WORKSHOP' END,
       'CONFIRMED',
       COALESCE(o."measurerId", o."clientId"),
       o."updatedAt", o."updatedAt"
FROM "Order" o WHERE o."measurements" IS NOT NULL;

UPDATE "Order" o SET "measurementRecordId" = 'mr_' || o."id" WHERE o."measurements" IS NOT NULL;

-- Home measurement visits.
INSERT INTO "Appointment" ("id", "kind", "customerId", "orderId", "professionalId", "windowStart", "windowEnd", "addressText", "lat", "lng", "feeMinor", "status", "createdAt", "acceptedAt", "completedAt")
SELECT 'ap_' || o."id", 'HOME_VISIT', o."clientId", o."id", o."measurerId",
       COALESCE(o."measurementTime", o."createdAt"), COALESCE(o."measurementTime", o."createdAt") + INTERVAL '2 hours',
       o."clientAddress", o."clientLat", o."clientLng", ROUND(o."measurementFee" * 100)::INTEGER,
       CASE WHEN o."status" = 'CANCELLED' THEN 'CANCELLED'
            WHEN o."measurements" IS NOT NULL THEN 'COMPLETED'
            WHEN o."measurerId" IS NOT NULL THEN 'ACCEPTED' ELSE 'REQUESTED' END,
       o."createdAt",
       CASE WHEN o."measurerId" IS NOT NULL THEN o."updatedAt" END,
       CASE WHEN o."measurements" IS NOT NULL THEN o."updatedAt" END
FROM "Order" o WHERE o."measurementMethod" = 'HOME_VISIT';

-- Deliveries. V1 had no handover code; these legs are marked LEGACY and can be closed by customer confirmation.
INSERT INTO "DeliveryAssignment" ("id", "orderId", "leg", "status", "riderId", "pickupName", "pickupAddress", "pickupLat", "pickupLng",
  "dropoffName", "dropoffAddress", "dropoffLat", "dropoffLng", "feeMinor", "proofCodeHash", "createdAt", "acceptedAt", "pickedUpAt", "deliveredAt")
SELECT 'dl_' || o."id", o."id", CASE WHEN o."kind" = 'FABRIC' THEN 'FABRIC_TO_CUSTOMER' ELSE 'GARMENT_TO_CUSTOMER' END,
       CASE WHEN o."status" = 'COMPLETED' THEN 'DELIVERED' WHEN o."status" = 'IN_TRANSIT' THEN 'IN_TRANSIT' ELSE 'OPEN' END,
       o."riderId", b."name", b."address" || ', ' || b."city", b."lat", b."lng",
       u."name", COALESCE(o."clientAddress", ''), COALESCE(o."clientLat", b."lat"), COALESCE(o."clientLng", b."lng"),
       ROUND(o."deliveryFee" * 100)::INTEGER, 'LEGACY', o."createdAt",
       CASE WHEN o."riderId" IS NOT NULL THEN o."updatedAt" END,
       CASE WHEN o."riderId" IS NOT NULL THEN o."updatedAt" END,
       CASE WHEN o."status" = 'COMPLETED' THEN o."updatedAt" END
FROM "Order" o JOIN "Business" b ON b."id" = o."businessId" JOIN "User" u ON u."id" = o."clientId"
WHERE o."fulfilment" = 'DELIVERY' AND (o."riderId" IS NOT NULL OR (o."status" = 'READY' AND o."paymentStatus" = 'PAID'));

UPDATE "Order" o SET "status" = 'DELIVERY_ASSIGNED'
WHERE o."status" = 'READY' AND EXISTS (SELECT 1 FROM "DeliveryAssignment" d WHERE d."orderId" = o."id" AND d."status" = 'OPEN');

UPDATE "Business" b SET "completedOrders" = (SELECT COUNT(*) FROM "Order" o WHERE o."businessId" = b."id" AND o."status" = 'COMPLETED');
-- V1 stored a typed-in rating (demo data used invented values). Ratings now come only from published reviews.
UPDATE "Business" b SET
  "reviewCount" = (SELECT COUNT(*) FROM "Review" r WHERE r."businessId" = b."id"),
  "rating" = COALESCE((SELECT ROUND(AVG(r."rating")::numeric, 1) FROM "Review" r WHERE r."businessId" = b."id"), 0);

-- Reviews.
UPDATE "Review" SET "customerId" = "clientId";

-- ── Drop V1 columns now that their data has moved ─────────────────────────────
ALTER TABLE "User" DROP COLUMN "ghanaCardNumber", DROP COLUMN "role", DROP COLUMN "verificationStatus";
ALTER TABLE "Business" DROP COLUMN "kind", DROP COLUMN "ownerId", ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "BusinessStyle" DROP COLUMN "price";
ALTER TABLE "Style" DROP COLUMN "category", DROP COLUMN "yardsNeeded",
  ALTER COLUMN "categoryId" SET NOT NULL, ALTER COLUMN "slug" SET NOT NULL, ALTER COLUMN "fabricQtyCenti" SET NOT NULL;
ALTER TABLE "Review" DROP COLUMN "clientId", ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "Order"
  DROP COLUMN "budget", DROP COLUMN "clientAddress", DROP COLUMN "clientId", DROP COLUMN "clientLat", DROP COLUMN "clientLng",
  DROP COLUMN "deliveryFee", DROP COLUMN "laborPrice", DROP COLUMN "materialId", DROP COLUMN "materialPrice",
  DROP COLUMN "measurementFee", DROP COLUMN "measurementTime", DROP COLUMN "measurements", DROP COLUMN "measurerId",
  DROP COLUMN "notes", DROP COLUMN "ownFabric", DROP COLUMN "paidAt", DROP COLUMN "paymentRef", DROP COLUMN "riderId",
  DROP COLUMN "total", DROP COLUMN "yards",
  ALTER COLUMN "customerId" SET NOT NULL,
  ALTER COLUMN "kind" SET DEFAULT 'CUSTOM',
  ALTER COLUMN "status" SET DEFAULT 'DRAFT',
  ALTER COLUMN "businessId" DROP NOT NULL,
  ALTER COLUMN "fulfilment" SET DEFAULT 'UNDECIDED';

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- CreateIndex
CREATE UNIQUE INDEX "RoleAssignment_userId_role_key" ON "RoleAssignment"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_userId_kind_key" ON "AgentProfile"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_businessId_userId_key" ON "Membership"("businessId", "userId");

-- CreateIndex
CREATE INDEX "VerificationApplication_status_idx" ON "VerificationApplication"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GarmentCategory_slug_key" ON "GarmentCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "StyleOption_styleId_key_key" ON "StyleOption"("styleId", "key");

-- CreateIndex
CREATE INDEX "FabricListing_businessId_idx" ON "FabricListing"("businessId");

-- CreateIndex
CREATE INDEX "FabricListing_fabricType_status_idx" ON "FabricListing"("fabricType", "status");

-- CreateIndex
CREATE INDEX "InventoryMovement_listingId_createdAt_idx" ON "InventoryMovement"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "FabricReservation_status_expiresAt_idx" ON "FabricReservation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "FabricReservation_orderId_idx" ON "FabricReservation"("orderId");

-- CreateIndex
CREATE INDEX "Quotation_businessId_status_idx" ON "Quotation"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_orderId_businessId_version_key" ON "Quotation"("orderId", "businessId", "version");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "MeasurementProfile_ownerId_idx" ON "MeasurementProfile"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "MeasurementRecord_profileId_revision_key" ON "MeasurementRecord"("profileId", "revision");

-- CreateIndex
CREATE INDEX "Appointment_status_windowStart_idx" ON "Appointment"("status", "windowStart");

-- CreateIndex
CREATE INDEX "Appointment_professionalId_windowStart_idx" ON "Appointment"("professionalId", "windowStart");

-- CreateIndex
CREATE INDEX "DeliveryAssignment_status_idx" ON "DeliveryAssignment"("status");

-- CreateIndex
CREATE INDEX "DeliveryAssignment_riderId_status_idx" ON "DeliveryAssignment"("riderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_eventKey_key" ON "PaymentEvent"("provider", "eventKey");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_idempotencyKey_key" ON "LedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_account_partyType_partyId_idx" ON "LedgerEntry"("account", "partyType", "partyId");

-- CreateIndex
CREATE INDEX "LedgerEntry_orderId_idx" ON "LedgerEntry"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_orderId_key" ON "Conversation"("orderId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_number_key" ON "Dispute"("number");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "StoredFile"("storageKey");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE INDEX "Business_verificationStatus_idx" ON "Business"("verificationStatus");

-- CreateIndex
CREATE INDEX "Business_lat_lng_idx" ON "Business"("lat", "lng");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_acceptedQuotationId_key" ON "Order"("acceptedQuotationId");

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_businessId_status_idx" ON "Order"("businessId", "status");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Payout_partyType_partyId_idx" ON "Payout"("partyType", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "Style_slug_key" ON "Style"("slug");

-- CreateIndex
CREATE INDEX "Style_categoryId_status_idx" ON "Style"("categoryId", "status");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- ── Foreign keys ─────────────────────────────────────────────────────────────
-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedAddress" ADD CONSTRAINT "SavedAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationApplication" ADD CONSTRAINT "VerificationApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationApplication" ADD CONSTRAINT "VerificationApplication_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Style" ADD CONSTRAINT "Style_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GarmentCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Style" ADD CONSTRAINT "Style_submittedByBusinessId_fkey" FOREIGN KEY ("submittedByBusinessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleOption" ADD CONSTRAINT "StyleOption_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "Style"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FabricListing" ADD CONSTRAINT "FabricListing_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "FabricListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FabricReservation" ADD CONSTRAINT "FabricReservation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "FabricListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FabricReservation" ADD CONSTRAINT "FabricReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_fabricListingId_fkey" FOREIGN KEY ("fabricListingId") REFERENCES "FabricListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_parentOrderId_fkey" FOREIGN KEY ("parentOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_measurementRecordId_fkey" FOREIGN KEY ("measurementRecordId") REFERENCES "MeasurementRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_acceptedQuotationId_fkey" FOREIGN KEY ("acceptedQuotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementProfile" ADD CONSTRAINT "MeasurementProfile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementRecord" ADD CONSTRAINT "MeasurementRecord_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MeasurementProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationRead" ADD CONSTRAINT "ConversationRead_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeNote" ADD CONSTRAINT "DisputeNote_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
