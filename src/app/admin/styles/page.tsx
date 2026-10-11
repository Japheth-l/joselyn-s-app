import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { setStylePhoto } from "@/app/actions/admin";
import { PhotoButton } from "@/components/photo-button";
import { StyleImage } from "@/components/swatch";
import { AddStyleForm } from "./add-style-form";

export default async function AdminStyles() {
  await requireUser("ADMIN");
  const styles = await db.style.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { businesses: true } } } });

  return (
    <div className="space-y-6">
      <h1 className="page-title">Style catalogue</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <ul className="grid gap-3 sm:grid-cols-2">
          {styles.map((s) => (
            <li key={s.id} className="card flex gap-3">
              <StyleImage icon={s.icon} imageUrl={s.imageUrl} className="h-20 w-20 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold">{s.name}</p>
                <p className="text-xs text-stone-500">{s.wearer.toLowerCase()} · {s.yardsNeeded} yd · {s._count.businesses} tailors</p>
                <PhotoButton action={setStylePhoto.bind(null, s.id)} label={s.imageUrl ? "Change photo" : "Add photo"} />
              </div>
            </li>
          ))}
        </ul>
        <aside><AddStyleForm /></aside>
      </div>
    </div>
  );
}
