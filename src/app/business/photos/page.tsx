import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { removePortfolioPhoto } from "@/app/actions/business";
import { AddPhotoForm } from "./add-photo-form";

export default async function PhotosPage() {
  const user = await requireUser("BUSINESS");
  const photos = await db.businessPhoto.findMany({ where: { businessId: user.business!.id }, orderBy: { createdAt: "desc" } });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section>
        <p className="mb-3 text-sm text-stone-600">Show clients your best work. These photos appear on your public profile.</p>
        {photos.length === 0 && <p className="card text-stone-600">No photos yet. Add pictures of outfits you&apos;ve made.</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <figure key={p.id} className="card overflow-hidden p-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.caption || "Portfolio photo"} className="aspect-square w-full object-cover" />
              <figcaption className="flex items-center justify-between gap-2 p-2 text-xs">
                <span className="truncate">{p.caption}</span>
                <form action={removePortfolioPhoto.bind(null, p.id)}>
                  <button className="text-red-700 hover:underline">Remove</button>
                </form>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
      <aside><AddPhotoForm /></aside>
    </div>
  );
}
