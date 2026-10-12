// Seed data.
//
//   npm run db:seed              catalogue + administrator + clearly-marked demo data (development)
//   tsx prisma/seed.ts --if-empty  (deploy, only with SEED_DEMO_DATA=true) does nothing if any user exists
//
// What is seeded:
//   • The style catalogue (styles and their design options). This is real catalogue content, not activity.
//   • One administrator, only if ADMIN_PASSWORD is set (in development a fixed local password is used).
//   • Demo accounts and businesses, every one marked isDemo = true and shown with a "Demo listing" badge.
//     No reviews, ratings, completed orders, payments or other activity are invented.
// Style "photos" are emoji icons; no fashion photographs are copied.
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const production = process.env.NODE_ENV === "production";

type StyleSeed = {
  slug: string; name: string; categoryId: string; wearer: string; occasions: string[]; description: string; complexity: string;
  labour: number | null; yards: number; keys: string[]; icon: string; options: { key: string; label: string; choices: string[] }[];
};

const NECKLINE = { key: "neckline", label: "Neckline", choices: ["Round", "V-neck", "Sweetheart", "Square", "Off-shoulder", "Boat"] };
const SLEEVE = { key: "sleeve", label: "Sleeves", choices: ["Sleeveless", "Cap", "Short", "Three-quarter", "Long", "Puff", "Bell"] };
const MEN_SLEEVE = { key: "sleeve", label: "Sleeves", choices: ["Short", "Long"] };
const COLLAR = { key: "collar", label: "Collar", choices: ["Classic", "Mandarin", "Round neck (no collar)", "Cuban"] };
const LINING = { key: "lining", label: "Lining", choices: ["Unlined", "Lined"] };
const FIT = { key: "fit", label: "Fit", choices: ["Fitted", "Regular", "Relaxed"] };
const TROUSER = { key: "trouser", label: "Trousers", choices: ["Straight", "Slim", "Tapered", "Wide"] };

const UPPER = ["chest", "waist", "shoulder", "sleeve", "topLength"];
const WOMEN_DRESS = ["chest", "underbust", "waist", "hips", "shoulder", "topLength"];

const STYLES: StyleSeed[] = [
  { slug: "kaba-and-slit", name: "Kaba and slit", categoryId: "cat_kaba", wearer: "WOMEN", occasions: ["CHURCH", "WEDDING", "FUNERAL", "FESTIVAL"], complexity: "MODERATE", labour: 18000, yards: 6, icon: "👗", keys: [...WOMEN_DRESS, "trouserLength", "sleeve"], description: "Fitted kaba top with a long slit skirt, sewn from one six-yard piece of cloth.", options: [NECKLINE, SLEEVE, { key: "skirt", label: "Skirt", choices: ["Straight slit", "Mermaid", "Wrap", "A-line"] }, { key: "peplum", label: "Peplum", choices: ["None", "Single", "Double"] }, LINING] },
  { slug: "kaba-and-slit-with-headwrap", name: "Kaba, slit and matching head wrap", categoryId: "cat_kaba", wearer: "WOMEN", occasions: ["CHURCH", "WEDDING", "FESTIVAL"], complexity: "COMPLEX", labour: 25000, yards: 8, icon: "👘", keys: [...WOMEN_DRESS, "trouserLength", "sleeve"], description: "Kaba and slit with a matching head wrap and optional shawl.", options: [NECKLINE, SLEEVE, { key: "skirt", label: "Skirt", choices: ["Straight slit", "Mermaid", "Wrap"] }, { key: "extras", label: "Extras", choices: ["Head wrap only", "Head wrap and shawl"] }] },
  { slug: "flared-gown", name: "Long flared gown", categoryId: "cat_dresses", wearer: "WOMEN", occasions: ["WEDDING", "PARTY", "CHURCH"], complexity: "MODERATE", labour: 22000, yards: 5, icon: "💃", keys: WOMEN_DRESS, description: "Floor-length gown with a fitted bodice and a flared skirt.", options: [NECKLINE, SLEEVE, { key: "back", label: "Back", choices: ["Closed", "Open", "Zip", "Buttons"] }, LINING] },
  { slug: "shift-dress", name: "Short shift dress", categoryId: "cat_dresses", wearer: "WOMEN", occasions: ["EVERYDAY", "WORK"], complexity: "SIMPLE", labour: 12000, yards: 3, icon: "👚", keys: ["chest", "waist", "hips", "shoulder", "topLength"], description: "Simple knee-length dress for work or outings.", options: [NECKLINE, SLEEVE, { key: "pockets", label: "Pockets", choices: ["No pockets", "Side pockets"] }] },
  { slug: "wide-leg-jumpsuit", name: "Wide-leg jumpsuit", categoryId: "cat_dresses", wearer: "WOMEN", occasions: ["PARTY", "EVERYDAY"], complexity: "MODERATE", labour: 20000, yards: 5, icon: "🩱", keys: ["chest", "waist", "hips", "shoulder", "trouserLength", "inseam"], description: "A modern one-piece with wide legs and a fitted waist.", options: [NECKLINE, SLEEVE, { key: "belt", label: "Belt", choices: ["No belt", "Self-fabric belt"] }] },
  { slug: "short-sleeve-shirt", name: "Print shirt", categoryId: "cat_shirts", wearer: "MEN", occasions: ["EVERYDAY", "WORK", "PARTY"], complexity: "SIMPLE", labour: 10000, yards: 2.5, icon: "👕", keys: UPPER.concat("neck"), description: "Casual wax-print shirt for Fridays and outings.", options: [MEN_SLEEVE, COLLAR, FIT, { key: "pocket", label: "Chest pocket", choices: ["None", "One", "Two"] }] },
  { slug: "shirt-and-trousers", name: "Shirt and trousers set", categoryId: "cat_shirts", wearer: "MEN", occasions: ["CHURCH", "FESTIVAL", "PARTY"], complexity: "MODERATE", labour: 20000, yards: 5, icon: "👔", keys: [...UPPER, "neck", "hips", "trouserLength", "inseam", "thigh", "ankle"], description: "Matching top and trousers in one fabric.", options: [MEN_SLEEVE, COLLAR, TROUSER, FIT] },
  { slug: "two-piece-suit", name: "Two-piece suit", categoryId: "cat_suits", wearer: "MEN", occasions: ["WORK", "WEDDING"], complexity: "COMPLEX", labour: 60000, yards: 4, icon: "🤵", keys: [...UPPER, "neck", "bicep", "hips", "trouserLength", "inseam", "thigh"], description: "Tailored jacket and trousers.", options: [{ key: "lapel", label: "Lapel", choices: ["Notch", "Peak", "Shawl"] }, { key: "buttons", label: "Buttons", choices: ["One", "Two", "Double-breasted"] }, TROUSER, LINING] },
  { slug: "fugu-smock", name: "Fugu (smock)", categoryId: "cat_smocks", wearer: "MEN", occasions: ["FESTIVAL", "FUNERAL", "EVERYDAY"], complexity: "MODERATE", labour: 25000, yards: 4, icon: "🧥", keys: ["chest", "shoulder", "topLength", "neck"], description: "Traditional northern smock from hand-woven strip cloth.", options: [{ key: "sleeve", label: "Sleeves", choices: ["Sleeveless", "Short", "Long"] }, { key: "length", label: "Length", choices: ["Hip length", "Knee length"] }, { key: "embroidery", label: "Neck embroidery", choices: ["None", "Simple", "Full"] }] },
  { slug: "agbada", name: "Agbada / kaftan", categoryId: "cat_smocks", wearer: "MEN", occasions: ["WEDDING", "FESTIVAL"], complexity: "COMPLEX", labour: 45000, yards: 9, icon: "🥻", keys: ["chest", "shoulder", "topLength", "neck", "trouserLength", "waist"], description: "Flowing three-piece kaftan set with an inner top and trousers.", options: [{ key: "embroidery", label: "Embroidery", choices: ["None", "Neck only", "Neck and sleeves"] }, { key: "cap", label: "Cap", choices: ["No cap", "Matching cap"] }] },
  { slug: "kente-wrap-men", name: "Kente cloth (men's wrap)", categoryId: "cat_traditional", wearer: "MEN", occasions: ["WEDDING", "FESTIVAL"], complexity: "SIMPLE", labour: 15000, yards: 12, icon: "🎽", keys: ["height", "chest"], description: "Ceremonial kente wrap, hemmed and finished for weddings and festivals.", options: [{ key: "finish", label: "Edge finish", choices: ["Hemmed", "Fringed"] }] },
  { slug: "kente-gown", name: "Kente engagement gown", categoryId: "cat_occasion", wearer: "WOMEN", occasions: ["WEDDING"], complexity: "COMPLEX", labour: 45000, yards: 6, icon: "👰", keys: [...WOMEN_DRESS, "sleeve", "trouserLength"], description: "Fitted kente gown for engagements (knocking) and weddings.", options: [NECKLINE, SLEEVE, { key: "train", label: "Train", choices: ["No train", "Short train", "Long train"] }, LINING] },
  { slug: "childrens-outfit", name: "Children's outfit", categoryId: "cat_children", wearer: "CHILDREN", occasions: ["CHURCH", "PARTY", "FESTIVAL"], complexity: "SIMPLE", labour: 8000, yards: 2, icon: "🧒", keys: ["chest", "waist", "topLength", "height"], description: "Dress, or shirt and shorts, sized for children.", options: [{ key: "type", label: "Type", choices: ["Dress", "Shirt and shorts", "Shirt and trousers"] }, { key: "sleeve", label: "Sleeves", choices: ["Short", "Long"] }] },
  { slug: "school-uniform", name: "School uniform", categoryId: "cat_children", wearer: "CHILDREN", occasions: ["EVERYDAY"], complexity: "SIMPLE", labour: 7000, yards: 2, icon: "🎒", keys: ["chest", "waist", "topLength", "trouserLength"], description: "Uniform sewn to the school's pattern. Bring the school fabric.", options: [{ key: "type", label: "Type", choices: ["Dress", "Shirt and shorts", "Shirt and trousers", "Shirt and skirt"] }] },
  { slug: "alteration", name: "Alteration or repair", categoryId: "cat_alterations", wearer: "UNISEX", occasions: ["EVERYDAY"], complexity: "SIMPLE", labour: null, yards: 0.01, icon: "🪡", keys: ["waist", "hips", "topLength"], description: "Take in, let out, shorten or repair a garment you already have. Describe the work and add photos.", options: [{ key: "work", label: "Work needed", choices: ["Take in", "Let out", "Shorten", "Lengthen", "Repair", "Other"] }] },
];

type BizSeed = {
  slug: string; name: string; kinds: string[]; city: string; address: string; lat: number; lng: number; capacity: number; description: string;
  offers: [slug: string, priceGhs: number | null, days: number][];
  fabrics: { name: string; type: string; color: string; colorName: string; pattern: string; price: number; qty: number; unit?: "YARD" | "METRE" }[];
};

// Demo businesses: invented names, marked isDemo. No reviews, ratings or completed orders.
const BUSINESSES: BizSeed[] = [
  {
    slug: "demo-auntie-ama-stitches", name: "Auntie Ama's Stitches", kinds: ["SEAMSTRESS", "FABRIC_SELLER"], city: "Accra", address: "Near Kaneshie Market", lat: 5.5683, lng: -0.2357, capacity: 8,
    description: "Seamstress for kaba and slit, gowns and children's wear.",
    offers: [["kaba-and-slit", 180, 7], ["kaba-and-slit-with-headwrap", 250, 10], ["flared-gown", 230, 8], ["shift-dress", 120, 5], ["childrens-outfit", 80, 4], ["alteration", null, 2]],
    fabrics: [
      { name: "Wax print, blue swallow", type: "WAX_PRINT", color: "#1d4ed8", colorName: "Blue", pattern: "Swallows", price: 55, qty: 36 },
      { name: "Wax print, sunflower", type: "WAX_PRINT", color: "#ca8a04", colorName: "Yellow", pattern: "Sunflowers", price: 35, qty: 48 },
      { name: "Voile lace, champagne", type: "LACE", color: "#d6b98c", colorName: "Champagne", pattern: "Floral lace", price: 90, qty: 20 },
    ],
  },
  {
    slug: "demo-kwame-bespoke", name: "Kwame Bespoke Tailoring", kinds: ["TAILOR"], city: "Accra", address: "Osu, Oxford Street", lat: 5.5571, lng: -0.1818, capacity: 6,
    description: "Menswear: shirts, suits, smocks and kaftans.",
    offers: [["short-sleeve-shirt", 150, 5], ["shirt-and-trousers", 300, 7], ["two-piece-suit", 900, 14], ["fugu-smock", 320, 10], ["agbada", 650, 14], ["kente-wrap-men", 200, 5]],
    fabrics: [
      { name: "Wool suiting, charcoal", type: "PLAIN", color: "#3f3f46", colorName: "Charcoal", pattern: "", price: 150, qty: 25 },
      { name: "Linen, sand", type: "PLAIN", color: "#d6c7a1", colorName: "Sand", pattern: "", price: 60, qty: 40 },
    ],
  },
  {
    slug: "demo-madina-fashion-house", name: "Madina Fashion House", kinds: ["COMPANY", "FABRIC_SELLER"], city: "Accra", address: "Madina Zongo Junction", lat: 5.6837, lng: -0.1657, capacity: 20,
    description: "Tailoring company for everyday wear and group orders.",
    offers: [["kaba-and-slit", 150, 6], ["shift-dress", 100, 4], ["wide-leg-jumpsuit", 170, 6], ["short-sleeve-shirt", 90, 4], ["shirt-and-trousers", 180, 6], ["childrens-outfit", 70, 4], ["school-uniform", 60, 4]],
    fabrics: [
      { name: "Wax print, coral garden", type: "WAX_PRINT", color: "#e11d48", colorName: "Coral", pattern: "Flowers", price: 40, qty: 60 },
      { name: "Batik, indigo", type: "BATIK", color: "#1e3a8a", colorName: "Indigo", pattern: "Tie-dye", price: 30, qty: 45 },
      { name: "Cotton, white", type: "PLAIN", color: "#f5f5f4", colorName: "White", pattern: "", price: 20, qty: 100 },
    ],
  },
  {
    slug: "demo-bonwire-cloth-sellers", name: "Bonwire Cloth Sellers", kinds: ["FABRIC_SELLER"], city: "Kumasi", address: "Adum, near Kejetia", lat: 6.6937, lng: -1.6243, capacity: 1,
    description: "Hand-woven kente and smock cloth.",
    offers: [],
    fabrics: [
      { name: "Kente, gold and green", type: "KENTE", color: "#15803d", colorName: "Gold/green", pattern: "Strip weave", price: 150, qty: 40 },
      { name: "Fugu cloth, blue and white", type: "SMOCK_CLOTH", color: "#1e40af", colorName: "Blue/white", pattern: "Stripes", price: 70, qty: 30 },
    ],
  },
  {
    slug: "demo-asafo-seamstress-hub", name: "Asafo Seamstress Hub", kinds: ["SEAMSTRESS"], city: "Kumasi", address: "Asafo Market", lat: 6.6835, lng: -1.6152, capacity: 10,
    description: "Kaba, gowns and children's clothing.",
    offers: [["kaba-and-slit", 140, 6], ["flared-gown", 200, 7], ["kente-gown", 420, 14], ["childrens-outfit", 60, 3]],
    fabrics: [],
  },
];

const HOURS = { mon: "08:00-18:00", tue: "08:00-18:00", wed: "08:00-18:00", thu: "08:00-18:00", fri: "08:00-18:00", sat: "09:00-16:00", sun: "" };

async function seedCatalogue() {
  for (const s of STYLES) {
    const data = {
      name: s.name, categoryId: s.categoryId, wearer: s.wearer, occasions: s.occasions, description: s.description, complexity: s.complexity,
      indicativeLabourMinor: s.labour, fabricQtyCenti: Math.round(s.yards * 100), measurementKeys: s.keys, icon: s.icon, status: "PUBLISHED",
    };
    const style = await db.style.upsert({ where: { slug: s.slug }, create: { slug: s.slug, ...data }, update: {} });
    for (const [i, o] of s.options.entries()) {
      await db.styleOption.upsert({ where: { styleId_key: { styleId: style.id, key: o.key } }, create: { styleId: style.id, ...o, sortOrder: i }, update: {} });
    }
  }
  console.log(`Catalogue: ${STYLES.length} styles.`);
}

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || "admin@ntoma.example").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || (production ? "" : "local-admin-password");
  if (!password) {
    console.log("ADMIN_PASSWORD is not set: no administrator created. Set it and run the seed again.");
    return;
  }
  if (await db.user.findUnique({ where: { email } })) return;
  await db.user.create({
    data: {
      name: "Platform administrator", email, phone: "0200000000", city: "Accra", lat: 5.6037, lng: -0.187, emailVerifiedAt: new Date(),
      passwordHash: await bcrypt.hash(password, 10),
      roles: { create: [{ role: "CUSTOMER" }, { role: "ADMIN", permissions: ["SUPER"] }] },
    },
  });
  console.log(`Administrator: ${email}${process.env.ADMIN_PASSWORD ? " (password from ADMIN_PASSWORD)" : " / local-admin-password (development only)"}`);
}

async function seedDemo() {
  const passwordHash = await bcrypt.hash(process.env.DEMO_PASSWORD || "demo-password", 10);
  const user = (name: string, email: string, phone: string, extra: Partial<Prisma.UserCreateInput> = {}) =>
    db.user.upsert({
      where: { email },
      update: {},
      create: {
        name, email, phone, passwordHash, isDemo: true, emailVerifiedAt: new Date(), city: "Accra", lat: 5.6037, lng: -0.187,
        roles: { create: { role: "CUSTOMER" } }, ...extra,
      },
    });

  await user("Efua (demo customer)", "customer@demo.ntoma.example", "0241234567");
  const measurer = await user("Yaw (demo measurer)", "measurer@demo.ntoma.example", "0551234567");
  const rider = await user("Kofi (demo rider)", "rider@demo.ntoma.example", "0271234567");
  for (const [u, kind] of [[measurer, "MEASURER"], [rider, "RIDER"]] as const) {
    await db.roleAssignment.upsert({ where: { userId_role: { userId: u.id, role: kind } }, create: { userId: u.id, role: kind }, update: {} });
    await db.agentProfile.upsert({
      where: { userId_kind: { userId: u.id, kind } }, update: {},
      create: { userId: u.id, kind, verificationStatus: "VERIFIED", ghanaCardNumber: "GHA-000000000-0", serviceLat: 5.6, serviceLng: -0.19, serviceRadiusKm: 25, vehicle: kind === "RIDER" ? "MOTORBIKE" : null, feeMinor: kind === "MEASURER" ? 3000 : null },
    });
  }

  for (const [i, b] of BUSINESSES.entries()) {
    if (await db.business.findUnique({ where: { slug: b.slug } })) continue;
    const owner = await user(`${b.name} owner (demo)`, `business${i + 1}@demo.ntoma.example`, `02400000${i}0`);
    const biz = await db.business.create({
      data: {
        slug: b.slug, name: b.name, kinds: b.kinds, city: b.city, address: b.address, lat: b.lat, lng: b.lng, phone: owner.phone, payoutPhone: owner.phone,
        description: b.description, capacityPerWeek: b.capacity, registrationNumber: `DEMO-${i + 1}`, verificationStatus: "VERIFIED", isDemo: true,
        operatingHours: HOURS, skills: [], members: { create: { userId: owner.id, role: "OWNER" } },
      },
    });
    await db.verificationApplication.create({ data: { subjectType: "BUSINESS", applicantId: owner.id, businessId: biz.id, status: "APPROVED", details: { note: "Demo business created by the seed script" }, decidedAt: new Date() } });
    const skills = new Set<string>();
    for (const [slug, price, days] of b.offers) {
      const style = await db.style.findUniqueOrThrow({ where: { slug }, include: { category: true } });
      skills.add(style.category.slug);
      await db.businessStyle.create({ data: { businessId: biz.id, styleId: style.id, priceMinor: price == null ? null : price * 100, daysToMake: days } });
    }
    await db.business.update({ where: { id: biz.id }, data: { skills: [...skills] } });
    for (const f of b.fabrics) {
      const qty = f.qty * 100;
      const listing = await db.fabricListing.create({
        data: { businessId: biz.id, name: f.name, fabricType: f.type, color: f.color, colorName: f.colorName, pattern: f.pattern, unit: f.unit ?? "YARD", pricePerUnitMinor: f.price * 100, qtyOnHandCenti: qty, widthInches: 45 },
      });
      await db.inventoryMovement.create({ data: { listingId: listing.id, type: "RESTOCK", qtyCenti: qty, onHandAfter: qty, reservedAfter: 0, actorId: owner.id, note: "Opening stock (demo)" } });
    }
  }
  console.log(`Demo data: ${BUSINESSES.length} demo businesses, demo customer/measurer/rider (password from DEMO_PASSWORD, default "demo-password"). All marked as demo.`);
}

async function main() {
  if (process.argv.includes("--if-empty") && (await db.user.count()) > 0) {
    console.log("Database already has users; skipping the seed.");
    return;
  }
  await seedCatalogue();
  await seedAdmin();
  if (!process.argv.includes("--no-demo")) await seedDemo();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
