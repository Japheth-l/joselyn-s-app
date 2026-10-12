// Shared vocabularies. Statuses are stored as strings; these lists are the single source of valid values.

export const PLATFORM_ROLES = ["CUSTOMER", "MEASURER", "RIDER", "ADMIN"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const ADMIN_PERMISSIONS = {
  SUPER: "Everything",
  USERS: "Users and account restrictions",
  VERIFY: "Verification decisions",
  CATALOGUE: "Styles, categories and listings",
  ORDERS: "Orders and delivery problems",
  DISPUTES: "Disputes, reviews and support",
  FINANCE: "Refunds, payouts and reconciliation",
  CONFIG: "Fees, settings and message templates",
  AUDIT: "Audit log and reports",
} as const;
export type AdminPermission = keyof typeof ADMIN_PERMISSIONS;

export const MEMBERSHIP_ROLES = { OWNER: "Owner", MANAGER: "Manager", STAFF: "Staff" } as const;
export type MembershipRole = keyof typeof MEMBERSHIP_ROLES;

export const BUSINESS_KINDS = {
  TAILOR: "Tailor",
  SEAMSTRESS: "Seamstress",
  COMPANY: "Tailoring company",
  FABRIC_SELLER: "Fabric seller",
} as const;
export type BusinessKind = keyof typeof BUSINESS_KINDS;
export const SEWING_KINDS: BusinessKind[] = ["TAILOR", "SEAMSTRESS", "COMPANY"];

export const VERIFICATION_LABELS: Record<string, string> = {
  PENDING: "Waiting for review",
  NEEDS_INFO: "More information needed",
  APPROVED: "Approved",
  VERIFIED: "Verified",
  REJECTED: "Not approved",
  SUSPENDED: "Suspended",
};

export const FABRIC_TYPES = {
  KENTE: "Kente",
  WAX_PRINT: "Wax print (Ankara)",
  LACE: "Lace",
  BATIK: "Batik / tie-dye",
  SMOCK_CLOTH: "Fugu / smock cloth",
  PLAIN: "Plain fabric",
} as const;
export type FabricType = keyof typeof FABRIC_TYPES;

export const WEARERS = { WOMEN: "Women", MEN: "Men", UNISEX: "Anyone", CHILDREN: "Children" } as const;
export const OCCASIONS = {
  EVERYDAY: "Everyday",
  WORK: "Work",
  CHURCH: "Church",
  WEDDING: "Wedding",
  FUNERAL: "Funeral",
  FESTIVAL: "Festival",
  PARTY: "Party",
} as const;
export const COMPLEXITY = { SIMPLE: "Simple", MODERATE: "Moderate", COMPLEX: "Detailed" } as const;

export const MEASUREMENT_FIELDS = {
  chest: "Chest / bust",
  underbust: "Under bust",
  waist: "Waist",
  hips: "Hips",
  shoulder: "Shoulder width",
  sleeve: "Sleeve length",
  armhole: "Armhole",
  bicep: "Bicep",
  wrist: "Wrist",
  neck: "Neck",
  topLength: "Top / dress length",
  trouserLength: "Trouser / skirt length",
  inseam: "Inseam",
  thigh: "Thigh",
  knee: "Knee",
  ankle: "Ankle / trouser bottom",
  height: "Height",
} as const;
export type MeasurementKey = keyof typeof MEASUREMENT_FIELDS;
export const MEASUREMENT_UNITS = { in: "inches", cm: "centimetres" } as const;

// ── Orders ──
export const ORDER_STATUS = {
  DRAFT: { label: "Draft", help: "Not sent yet." },
  QUOTE_REQUESTED: { label: "Waiting for quotes", help: "Businesses have been asked for a price." },
  QUOTED: { label: "Quote received", help: "Compare the quotes and accept one." },
  AWAITING_PAYMENT: { label: "Waiting for payment", help: "Pay the deposit or full amount to start." },
  AWAITING_MEASUREMENTS: { label: "Waiting for measurements", help: "Measurements are needed before sewing." },
  MEASUREMENTS_CONFIRMED: { label: "Measurements confirmed", help: "The business has what it needs." },
  IN_PRODUCTION: { label: "Being sewn", help: "The business is making your outfit." },
  QUALITY_CHECK: { label: "Quality check", help: "Final checks before handover." },
  READY: { label: "Ready", help: "Ready for collection or dispatch." },
  DELIVERY_ASSIGNED: { label: "Delivery arranged", help: "Waiting for a rider to collect it." },
  PICKED_UP: { label: "Picked up by rider", help: "The rider has collected it." },
  IN_TRANSIT: { label: "On the way", help: "The rider is on the way to you." },
  DELIVERED: { label: "Delivered", help: "Delivered. Confirm when you are happy." },
  COLLECTED: { label: "Collected", help: "Collected from the business." },
  COMPLETED: { label: "Completed", help: "Finished." },
  CANCELLED: { label: "Cancelled", help: "This order was cancelled." },
  DISPUTED: { label: "In dispute", help: "Our team is reviewing a problem with this order." },
  REFUNDED: { label: "Refunded", help: "The payment was refunded." },
} as const;
export type OrderStatus = keyof typeof ORDER_STATUS;

export const PAYMENT_STATUS = {
  UNPAID: "Not paid",
  DEPOSIT_PAID: "Deposit paid",
  PAID: "Paid in full",
  PARTIALLY_REFUNDED: "Partly refunded",
  REFUNDED: "Refunded",
} as const;

export const MEASUREMENT_METHODS = {
  SAVED: "Use my saved measurements",
  SELF: "Enter my measurements",
  HOME_VISIT: "A measurement professional comes to me",
  AT_WORKSHOP: "I'll be measured at the workshop",
} as const;

export const QUOTE_LINE_KINDS = {
  LABOUR: "Sewing",
  FABRIC: "Fabric",
  MEASUREMENT: "Measurement visit",
  DELIVERY: "Delivery",
  SERVICE_FEE: "Ntoma service fee",
  DISCOUNT: "Discount",
  OTHER: "Other",
} as const;

export const APPOINTMENT_STATUS = {
  REQUESTED: "Looking for a professional",
  ACCEPTED: "Professional assigned",
  COMPLETED: "Completed",
  FAILED: "Visit failed",
  CANCELLED: "Cancelled",
} as const;

export const DELIVERY_STATUS = {
  OPEN: "Waiting for a rider",
  ACCEPTED: "Rider assigned",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "On the way",
  DELIVERED: "Delivered",
  FAILED: "Delivery failed",
  CANCELLED: "Cancelled",
} as const;

export const DELIVERY_LEGS = {
  GARMENT_TO_CUSTOMER: "Finished outfit to customer",
  FABRIC_TO_CUSTOMER: "Fabric to customer",
  FABRIC_TO_TAILOR: "Fabric to tailor",
} as const;

export const DISPUTE_CATEGORIES = {
  MISSED_DEADLINE: "Missed deadline",
  WRONG_MEASUREMENTS: "Wrong measurements or fit",
  NOT_AS_AGREED: "Not what was agreed",
  FABRIC_SUBSTITUTION: "Different fabric used",
  MISSING_OR_DAMAGED: "Missing or damaged",
  DELIVERY_FAILURE: "Delivery problem",
  PRICE_CHANGE: "Price changed without my approval",
  PAYMENT: "Payment problem",
  OTHER: "Something else",
} as const;
export const DISPUTE_STATUS = {
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  AWAITING_PARTY: "Waiting for a reply",
  RESOLVED: "Resolved",
  REJECTED: "Closed without action",
} as const;
export const DISPUTE_REMEDIES = {
  NONE: "No remedy",
  PARTIAL_REFUND: "Partial refund",
  FULL_REFUND: "Full refund",
  REMAKE: "Remake or alteration",
  OTHER: "Other",
} as const;

export const CITIES: Record<string, { lat: number; lng: number }> = {
  Accra: { lat: 5.6037, lng: -0.187 },
  Tema: { lat: 5.6698, lng: -0.0166 },
  Kumasi: { lat: 6.6885, lng: -1.6244 },
  Takoradi: { lat: 4.8845, lng: -1.7554 },
  Tamale: { lat: 9.4008, lng: -0.8393 },
  "Cape Coast": { lat: 5.1053, lng: -1.2466 },
  Ho: { lat: 6.6008, lng: 0.4713 },
  Koforidua: { lat: 6.0941, lng: -0.2591 },
  Sunyani: { lat: 7.3399, lng: -2.3268 },
};

export function labelOf(map: Record<string, string | { label: string }>, key: string | null | undefined): string {
  if (!key) return "—";
  const v = map[key];
  if (!v) return key;
  return typeof v === "string" ? v : v.label;
}
