import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CITIES } from "@/lib/constants";
import { OrderWizard } from "./wizard";

export default async function NewOrderPage() {
  const user = await requireUser("CLIENT");
  const styles = await db.style.findMany({ orderBy: [{ wearer: "desc" }, { name: "asc" }] });
  const home = user.lat != null && user.lng != null ? { lat: user.lat, lng: user.lng } : CITIES.Accra;

  return (
    <div>
      <h1 className="page-title mb-1">Order a new outfit</h1>
      <p className="mb-6 text-stone-600">We&apos;ll guide you step by step. You can go back at any time.</p>
      <OrderWizard styles={styles} home={home} />
    </div>
  );
}
