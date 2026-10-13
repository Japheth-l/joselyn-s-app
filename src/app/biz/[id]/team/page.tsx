import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { Badge, Section } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { labelOf, MEMBERSHIP_ROLES } from "@/lib/enums";
import { formatDate } from "@/lib/time";
import { businessPage } from "@/server/queries/business";
import { addMemberAction, changeMemberRoleAction, removeMemberAction } from "../../../actions/business";

export const metadata = { title: "Team" };

const ROLE_HELP: Record<string, string> = {
  OWNER: "Everything, including the team and verification.",
  MANAGER: "Quotes, prices, styles, fabric, finances and cancellations.",
  STAFF: "Moves orders through production, records measurements and stock, hands orders over.",
};

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, role } = await businessPage(id);
  const owner = role === "OWNER";
  const members = await db.membership.findMany({
    where: { businessId: id },
    select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <Section title="Members">
        <ul className="divide-y divide-stone-100">
          {members.map((m) => (
            <li key={m.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{m.user.name}{m.user.id === actor.userId ? " (you)" : ""}</p>
                  <p className="truncate text-sm text-stone-600">{m.user.email} · since {formatDate(m.createdAt)}</p>
                </div>
                <Badge tone={m.role === "OWNER" ? "green" : "grey"}>{labelOf(MEMBERSHIP_ROLES, m.role)}</Badge>
              </div>
              {owner && m.role !== "OWNER" && (
                <div className="flex flex-wrap items-end gap-3">
                  <ActionForm action={changeMemberRoleAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="businessId" value={id} />
                    <input type="hidden" name="membershipId" value={m.id} />
                    <div>
                      <label className="label" htmlFor={`role-${m.id}`}>Role</label>
                      <select id={`role-${m.id}`} name="role" defaultValue={m.role} className="input">
                        <option value="MANAGER">Manager</option>
                        <option value="STAFF">Staff</option>
                      </select>
                    </div>
                    <SubmitButton className="btn-secondary">Change role</SubmitButton>
                  </ActionForm>
                  <ActionForm action={removeMemberAction}>
                    <input type="hidden" name="businessId" value={id} />
                    <input type="hidden" name="membershipId" value={m.id} />
                    <ConfirmButton>Remove</ConfirmButton>
                  </ActionForm>
                </div>
              )}
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t border-stone-100 pt-3 text-sm">
          {Object.entries(ROLE_HELP).map(([k, v]) => (
            <div key={k}><dt className="inline font-medium">{labelOf(MEMBERSHIP_ROLES, k)}: </dt><dd className="inline text-stone-600">{v}</dd></div>
          ))}
        </dl>
      </Section>

      {owner ? (
        <Section title="Add a member">
          <ActionForm action={addMemberAction} resetOnSuccess>
            <input type="hidden" name="businessId" value={id} />
            <p className="text-sm text-stone-600">The person needs their own account first. Enter the email they signed up with.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" name="email" type="email" required className="input" />
              </div>
              <div>
                <label className="label" htmlFor="role">Role</label>
                <select id="role" name="role" defaultValue="STAFF" className="input">
                  <option value="STAFF">Staff</option>
                  <option value="MANAGER">Manager</option>
                </select>
              </div>
            </div>
            <SubmitButton>Add member</SubmitButton>
          </ActionForm>
        </Section>
      ) : (
        <p className="text-sm text-stone-600">Only the owner can add or remove members.</p>
      )}
    </div>
  );
}
