import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Empty, PageHeader } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { requireActor } from "@/server/auth";
import { markAllReadAction, markReadAction } from "../actions/account";

export const metadata = { title: "Notifications" };

/** Only same-site relative links are followed. */
const safeLink = (link: string) => (link.startsWith("/") && !link.startsWith("//") && !link.startsWith("/\\") ? link : null);

export default async function NotificationsPage() {
  const actor = await requireActor();
  const items = await db.notification.findMany({
    where: { userId: actor.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, message: true, link: true, read: true, createdAt: true },
  });
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "You're all caught up."}
        actions={unread > 0 ? (
          <ActionForm action={markAllReadAction} className="space-y-1" showSuccess={false}>
            <SubmitButton className="btn-secondary min-h-11">Mark all as read</SubmitButton>
          </ActionForm>
        ) : undefined}
      />
      {items.length === 0 ? (
        <Empty title="No notifications yet">Updates about your orders, visits and deliveries will appear here.</Empty>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const href = safeLink(n.link);
            return (
              <li key={n.id} className={`rounded-xl border p-3 ${n.read ? "border-stone-200 bg-white" : "border-brand-500 bg-brand-50"}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    {!n.read && <Badge tone="green">New</Badge>}
                    {href ? (
                      <Link href={href} className="block break-words text-sm font-medium text-stone-900 hover:underline">{n.message}</Link>
                    ) : (
                      <p className="break-words text-sm text-stone-900">{n.message}</p>
                    )}
                    <p className="text-xs text-stone-500">{formatDateTime(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <ActionForm action={markReadAction} className="shrink-0" showSuccess={false}>
                      <input type="hidden" name="notificationId" value={n.id} />
                      <SubmitButton className="btn-secondary min-h-10 px-3 text-xs" pendingText="…">Mark read</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
