import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { Badge, PageHeader, Section } from "@/components/ui/basics";
import { resetTemplateAction, setTemplateAction, updateSettingAction } from "@/app/actions/admin";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { TEMPLATES } from "@/server/notifications/templates";
import { userNames } from "@/server/queries/admin";
import { DEFAULT_SETTINGS, SETTING_LABELS, getSettings, type SettingKey } from "@/server/settings";
import { requireAdminPage } from "../_lib/guard";

export const metadata = { title: "Settings & templates" };

const isMoney = (k: string) => k.endsWith("Minor");
const isBps = (k: string) => k.endsWith("Bps");
const show = (k: string, v: number) => (isMoney(k) ? formatMoney(v) : isBps(k) ? `${v} bps (${(v / 100).toFixed(2).replace(/\.?0+$/, "")}%)` : String(v));
const label = (k: SettingKey) => (isMoney(k) ? SETTING_LABELS[k].replace(/\s*\(pesewas\)/, "") + " (GH₵)" : SETTING_LABELS[k]);
const placeholders = (s: string) => [...new Set([...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];

export default async function SettingsPage() {
  await requireAdminPage("CONFIG");
  const [settings, rows, overrides] = await Promise.all([getSettings(), db.platformSetting.findMany(), db.notificationTemplate.findMany()]);
  const stored = new Map(rows.map((r) => [r.key, r]));
  const editors = await userNames(rows.map((r) => r.updatedById));
  const override = new Map(overrides.map((o) => [o.key, o]));
  const keys = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

  return (
    <div className="space-y-6">
      <PageHeader title="Settings & templates" subtitle="Fees and rules apply to new quotations, orders and deliveries from the moment you save. Every change is audited." />

      <Section title="Platform settings">
        <p className="text-sm text-stone-600">Money is typed in cedis (stored internally in pesewas). Rates are in basis points: 100 bps = 1%, 10000 bps = 100%.</p>
        <ul className="divide-y divide-stone-100">
          {keys.map((k) => {
            const row = stored.get(k);
            const v = settings[k];
            return (
              <li key={k} className="py-4">
                <ActionForm action={updateSettingAction} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <input type="hidden" name="key" value={k} />
                  <div>
                    <label className="label" htmlFor={`set-${k}`}>{label(k)}</label>
                    <input id={`set-${k}`} name="value" required inputMode={isMoney(k) ? "decimal" : "numeric"} defaultValue={isMoney(k) ? (v / 100).toFixed(2) : String(v)} className="input" />
                    <p className="mt-1 text-xs text-stone-500">
                      Current: {show(k, v)} · default {show(k, DEFAULT_SETTINGS[k])}
                      {row ? ` · changed ${formatDateTime(row.updatedAt)}${row.updatedById ? ` by ${editors.get(row.updatedById)?.name ?? "unknown"}` : ""}` : " · using the default"}
                    </p>
                  </div>
                  <SubmitButton className="btn-secondary">Save</SubmitButton>
                </ActionForm>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Message templates">
        <p className="text-sm text-stone-600">The wording of SMS, email and in-app notifications. Keep messages under 480 characters. Only the placeholders listed for each message can be used.</p>
        <ul className="divide-y divide-stone-100">
          {(Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map((key) => {
            const o = override.get(key);
            const ph = placeholders(TEMPLATES[key]);
            return (
              <li key={key} className="space-y-2 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-all font-mono text-sm font-semibold">{key}</p>
                  {o ? <Badge tone="gold">Customised {formatDateTime(o.updatedAt)}</Badge> : <Badge>Default</Badge>}
                </div>
                <p className="break-words text-xs text-stone-500">Default: “{TEMPLATES[key]}”</p>
                <p className="break-words text-xs text-stone-500">Placeholders: {ph.length ? ph.map((p) => `{{${p}}}`).join(", ") : "none"}</p>
                <ActionForm action={setTemplateAction} className="space-y-2">
                  <input type="hidden" name="key" value={key} />
                  <label className="sr-only" htmlFor={`tpl-${key}`}>Wording for {key}</label>
                  <textarea id={`tpl-${key}`} name="body" required maxLength={480} rows={2} defaultValue={o?.body ?? TEMPLATES[key]} className="input" />
                  <SubmitButton className="btn-secondary">Save wording</SubmitButton>
                </ActionForm>
                {o && (
                  <ActionForm action={resetTemplateAction}>
                    <input type="hidden" name="key" value={key} />
                    <ConfirmButton className="btn-secondary" confirmText="Tap again to reset">Reset to default</ConfirmButton>
                  </ActionForm>
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
