"use client";

import { useActionState, useState } from "react";
import { signup } from "../actions/auth";
import { BUSINESS_KINDS, CITIES } from "@/lib/constants";

const CHOICES = [
  { value: "CLIENT", title: "I need clothes sewn", text: "Order outfits and buy fabric" },
  { value: "BUSINESS", title: "I sew clothes", text: "Tailor, seamstress or sewing company" },
  { value: "MEASURER", title: "I take measurements", text: "Visit clients to measure them" },
  { value: "RIDER", title: "I deliver", text: "Deliver finished outfits" },
];

export function SignupForm({ initialRole }: { initialRole: string }) {
  const [role, setRole] = useState(CHOICES.some((c) => c.value === initialRole) ? initialRole : "CLIENT");
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <form action={action} className="card space-y-5">
      <fieldset>
        <legend className="label">I am joining as…</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CHOICES.map((c) => (
            <label
              key={c.value}
              className={`cursor-pointer rounded-lg border p-3 text-sm ${role === c.value ? "border-brand-500 bg-brand-50" : "border-stone-200"}`}
            >
              <input type="radio" name="role" value={c.value} checked={role === c.value} onChange={() => setRole(c.value)} className="sr-only" />
              <span className="block font-semibold">{c.title}</span>
              <span className="text-stone-500">{c.text}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Full name" autoComplete="name" />
        <Field name="phone" label="Phone (MoMo number)" type="tel" placeholder="024 123 4567" autoComplete="tel" />
        <Field name="email" label="Email" type="email" autoComplete="email" />
        <Field name="password" label="Password" type="password" autoComplete="new-password" />
        <div>
          <label className="label" htmlFor="city">City</label>
          <select className="input" id="city" name="city" defaultValue="Accra">
            {Object.keys(CITIES).map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {role === "BUSINESS" && (
        <div className="space-y-4 rounded-lg bg-stone-50 p-4">
          <p className="text-sm text-stone-600">
            Your business will be reviewed before clients can order from you. You can set your exact shop location after signing up.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="businessName" label="Business name" />
            <div>
              <label className="label" htmlFor="kind">Type of business</label>
              <select className="input" id="kind" name="kind">
                {Object.entries(BUSINESS_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <Field name="address" label="Shop address / landmark" placeholder="Near Kaneshie Market" />
            <Field name="registrationNumber" label="Business reg. or Ghana Card no." />
          </div>
        </div>
      )}

      {(role === "MEASURER" || role === "RIDER") && (
        <div className="space-y-4 rounded-lg bg-stone-50 p-4">
          <p className="text-sm text-stone-600">We verify your identity before you can take jobs.</p>
          <Field name="ghanaCardNumber" label="Ghana Card number" placeholder="GHA-123456789-0" />
        </div>
      )}

      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
    </form>
  );
}

function Field({ name, label, type = "text", ...rest }: { name: string; label: string; type?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input className="input" id={name} name={name} type={type} required {...rest} />
    </div>
  );
}
