import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { BUSINESS_KINDS, ROLE_LABELS, VERIFICATION_LABELS, type Role } from "@/lib/constants";
import { verifyAgent, verifyBusiness } from "@/app/actions/admin";

export default async function AdminPage() {
  await requireUser("ADMIN");
  const [businesses, agents, counts] = await Promise.all([
    db.business.findMany({ include: { owner: true }, orderBy: [{ verificationStatus: "asc" }, { createdAt: "desc" }] }),
    db.user.findMany({ where: { role: { in: ["MEASURER", "RIDER"] } }, orderBy: [{ verificationStatus: "asc" }, { createdAt: "desc" }] }),
    db.order.groupBy({ by: ["status"], _count: true }),
  ]);
  const pendingFirst = <T extends { verificationStatus: string }>(xs: T[]) =>
    [...xs].sort((a, b) => Number(b.verificationStatus === "PENDING") - Number(a.verificationStatus === "PENDING"));

  return (
    <div className="space-y-8">
      <h1 className="page-title">Admin</h1>

      <section className="flex flex-wrap gap-3">
        {counts.map((c) => (
          <div key={c.status} className="card px-4 py-3 text-sm">
            <div className="text-2xl font-bold">{c._count}</div>
            <div className="text-stone-500">{c.status.replaceAll("_", " ").toLowerCase()}</div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Businesses</h2>
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr><th className="p-3">Business</th><th className="p-3">Owner</th><th className="p-3">Registration</th><th className="p-3">Status</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {pendingFirst(businesses).map((b) => (
                <tr key={b.id} className="border-t border-stone-100">
                  <td className="p-3"><div className="font-medium">{b.name}</div><div className="text-stone-500">{BUSINESS_KINDS[b.kind as keyof typeof BUSINESS_KINDS]} · {b.address}, {b.city}</div></td>
                  <td className="p-3">{b.owner.name}<div className="text-stone-500">{b.owner.phone}</div></td>
                  <td className="p-3 font-mono">{b.registrationNumber}</td>
                  <td className="p-3"><StatusPill status={b.verificationStatus} /></td>
                  <td className="p-3"><Decide onVerify={verifyBusiness.bind(null, b.id, "VERIFIED")} onReject={verifyBusiness.bind(null, b.id, "REJECTED")} status={b.verificationStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Measurement agents & riders</h2>
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr><th className="p-3">Name</th><th className="p-3">Role</th><th className="p-3">Ghana Card</th><th className="p-3">Status</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {pendingFirst(agents).map((a) => (
                <tr key={a.id} className="border-t border-stone-100">
                  <td className="p-3"><div className="font-medium">{a.name}</div><div className="text-stone-500">{a.phone} · {a.email}</div></td>
                  <td className="p-3">{ROLE_LABELS[a.role as Role]}</td>
                  <td className="p-3 font-mono">{a.ghanaCardNumber}</td>
                  <td className="p-3"><StatusPill status={a.verificationStatus} /></td>
                  <td className="p-3"><Decide onVerify={verifyAgent.bind(null, a.id, "VERIFIED")} onReject={verifyAgent.bind(null, a.id, "REJECTED")} status={a.verificationStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = status === "VERIFIED" ? "bg-brand-100 text-brand-700" : status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-gold-100 text-gold-500";
  return <span className={`badge ${color}`}>{VERIFICATION_LABELS[status]}</span>;
}

function Decide({ onVerify, onReject, status }: { onVerify: () => Promise<void>; onReject: () => Promise<void>; status: string }) {
  return (
    <div className="flex justify-end gap-2">
      {status !== "VERIFIED" && <form action={onVerify}><button className="btn-primary py-1.5">Verify</button></form>}
      {status !== "REJECTED" && <form action={onReject}><button className="btn-danger py-1.5">{status === "VERIFIED" ? "Suspend" : "Reject"}</button></form>}
    </div>
  );
}
