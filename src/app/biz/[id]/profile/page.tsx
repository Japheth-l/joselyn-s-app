import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { Empty, Section } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { BUSINESS_KINDS, CITIES } from "@/lib/enums";
import { atLeast, businessPage } from "@/server/queries/business";
import { addPortfolioPhotoAction, removePortfolioPhotoAction, updateProfileAction } from "../../../actions/business";
import { LocationFields } from "../../location-fields";

export const metadata = { title: "Business profile" };

const DAYS = [
  ["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"],
] as const;

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, business: b } = await businessPage(id);
  const manager = atLeast(role, "MANAGER");
  const [categories, photos] = await Promise.all([
    db.garmentCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.businessPhoto.findMany({ where: { businessId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  const hours = (b.operatingHours && typeof b.operatingHours === "object" ? b.operatingHours : {}) as Record<string, unknown>;

  return (
    <div className="space-y-6">
      {manager ? (
        <Section title="Profile">
          <ActionForm action={updateProfileAction} className="space-y-5">
            <input type="hidden" name="businessId" value={id} />
            <div>
              <label className="label" htmlFor="name">Business name</label>
              <input id="name" name="name" required maxLength={100} defaultValue={b.name} className="input" />
            </div>
            <fieldset>
              <legend className="label">What the business does</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(BUSINESS_KINDS).map(([k, v]) => (
                  <label key={k} className="flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm">
                    <input type="checkbox" name="kinds" value={k} defaultChecked={b.kinds.includes(k)} /> {v}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="label" htmlFor="description">Description</label>
              <textarea id="description" name="description" rows={4} maxLength={1000} defaultValue={b.description} className="input" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="phone">Phone</label>
                <input id="phone" name="phone" type="tel" required defaultValue={b.phone} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="email">Email (optional)</label>
                <input id="email" name="email" type="email" defaultValue={b.email ?? ""} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="address">Workshop address or landmark</label>
                <input id="address" name="address" required maxLength={300} defaultValue={b.address} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="city">City</label>
                <select id="city" name="city" required defaultValue={b.city} className="input">
                  {Object.keys(CITIES).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <LocationFields fallback={`Your map pin is saved at ${b.lat.toFixed(4)}, ${b.lng.toFixed(4)}. It stays the same unless you update it here.`} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="serviceRadiusKm">Service radius (km)</label>
                <input id="serviceRadiusKm" name="serviceRadiusKm" type="number" min={1} max={200} required defaultValue={b.serviceRadiusKm} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="capacityPerWeek">Garments you can take on per week</label>
                <input id="capacityPerWeek" name="capacityPerWeek" type="number" min={1} max={1000} required defaultValue={b.capacityPerWeek} className="input" />
              </div>
            </div>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" name="offersWorkshopFitting" defaultChecked={b.offersWorkshopFitting} />
              Customers can come to the workshop to be measured
            </label>
            <fieldset>
              <legend className="label">Garments you sew</legend>
              {categories.length === 0 ? (
                <p className="text-sm text-stone-600">No garment categories are set up yet.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-3">
                  {categories.map((c) => (
                    <label key={c.id} className="flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm">
                      <input type="checkbox" name="skills" value={c.slug} defaultChecked={b.skills.includes(c.slug)} /> {c.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <fieldset>
              <legend className="label">Opening hours</legend>
              <p className="mb-2 text-xs text-stone-500">Like 08:00-18:00. Leave empty for closed.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {DAYS.map(([k, label]) => (
                  <div key={k} className="grid grid-cols-[6rem_1fr] items-center gap-2">
                    <label htmlFor={`hours_${k}`} className="text-sm text-stone-700">{label}</label>
                    <input
                      id={`hours_${k}`} name={`hours_${k}`} maxLength={20} pattern="\d{2}:\d{2}-\d{2}:\d{2}" placeholder="Closed"
                      defaultValue={typeof hours[k] === "string" ? (hours[k] as string) : ""} className="input"
                    />
                  </div>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="label" htmlFor="payoutPhone">Mobile Money number for payouts</label>
              <input id="payoutPhone" name="payoutPhone" type="tel" defaultValue={b.payoutPhone ?? ""} className="input sm:max-w-xs" />
              <p className="mt-1 text-xs text-stone-500">Leave empty to use the business phone.</p>
            </div>
            <SubmitButton pendingText="Saving…">Save profile</SubmitButton>
          </ActionForm>
        </Section>
      ) : (
        <p className="text-sm text-stone-600">Only owners and managers can edit the business profile. You can add portfolio photos below.</p>
      )}

      <Section title="Portfolio">
        <p className="text-sm text-stone-600">Photos of your finished work, shown on your public profile once you&apos;re verified.</p>
        {photos.length === 0 ? (
          <Empty title="No portfolio photos yet" />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map((p) => (
              <li key={p.id} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption || "Portfolio photo"} className="aspect-square w-full rounded-lg border border-stone-200 object-cover" />
                {p.caption && <p className="break-words text-xs text-stone-600">{p.caption}</p>}
                {manager && (
                  <ActionForm action={removePortfolioPhotoAction} showSuccess={false}>
                    <input type="hidden" name="businessId" value={id} />
                    <input type="hidden" name="photoId" value={p.id} />
                    <ConfirmButton className="btn-danger w-full px-2 py-1.5 text-xs">Remove</ConfirmButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={addPortfolioPhotoAction} resetOnSuccess className="space-y-3 border-t border-stone-100 pt-4">
          <input type="hidden" name="businessId" value={id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="photo">Photo</label>
              <input id="photo" name="photo" type="file" required accept="image/jpeg,image/png,image/webp" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="caption">Caption (optional)</label>
              <input id="caption" name="caption" maxLength={200} className="input" />
            </div>
          </div>
          <SubmitButton className="btn-secondary">Add photo</SubmitButton>
        </ActionForm>
      </Section>
    </div>
  );
}
