import { currentActor } from "@/server/auth";
import { exportMyData } from "@/server/services/accounts";

// Data Protection Act right of access: everything we hold about the signed-in person, as a JSON download.
export async function GET() {
  const actor = await currentActor();
  if (!actor) return new Response("Not found", { status: 404 });
  const data = await exportMyData(actor);
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ntoma-my-data.json"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
