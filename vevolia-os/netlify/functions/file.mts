// Team-only files (kept out of the public folder).
import type { Config } from "@netlify/functions";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { denied, isAuthed } from "../../lib/auth.mts";

const FILES: Record<string, [string, string]> = {
  "testing.pdf": ["Avant_Testing_Philosophy.pdf", "application/pdf"],
};

export default async (req: Request) => {
  if (!isAuthed(req)) return denied();
  const name = new URL(req.url).pathname.split("/").pop() || "";
  const f = FILES[name];
  if (!f) return new Response("Not found", { status: 404 });
  const body = await readFile(join(process.cwd(), "private", f[0])).catch(() => null);
  if (!body) return new Response("This file was not uploaded with the site.", { status: 404 });
  return new Response(body, { headers: { "content-type": f[1], "cache-control": "private, max-age=3600" } });
};

export const config: Config = { path: "/api/file/*" };
