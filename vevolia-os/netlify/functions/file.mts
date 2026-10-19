// Team-only files (kept out of the public folder). Read from private/ if it was deployed, else from the
// copy uploaded through the site's "Load my data" button (stored in Netlify Blobs).
import type { Config } from "@netlify/functions";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { denied, isAuthed, json } from "../../lib/auth.mts";
import { store } from "../../lib/store.mts";

const FILES: Record<string, [string, string]> = {
  "testing.pdf": ["Avant_Testing_Philosophy.pdf", "application/pdf"],
};
const MAX_BYTES = 4_000_000;

export default async (req: Request) => {
  if (!isAuthed(req)) return denied();
  const name = new URL(req.url).pathname.split("/").pop() || "";
  const f = FILES[name];
  if (!f) return new Response("Not found", { status: 404 });

  if (req.method === "POST") {
    const body = await req.arrayBuffer();
    if (!body.byteLength || body.byteLength > MAX_BYTES) return json({ code: "invalid_argument" }, 400);
    await store().set("file/" + name, body);
    return json({ ok: true });
  }

  const body = await readFile(join(process.cwd(), "private", f[0])).catch(() => null)
    ?? await store().get("file/" + name, { type: "arrayBuffer" }).catch(() => null);
  if (!body) return new Response("This file is not uploaded yet.", { status: 404 });
  return new Response(body, { headers: { "content-type": f[1], "cache-control": "private, max-age=3600" } });
};

export const config: Config = { path: "/api/file/*" };
