import { storage } from "@/server/storage";

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

// Public images (style photos, fabric photos, portfolios). Private files are served by /files/[id].
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const parts = (await params).key;
  const name = parts.join("/");
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!MIME[ext] || !/^[a-z0-9/_.-]+$/i.test(name) || name.includes("..")) return new Response("Not found", { status: 404 });
  // V2 keys live under public/; V1 photos were stored at the top level of the upload folder.
  const data = (await storage().get(`public/${name}`)) ?? (parts.length === 1 ? await storage().get(name) : null);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": MIME[ext], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
