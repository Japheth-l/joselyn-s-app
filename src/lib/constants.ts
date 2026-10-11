export const ROLES = ["CLIENT", "BUSINESS", "MEASURER", "RIDER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  CLIENT: "Client",
  BUSINESS: "Tailor / Seamstress / Company",
  MEASURER: "Measurement agent",
  RIDER: "Delivery rider",
  ADMIN: "Admin",
};

export const ROLE_HOME: Record<Role, string> = {
  CLIENT: "/orders",
  BUSINESS: "/business",
  MEASURER: "/measurer",
  RIDER: "/rider",
  ADMIN: "/admin",
};

export const BUSINESS_KINDS = {
  TAILOR: "Tailor",
  SEAMSTRESS: "Seamstress",
  COMPANY: "Sewing company",
} as const;

export const FABRIC_DESIGNS = {
  KENTE: { label: "Kente", blurb: "Hand-woven strips, bold geometric colours" },
  WAX_PRINT: { label: "Wax print (Ankara)", blurb: "Bright printed cotton, everyday and occasion wear" },
  LACE: { label: "Lace", blurb: "Elegant lace for weddings and church" },
  BATIK: { label: "Batik / Tie-dye", blurb: "Hand-dyed local patterns" },
  SMOCK_CLOTH: { label: "Fugu / Smock cloth", blurb: "Hand-woven northern cloth" },
  PLAIN: { label: "Plain fabric", blurb: "Solid colours: linen, cotton, suiting" },
} as const;
export type FabricDesign = keyof typeof FABRIC_DESIGNS;

export const CITIES: Record<string, { lat: number; lng: number }> = {
  Accra: { lat: 5.6037, lng: -0.187 },
  Kumasi: { lat: 6.6885, lng: -1.6244 },
  Takoradi: { lat: 4.8845, lng: -1.7554 },
  Tamale: { lat: 9.4008, lng: -0.8393 },
  "Cape Coast": { lat: 5.1053, lng: -1.2466 },
  Ho: { lat: 6.6008, lng: 0.4713 },
};

// Platform fees in GHS. Adjust as the business model settles.
export const FEES = {
  homeMeasurement: 30,
  deliveryBase: 15,
  deliveryPerKm: 3,
};

// How far (km) to look for tailors and jobs.
export const SEARCH_RADIUS_KM = 25;

export const MEASUREMENT_FIELDS = [
  { key: "chest", label: "Chest / Bust" },
  { key: "waist", label: "Waist" },
  { key: "hips", label: "Hips" },
  { key: "shoulder", label: "Shoulder width" },
  { key: "sleeve", label: "Sleeve length" },
  { key: "topLength", label: "Top / dress length" },
  { key: "trouserLength", label: "Trouser / skirt length" },
  { key: "neck", label: "Neck" },
] as const;

export const ORDER_STATUS = {
  PLACED: "Waiting for tailor to accept",
  AWAITING_MEASUREMENT: "Waiting for measurement",
  MEASURED: "Measurements received",
  SEWING: "Being sewn",
  READY: "Ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  COMPLETED: "Completed",
  DECLINED: "Declined by tailor",
  CANCELLED: "Cancelled",
} as const;
export type OrderStatus = keyof typeof ORDER_STATUS;

export const VERIFICATION_LABELS: Record<string, string> = {
  NOT_REQUIRED: "Not required",
  PENDING: "Pending review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

// Share of the tailor's sewing + fabric price kept by the platform.
export const PLATFORM_COMMISSION = 0.1;

export const PAYMENT_LABELS: Record<string, string> = {
  UNPAID: "Not paid",
  PAID: "Paid",
};
