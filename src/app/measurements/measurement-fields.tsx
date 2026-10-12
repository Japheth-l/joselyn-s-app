import { MEASUREMENT_FIELDS, MEASUREMENT_UNITS, type MeasurementKey } from "@/lib/enums";

export type StoredValues = Record<string, { value: number; unit: "in" | "cm" }>;

const isKey = (k: string): k is MeasurementKey => k in MEASUREMENT_FIELDS;

/** Read a record's `values` JSON defensively. */
export function readValues(json: unknown): StoredValues {
  if (!json || typeof json !== "object") return {};
  const out: StoredValues = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (v && typeof v === "object" && typeof (v as { value?: unknown }).value === "number") {
      const unit = (v as { unit?: unknown }).unit === "cm" ? "cm" : "in";
      out[k] = { value: (v as { value: number }).value, unit };
    }
  }
  return out;
}

/**
 * Inputs named `m_<key>` plus a `unit` select, as `parseMeasurementForm` expects. `required` keys are
 * shown first; the rest sit in a collapsed "more measurements" section. With no `required` list every
 * field is shown.
 */
export function MeasurementFields({ required, values = {}, idPrefix = "m" }: { required?: string[]; values?: StoredValues; idPrefix?: string }) {
  const all = Object.keys(MEASUREMENT_FIELDS) as MeasurementKey[];
  const main = required ? required.filter(isKey) : all;
  const rest = required ? all.filter((k) => !main.includes(k)) : [];
  const unit = Object.values(values)[0]?.unit ?? "in";
  const input = (k: MeasurementKey) => (
    <div key={k}>
      <label className="label" htmlFor={`${idPrefix}-${k}`}>{MEASUREMENT_FIELDS[k]}</label>
      <input
        id={`${idPrefix}-${k}`} name={`m_${k}`} type="number" inputMode="decimal" step="0.25" min="0"
        defaultValue={values[k]?.value ?? ""} className="input min-h-11"
      />
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="max-w-[12rem]">
        <label className="label" htmlFor={`${idPrefix}-unit`}>Unit</label>
        <select id={`${idPrefix}-unit`} name="unit" defaultValue={unit} className="input min-h-11">
          {Object.entries(MEASUREMENT_UNITS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {required && main.length > 0 && <p className="text-sm font-medium text-stone-700">Needed for this style</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{main.map(input)}</div>
      {rest.length > 0 && (
        <details className="rounded-lg border border-stone-200 p-3">
          <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium text-stone-700">More measurements (optional)</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{rest.map(input)}</div>
        </details>
      )}
    </div>
  );
}

/** Read-only table of values. */
export function MeasurementTable({ values }: { values: StoredValues }) {
  const keys = Object.keys(values);
  if (keys.length === 0) return <p className="text-sm text-stone-500">No values recorded.</p>;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
      {keys.map((k) => (
        <div key={k} className="min-w-0 rounded-lg bg-stone-50 px-3 py-2">
          <dt className="truncate text-stone-500">{isKey(k) ? MEASUREMENT_FIELDS[k] : k}</dt>
          <dd className="font-semibold text-stone-900">{values[k].value} {values[k].unit}</dd>
        </div>
      ))}
    </dl>
  );
}
