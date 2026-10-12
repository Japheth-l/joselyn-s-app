import { ActionForm, ConfirmButton } from "@/components/ui/action-form";
import { VerificationBadge } from "@/components/ui/basics";
import { setSubjectStatusAction } from "@/app/actions/admin";

/** Suspend or reinstate a business or professional profile (needs VERIFY; the service re-checks). */
export function SubjectStatusForm({ subjectType, subjectId, status, name }: { subjectType: "BUSINESS" | "MEASURER" | "RIDER"; subjectId: string; status: string; name: string }) {
  const suspended = status === "SUSPENDED";
  return (
    <div className="space-y-3 rounded-lg border border-stone-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-medium">{name}</p>
        <VerificationBadge status={status} />
      </div>
      {suspended || status === "VERIFIED" ? (
        <ActionForm action={setSubjectStatusAction} resetOnSuccess className="space-y-3">
          <input type="hidden" name="subjectType" value={subjectType} />
          <input type="hidden" name="subjectId" value={subjectId} />
          <input type="hidden" name="status" value={suspended ? "VERIFIED" : "SUSPENDED"} />
          <div>
            <label className="label" htmlFor={`reason-${subjectType}-${subjectId}`}>Reason (kept in the audit log)</label>
            <input id={`reason-${subjectType}-${subjectId}`} name="reason" required maxLength={500} className="input" />
          </div>
          <ConfirmButton className={suspended ? "btn-secondary" : "btn-danger"} confirmText={suspended ? "Tap again to reinstate" : "Tap again to suspend"}>
            {suspended ? "Reinstate" : "Suspend"}
          </ConfirmButton>
        </ActionForm>
      ) : (
        <p className="text-xs text-stone-500">Only verified profiles can be suspended, and only suspended ones reinstated. Use the verification decision for pending applications.</p>
      )}
    </div>
  );
}
