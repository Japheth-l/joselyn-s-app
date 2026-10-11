import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { markAllRead } from "@/app/actions/notifications";

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.some((n) => !n.read);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Notifications</h1>
        {unread && (
          <form action={markAllRead}><button className="btn-secondary py-1.5">Mark all as read</button></form>
        )}
      </div>
      {items.length === 0 && <p className="card text-stone-600">Nothing yet. We&apos;ll let you know here (and by SMS) when something happens.</p>}
      <ul className="space-y-2">
        {items.map((n) => (
          <li key={n.id}>
            <Link href={n.link || "#"} className={`card flex gap-3 hover:border-brand-500 ${n.read ? "" : "border-brand-500 bg-brand-50"}`}>
              {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
              <span className="flex-1 text-sm">{n.message}</span>
              <time className="shrink-0 text-xs text-stone-500">{n.createdAt.toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })}</time>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
