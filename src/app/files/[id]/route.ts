import { currentActor } from "@/server/auth";
import { canReadFile } from "@/server/files";
import { storage } from "@/server/storage";

// Private files (verification documents, message and dispute attachments, reference photos).
// Same 404 whether the file doesn't exist or the person may not see it.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  if (!actor) return new Response("Not found", { status: 404 });
  const file = await canReadFile(actor, (await params).id);
  if (!file) return new Response("Not found", { status: 404 });
  const data = await storage().get(file.storageKey);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": file.mime === "application/pdf" ? "attachment" : "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
