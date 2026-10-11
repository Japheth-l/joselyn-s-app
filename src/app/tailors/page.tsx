import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CITIES } from "@/lib/constants";
import { distanceKm } from "@/lib/geo";
import { NearbyTailors } from "./nearby";

export default async function TailorsPage() {
  const user = await requireUser("CLIENT");
  const home = user.lat != null && user.lng != null ? { lat: user.lat, lng: user.lng } : CITIES.Accra;
  const businesses = await db.business.findMany({
    where: { verificationStatus: "VERIFIED", styles: { some: {} } },
    include: { styles: { include: { style: true } } },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Tailors & seamstresses near you</h1>
        <p className="text-stone-600">All verified by TailorConnect.</p>
      </div>
      <NearbyTailors
        home={home}
        tailors={businesses.map((b) => ({
          id: b.id, name: b.name, kind: b.kind, address: b.address, city: b.city, phone: b.phone, lat: b.lat, lng: b.lng, rating: b.rating,
          styles: b.styles.map((s) => s.style.name),
          fromPrice: Math.min(...b.styles.map((s) => s.price)),
          homeKm: distanceKm(home.lat, home.lng, b.lat, b.lng),
        }))}
      />
    </div>
  );
}
