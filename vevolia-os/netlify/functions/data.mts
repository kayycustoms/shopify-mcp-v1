import type { Config } from "@netlify/functions";
import { denied, isAuthed, json } from "../../lib/auth.mts";
import { ensureSeeded, okColl, okId, readAll, write } from "../../lib/store.mts";

const MAX_DOC = 200_000;

export default async (req: Request) => {
  if (!isAuthed(req)) return denied();
  await ensureSeeded();

  if (req.method === "GET") {
    // ?have=tasks:etag,ads:etag  → only send collections that changed
    const have: Record<string, string> = {};
    for (const pair of (new URL(req.url).searchParams.get("have") || "").split(",")) {
      const i = pair.indexOf(":");
      if (i > 0) have[pair.slice(0, i)] = pair.slice(i + 1);
    }
    return json({ colls: await readAll(have) });
  }

  if (req.method !== "POST") return json({ code: "bad_method" }, 405);
  const body = await req.json().catch(() => null);
  const ops = Array.isArray(body?.ops) ? body.ops : body ? [body] : [];
  if (!ops.length || ops.length > 50) return json({ code: "invalid_argument", message: "Send 1 to 50 changes." }, 400);
  const results = [];
  for (const o of ops) {
    if (!["set", "update", "delete"].includes(o.op) || !okColl(o.coll) || !okId(String(o.id || ""))) {
      results.push({ code: "invalid_argument" }); continue;
    }
    if (o.op !== "delete" && (typeof o.data !== "object" || !o.data || Array.isArray(o.data) || JSON.stringify(o.data).length > MAX_DOC)) {
      results.push({ code: "invalid_argument" }); continue;
    }
    results.push(await write(o));
  }
  const bad = results.find((r: any) => r.code);
  return json(ops.length === 1 ? results[0] : { results }, bad && ops.length === 1 ? (bad.code === "busy" ? 409 : bad.code === "not_found" ? 404 : 400) : 200);
};

export const config: Config = { path: "/api/data" };
