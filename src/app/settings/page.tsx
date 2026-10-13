import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { Badge, PageHeader, Section } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { BRAND } from "@/lib/brand";
import { CITIES } from "@/lib/enums";
import { requireActor } from "@/server/auth";
import {
  addAddressAction, changePasswordAction, deleteAccountAction, logoutEverywhereAction, removeAddressAction,
  updateNotificationPrefsAction, updateProfileAction,
} from "../actions/account";
import { resendVerificationAction } from "../actions/auth";
import { CaptureLocation } from "./capture-location";

export const metadata = { title: "Settings" };

type Prefs = { sms?: boolean; email?: boolean; whatsapp?: boolean };

export default async function SettingsPage() {
  const actor = await requireActor();
  const user = await db.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { name: true, email: true, phone: true, city: true, emailVerifiedAt: true, notificationPrefs: true, addresses: { orderBy: { createdAt: "asc" } } },
  });
  const prefs = (user.notificationPrefs ?? {}) as Prefs;
  const smsReady = !!process.env.ARKESEL_API_KEY;
  const emailReady = !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" subtitle="Your profile, sign-in, notifications, addresses and privacy." />

      <Section title="Profile">
        <ActionForm action={updateProfileAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">Full name</label>
            <input id="name" name="name" required minLength={2} maxLength={100} autoComplete="name" defaultValue={user.name} className="input min-h-11" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="phone">Phone (also your Mobile Money number for payouts)</label>
              <input id="phone" name="phone" type="tel" required autoComplete="tel" defaultValue={user.phone} className="input min-h-11" />
            </div>
            <div>
              <label className="label" htmlFor="city">City</label>
              <select id="city" name="city" required defaultValue={user.city ?? ""} className="input min-h-11">
                <option value="" disabled>Choose…</option>
                {Object.keys(CITIES).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto">Save profile</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Email" actions={user.emailVerifiedAt ? <Badge tone="green">✓ Confirmed</Badge> : <Badge tone="gold">Not confirmed</Badge>}>
        <p className="break-words text-sm text-stone-700">{user.email}</p>
        {user.emailVerifiedAt ? (
          <p className="text-sm text-stone-600">Your email address is confirmed. To change it, contact support at {BRAND.supportEmail}.</p>
        ) : (
          <ActionForm action={resendVerificationAction} className="space-y-3">
            <p className="text-sm text-stone-600">Please confirm your email using the link we sent you. Didn't get it? Check your spam folder or send a new one.</p>
            <SubmitButton className="btn-secondary min-h-11 w-full sm:w-auto">Resend confirmation email</SubmitButton>
          </ActionForm>
        )}
      </Section>

      <Section title="Password">
        <ActionForm action={changePasswordAction} resetOnSuccess className="space-y-4">
          <div>
            <label className="label" htmlFor="current">Current password</label>
            <input id="current" name="current" type="password" required autoComplete="current-password" className="input min-h-11" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="password">New password</label>
              <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input min-h-11" />
            </div>
            <div>
              <label className="label" htmlFor="confirm">Repeat new password</label>
              <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input min-h-11" />
            </div>
          </div>
          <p className="text-xs text-stone-500">At least 8 characters. Changing your password keeps you signed in here and signs you out on every other device.</p>
          <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto">Change password</SubmitButton>
        </ActionForm>
        <ActionForm action={logoutEverywhereAction} className="space-y-2 border-t border-stone-100 pt-4">
          <p className="text-sm text-stone-600">Lost a phone or used a shared computer? Sign out on every device, including this one.</p>
          <ConfirmButton className="btn-secondary min-h-11 w-full sm:w-auto">Sign out everywhere</ConfirmButton>
        </ActionForm>
      </Section>

      <Section title="Notifications">
        <p className="text-sm text-stone-600">You always see updates here in the app (🔔). Choose where else we should send them.</p>
        <ActionForm action={updateNotificationPrefsAction} className="space-y-3">
          <label className="flex min-h-11 items-start gap-3 rounded-lg border border-stone-200 px-3 py-2">
            <input type="checkbox" name="sms" defaultChecked={prefs.sms !== false} className="mt-0.5 h-5 w-5 accent-brand-600" />
            <span className="text-sm"><span className="font-medium">SMS</span> to {user.phone}{!smsReady && <span className="block text-xs text-stone-500">SMS sending isn't set up on this server yet, so no texts are sent for now.</span>}</span>
          </label>
          <label className="flex min-h-11 items-start gap-3 rounded-lg border border-stone-200 px-3 py-2">
            <input type="checkbox" name="email" defaultChecked={prefs.email !== false} className="mt-0.5 h-5 w-5 accent-brand-600" />
            <span className="min-w-0 text-sm"><span className="font-medium">Email</span> <span className="break-all">to {user.email}</span>{!emailReady && <span className="block text-xs text-stone-500">Email sending isn't set up on this server yet, so no emails are sent for now.</span>}</span>
          </label>
          <label className="flex min-h-11 items-start gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-500">
            <input type="checkbox" name="whatsapp" disabled className="mt-0.5 h-5 w-5" />
            <span className="text-sm"><span className="font-medium">WhatsApp</span> — not available yet</span>
          </label>
          <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto">Save preferences</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Saved addresses">
        {user.addresses.length === 0 ? (
          <p className="text-sm text-stone-600">No saved addresses yet. Saving one makes ordering quicker.</p>
        ) : (
          <ul className="space-y-2">
            {user.addresses.map((ad) => (
              <li key={ad.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 p-3">
                <div className="min-w-0">
                  <p className="font-semibold">{ad.label}</p>
                  <p className="break-words text-sm text-stone-600">{ad.addressText}</p>
                  <p className="text-xs text-stone-500">{ad.lat != null && ad.lng != null ? "📍 Map location saved" : "No map location"}</p>
                </div>
                <ActionForm action={removeAddressAction} className="space-y-1" showSuccess={false}>
                  <input type="hidden" name="addressId" value={ad.id} />
                  <ConfirmButton className="btn-danger min-h-11">Remove</ConfirmButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
        {user.addresses.length < 10 && (
          <details className="rounded-lg border border-stone-200 p-3">
            <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold text-brand-700">+ Add an address</summary>
            <ActionForm action={addAddressAction} resetOnSuccess className="mt-3 space-y-4">
              <div>
                <label className="label" htmlFor="ad-label">Name</label>
                <input id="ad-label" name="label" required maxLength={40} placeholder="Home, Work, Mum's house…" className="input min-h-11" />
              </div>
              <div>
                <label className="label" htmlFor="ad-text">Address or landmark</label>
                <textarea id="ad-text" name="addressText" required minLength={3} maxLength={300} rows={2} placeholder="e.g. House 12, near the Shell station, East Legon" className="input" />
              </div>
              <CaptureLocation note="Optional. Helps riders and measurement professionals find you after they accept a job." />
              <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto">Save address</SubmitButton>
            </ActionForm>
          </details>
        )}
      </Section>

      <Section title="Privacy">
        <div className="space-y-2">
          <p className="text-sm text-stone-600">Download a copy of the personal data we hold about you (profile, addresses, orders, measurements, reviews).</p>
          <a href="/settings/export" className="btn-secondary min-h-11 w-full sm:w-auto" download>Download my data</a>
        </div>
        <details className="rounded-lg border border-red-200 p-3">
          <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold text-red-700">Delete my account</summary>
          <ActionForm action={deleteAccountAction} className="mt-3 space-y-3">
            <p className="text-sm text-stone-700">
              This removes your name, contact details, addresses and measurements, and signs you out everywhere. It can't be undone.
              Records of orders and payments are kept without your personal details, because the law requires us to keep financial records.
              You can't delete your account while an order is in progress or while you own a business.
            </p>
            <div>
              <label className="label" htmlFor="del-password">Enter your password to confirm</label>
              <input id="del-password" name="password" type="password" required autoComplete="current-password" className="input min-h-11" />
            </div>
            <ConfirmButton className="btn-danger min-h-11 w-full sm:w-auto" confirmText="Tap again to delete for good">Delete my account</ConfirmButton>
          </ActionForm>
        </details>
      </Section>
    </div>
  );
}
