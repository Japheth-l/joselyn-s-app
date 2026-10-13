import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PageHeader } from "@/components/ui/basics";
import { BRAND } from "@/lib/brand";
import { BUSINESS_KINDS, CITIES } from "@/lib/enums";
import { requireActor } from "@/server/auth";
import { createBusinessAction } from "../../actions/business";
import { LocationFields } from "../location-fields";

export const metadata = { title: "Register your business" };

export default async function NewBusinessPage() {
  const actor = await requireActor();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Register your business"
        subtitle={`Tailors, seamstresses, tailoring companies and fabric sellers can take orders on ${BRAND.name}.`}
        back={{ href: "/biz", label: "My businesses" }}
      />
      <div role="note" className="mb-6 rounded-lg border border-gold-400 bg-gold-100 px-4 py-3 text-sm text-amber-900">
        Your business stays hidden from customers until an administrator has checked your documents and verified it. You can set up your
        profile, styles and fabric in the meantime, but you can&apos;t send quotes or fulfil orders until then.
      </div>
      <ActionForm action={createBusinessAction} className="card space-y-5">
        <div>
          <label className="label" htmlFor="name">Business name</label>
          <input id="name" name="name" required minLength={2} maxLength={100} className="input" />
        </div>
        <fieldset>
          <legend className="label">What does the business do?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(BUSINESS_KINDS).map(([k, v]) => (
              <label key={k} className="flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm">
                <input type="checkbox" name="kinds" value={k} /> {v}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="label" htmlFor="description">Short description</label>
          <textarea id="description" name="description" rows={3} maxLength={1000} className="input" placeholder="What you sew, your experience, what makes your work special" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="phone">Business phone</label>
            <input id="phone" name="phone" type="tel" required defaultValue={actor.phone} className="input" />
            <p className="mt-1 text-xs text-stone-500">Also used for Mobile Money payouts. You can change that later.</p>
          </div>
          <div>
            <label className="label" htmlFor="email">Business email (optional)</label>
            <input id="email" name="email" type="email" className="input" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="address">Workshop address or landmark</label>
            <input id="address" name="address" required minLength={3} maxLength={300} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="city">City</label>
            <select id="city" name="city" required className="input" defaultValue="">
              <option value="" disabled>Choose a city</option>
              {Object.keys(CITIES).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <LocationFields fallback="If you don't share your location, we place your pin at the centre of your city until you update it." />
        <div>
          <label className="label" htmlFor="registrationNumber">Business registration or Ghana Card number</label>
          <input id="registrationNumber" name="registrationNumber" required minLength={5} maxLength={40} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="documents">Verification documents</label>
          <input id="documents" name="documents" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="input" />
          <p className="mt-1 text-xs text-stone-500">
            Business registration certificate and/or the owner&apos;s Ghana Card (JPG, PNG, WebP or PDF, up to 5 files, 5 MB each). Only administrators reviewing your application can see them.
          </p>
        </div>
        <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Registering…">Register business</SubmitButton>
      </ActionForm>
    </div>
  );
}
