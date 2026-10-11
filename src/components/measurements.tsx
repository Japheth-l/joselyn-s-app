import { MEASUREMENT_FIELDS } from "@/lib/constants";

export function MeasurementForm({ action, submitLabel = "Send measurements to tailor" }: {
  action: (formData: FormData) => Promise<void>; submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-3 rounded-lg bg-stone-50 p-3">
      <p className="text-xs text-stone-500">In inches. Fill in at least three.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MEASUREMENT_FIELDS.map((f) => (
          <label key={f.key} className="text-xs font-medium text-stone-600">
            {f.label}
            <input name={f.key} type="number" min={1} max={120} step={0.5} inputMode="decimal" className="input mt-1" />
          </label>
        ))}
      </div>
      <button className="btn-primary">{submitLabel}</button>
    </form>
  );
}

export function MeasurementList({ json }: { json: string | null }) {
  if (!json) return null;
  const m: Record<string, number> = JSON.parse(json);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
      {MEASUREMENT_FIELDS.filter((f) => m[f.key]).map((f) => (
        <div key={f.key}><dt className="text-xs text-stone-500">{f.label}</dt><dd className="font-medium">{m[f.key]}&quot;</dd></div>
      ))}
    </dl>
  );
}
