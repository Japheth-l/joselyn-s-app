import { db } from "@/lib/db";
import { CITIES, FABRIC_TYPES, MEASUREMENT_FIELDS } from "@/lib/enums";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { PageHeader } from "@/components/ui/basics";
import { requireActor } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { OrderWizard } from "./wizard";

export const metadata = { title: "New outfit" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ style?: string; business?: string }> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const [styles, records, user, settings] = await Promise.all([
    db.style.findMany({ where: { status: "PUBLISHED" }, include: { category: true, options: { orderBy: { sortOrder: "asc" } } }, orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }] }),
    db.measurementRecord.findMany({ where: { profile: { ownerId: actor.userId }, status: { in: ["SUBMITTED", "CONFIRMED"] } }, include: { profile: true }, orderBy: { createdAt: "desc" } }),
    db.user.findUniqueOrThrow({ where: { id: actor.userId } }),
    getSettings(),
  ]);
  const initial = sp.style ? styles.find((s) => s.slug === sp.style) : undefined;
  const city = user.city && user.city in CITIES ? user.city : "Accra";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New outfit" subtitle="Tell us what you want and we'll find tailors who can make it." />
      <OrderWizard
        styles={styles.map((s) => ({
          id: s.id, slug: s.slug, name: s.name, icon: s.icon, imageUrl: s.imageUrl, category: s.category.name, measurementKeys: s.measurementKeys,
          options: s.options.map((o) => ({ key: o.key, label: o.label, choices: o.choices })), fabricYards: s.fabricQtyCenti / 100, labourMinor: s.indicativeLabourMinor,
        }))}
        saved={records.map((r) => ({ id: r.id, label: `${r.profile.label}: revision ${r.revision}, ${formatDate(r.createdAt)}`, keys: Object.keys(r.values as object) }))}
        fields={MEASUREMENT_FIELDS}
        fabricTypes={FABRIC_TYPES}
        home={{ lat: user.lat ?? CITIES[city].lat, lng: user.lng ?? CITIES[city].lng, city }}
        initialStyleId={initial?.id}
        preferredBusinessId={sp.business}
        measurementFee={formatMoney(settings.homeMeasurementFeeMinor)}
      />
    </div>
  );
}
