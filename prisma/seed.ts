// Demo data so the app is usable right away. Run with: npm run db:seed
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const STYLES = [
  { key: "kaba", name: "Kaba and slit", category: "KABA_AND_SLIT", wearer: "WOMEN", yardsNeeded: 6, icon: "👗", description: "Classic fitted kaba top with a long slit skirt." },
  { key: "gown", name: "Long flared gown", category: "DRESS", wearer: "WOMEN", yardsNeeded: 5, icon: "💃", description: "Floor-length gown with a flared skirt, great for occasions." },
  { key: "shortdress", name: "Short shift dress", category: "DRESS", wearer: "WOMEN", yardsNeeded: 3, icon: "👚", description: "Simple knee-length dress for work or outings." },
  { key: "jumpsuit", name: "Wide-leg jumpsuit", category: "DRESS", wearer: "WOMEN", yardsNeeded: 5, icon: "🩱", description: "Modern one-piece with wide legs." },
  { key: "shirt", name: "Short-sleeve shirt", category: "SHIRT", wearer: "MEN", yardsNeeded: 2.5, icon: "👕", description: "Casual print shirt for Fridays and outings." },
  { key: "longshirt", name: "Long-sleeve shirt and trousers", category: "SHIRT", wearer: "MEN", yardsNeeded: 5, icon: "👔", description: "Matching top and trousers." },
  { key: "smock", name: "Fugu / Smock", category: "SMOCK", wearer: "MEN", yardsNeeded: 4, icon: "🧥", description: "Traditional northern smock." },
  { key: "suit", name: "Two-piece suit", category: "SUIT", wearer: "MEN", yardsNeeded: 4, icon: "🤵", description: "Tailored jacket and trousers." },
  { key: "kente", name: "Kente cloth wrap (men)", category: "TRADITIONAL", wearer: "MEN", yardsNeeded: 12, icon: "🎽", description: "Ceremonial kente for weddings and festivals." },
  { key: "kids", name: "Children's outfit", category: "KIDS", wearer: "UNISEX", yardsNeeded: 2, icon: "🧒", description: "Matching outfit for kids." },
];

type B = {
  name: string; kind: string; city: string; address: string; lat: number; lng: number; rating: number;
  verified: boolean; priceFactor: number; styles: string[];
  materials: { name: string; design: string; color: string; pricePerYard: number; yardsInStock: number }[];
};

const BUSINESSES: B[] = [
  {
    name: "Auntie Ama's Stitches", kind: "SEAMSTRESS", city: "Accra", address: "Near Kaneshie Market", lat: 5.5683, lng: -0.2357, rating: 4.8,
    verified: true, priceFactor: 1, styles: ["kaba", "gown", "shortdress", "jumpsuit", "kids"],
    materials: [
      { name: "Vlisco Super Wax – Blue Swallow", design: "WAX_PRINT", color: "#1d4ed8", pricePerYard: 55, yardsInStock: 36 },
      { name: "GTP Wax – Sunflower", design: "WAX_PRINT", color: "#ca8a04", pricePerYard: 35, yardsInStock: 48 },
      { name: "Swiss Voile Lace – Champagne", design: "LACE", color: "#d6b98c", pricePerYard: 90, yardsInStock: 20 },
    ],
  },
  {
    name: "Kwame Bespoke Tailoring", kind: "TAILOR", city: "Accra", address: "Osu, Oxford Street", lat: 5.5571, lng: -0.1818, rating: 4.6,
    verified: true, priceFactor: 1.6, styles: ["shirt", "longshirt", "suit", "smock", "kente"],
    materials: [
      { name: "Italian Wool Suiting – Charcoal", design: "PLAIN", color: "#3f3f46", pricePerYard: 150, yardsInStock: 25 },
      { name: "Bonwire Kente – Gold Sika", design: "KENTE", color: "#b45309", pricePerYard: 180, yardsInStock: 24 },
      { name: "Linen – Sand", design: "PLAIN", color: "#d6c7a1", pricePerYard: 60, yardsInStock: 40 },
    ],
  },
  {
    name: "Madina Fashion House", kind: "COMPANY", city: "Accra", address: "Madina Zongo Junction", lat: 5.6837, lng: -0.1657, rating: 4.3,
    verified: true, priceFactor: 0.8, styles: ["kaba", "shortdress", "shirt", "longshirt", "kids", "jumpsuit"],
    materials: [
      { name: "Woodin Print – Coral Garden", design: "WAX_PRINT", color: "#e11d48", pricePerYard: 40, yardsInStock: 60 },
      { name: "Hand-dyed Batik – Indigo", design: "BATIK", color: "#1e3a8a", pricePerYard: 30, yardsInStock: 45 },
      { name: "Cotton – White", design: "PLAIN", color: "#f5f5f4", pricePerYard: 20, yardsInStock: 100 },
    ],
  },
  {
    name: "Northern Smock Weavers", kind: "COMPANY", city: "Accra", address: "Nima Market", lat: 5.5826, lng: -0.1965, rating: 4.7,
    verified: true, priceFactor: 1.1, styles: ["smock", "shirt", "kids"],
    materials: [
      { name: "Hand-woven Fugu – Blue & White", design: "SMOCK_CLOTH", color: "#1e40af", pricePerYard: 70, yardsInStock: 30 },
      { name: "Hand-woven Fugu – Red Stripe", design: "SMOCK_CLOTH", color: "#991b1b", pricePerYard: 70, yardsInStock: 22 },
    ],
  },
  {
    name: "Tema Bridal & Lace", kind: "SEAMSTRESS", city: "Accra", address: "Community 1, Tema", lat: 5.6698, lng: -0.0166, rating: 4.9,
    verified: true, priceFactor: 2, styles: ["gown", "kaba", "jumpsuit"],
    materials: [
      { name: "Beaded Lace – Ivory", design: "LACE", color: "#f1ead8", pricePerYard: 220, yardsInStock: 15 },
      { name: "Cord Lace – Wine", design: "LACE", color: "#7f1d1d", pricePerYard: 130, yardsInStock: 18 },
      { name: "Kente – Royal Blue", design: "KENTE", color: "#1d4ed8", pricePerYard: 160, yardsInStock: 12 },
    ],
  },
  {
    name: "New Style Stitches (awaiting verification)", kind: "TAILOR", city: "Accra", address: "Achimota", lat: 5.6145, lng: -0.2289, rating: 0,
    verified: false, priceFactor: 0.7, styles: ["shirt", "shortdress"],
    materials: [{ name: "GTP Wax – Green Leaf", design: "WAX_PRINT", color: "#15803d", pricePerYard: 35, yardsInStock: 30 }],
  },
  {
    name: "Adum Kente & Tailoring", kind: "TAILOR", city: "Kumasi", address: "Adum, near Kejetia", lat: 6.6937, lng: -1.6243, rating: 4.7,
    verified: true, priceFactor: 0.9, styles: ["kente", "kaba", "longshirt", "smock", "shirt"],
    materials: [
      { name: "Bonwire Kente – Adwini Asa", design: "KENTE", color: "#15803d", pricePerYard: 150, yardsInStock: 40 },
      { name: "Adinkra Print – Black", design: "BATIK", color: "#292524", pricePerYard: 35, yardsInStock: 50 },
    ],
  },
  {
    name: "Asafo Seamstress Hub", kind: "SEAMSTRESS", city: "Kumasi", address: "Asafo Market", lat: 6.6835, lng: -1.6152, rating: 4.4,
    verified: true, priceFactor: 0.75, styles: ["kaba", "gown", "shortdress", "kids"],
    materials: [
      { name: "ATL Wax – Orange Bloom", design: "WAX_PRINT", color: "#ea580c", pricePerYard: 30, yardsInStock: 70 },
      { name: "Lace – Teal", design: "LACE", color: "#0f766e", pricePerYard: 85, yardsInStock: 16 },
    ],
  },
];

const BASE_LABOUR: Record<string, number> = {
  kaba: 180, gown: 220, shortdress: 120, jumpsuit: 200, shirt: 100, longshirt: 200, smock: 250, suit: 600, kente: 150, kids: 80,
};

async function main() {
  // Reset, in dependency order.
  await db.notification.deleteMany();
  await db.payout.deleteMany();
  await db.review.deleteMany();
  await db.businessPhoto.deleteMany();
  await db.order.deleteMany();
  await db.material.deleteMany();
  await db.businessStyle.deleteMany();
  await db.business.deleteMany();
  await db.style.deleteMany();
  await db.user.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);

  const styleIds: Record<string, string> = {};
  for (const { key, ...s } of STYLES) {
    styleIds[key] = (await db.style.create({ data: s })).id;
  }

  for (const [i, b] of BUSINESSES.entries()) {
    await db.user.create({
      data: {
        name: `${b.name.split(" ")[0]} Owner`, email: `business${i + 1}@demo.gh`, phone: `024000000${i}`, passwordHash, role: "BUSINESS",
        business: {
          create: {
            name: b.name, kind: b.kind, city: b.city, address: b.address, lat: b.lat, lng: b.lng,
            phone: `024000000${i}`, registrationNumber: `BN-${100000 + i}`,
            verificationStatus: b.verified ? "VERIFIED" : "PENDING",
            description: `${b.name} serves clients across ${b.city}.`,
            materials: { create: b.materials },
            styles: {
              create: b.styles.map((k) => ({ styleId: styleIds[k], price: Math.round(BASE_LABOUR[k] * b.priceFactor), daysToMake: k === "suit" ? 14 : 7 })),
            },
          },
        },
      },
    });
  }

  await db.user.createMany({
    data: [
      { name: "Platform Admin", email: "admin@demo.gh", phone: "0200000000", passwordHash, role: "ADMIN" },
      { name: "Efua Mensah", email: "client@demo.gh", phone: "0241234567", passwordHash, role: "CLIENT", lat: 5.6037, lng: -0.187 },
      { name: "Yaw Measurer", email: "measurer@demo.gh", phone: "0551234567", passwordHash, role: "MEASURER", verificationStatus: "VERIFIED", ghanaCardNumber: "GHA-123456789-1", lat: 5.6, lng: -0.19 },
      { name: "Kofi Rider", email: "rider@demo.gh", phone: "0271234567", passwordHash, role: "RIDER", verificationStatus: "VERIFIED", ghanaCardNumber: "GHA-123456789-2", lat: 5.59, lng: -0.2 },
      { name: "Abena New Rider", email: "rider2@demo.gh", phone: "0271234568", passwordHash, role: "RIDER", verificationStatus: "PENDING", ghanaCardNumber: "GHA-123456789-3", lat: 5.59, lng: -0.2 },
    ],
  });

  console.log("Seeded demo data. All demo accounts use password: password123");
}

main().finally(() => db.$disconnect());
