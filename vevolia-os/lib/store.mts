// All team data lives in Netlify Blobs: one blob per collection, shaped { [docId]: doc }.
import { getStore } from "@netlify/blobs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const COLLS = ["tasks", "ads", "memory", "docs", "sops", "intel", "spins", "scorecard", "research", "scripts", "goals", "meta", "plan"];
export const okColl = (c: string) => COLLS.includes(c);
export const okId = (id: string) => /^[A-Za-z0-9_.:@+-]{1,120}$/.test(id);

export const store = () => getStore({ name: "vevolia-os", consistency: "strong" });

// The first time the site runs, copy in everything from the old Claude dashboard.
// private/seed.json is kept out of Git (the repo is public), so it is only there when deploying from a folder that has it.
export async function ensureSeeded() {
  const s = store();
  if (await s.get("seeded")) return;
  const seed = await readFile(join(process.cwd(), "private", "seed.json"), "utf8").then(JSON.parse).catch(() => null);
  if (!seed) return;
  for (const [c, docs] of Object.entries(seed as Record<string, Record<string, unknown>>)) {
    await s.setJSON("col/" + c, docs, { onlyIfNew: true });
  }
  await s.set("seeded", new Date().toISOString());
}

export async function readAll(have: Record<string, string> = {}) {
  const s = store();
  const out: Record<string, { etag: string; docs: Record<string, unknown> }> = {};
  await Promise.all(COLLS.map(async (c) => {
    const r = await s.getWithMetadata("col/" + c, { type: "json" });
    const etag = (r && r.etag) || "none";
    if (have[c] === etag) return;
    out[c] = { etag, docs: (r && r.data) || {} };
  }));
  return out;
}

type Op = { op: "set" | "update" | "delete"; coll: string; id: string; data?: Record<string, unknown> };

// Read, change one doc, write back only if nobody else wrote in between. Retry a few times if they did.
export async function write({ op, coll, id, data }: Op) {
  const s = store();
  for (let i = 0; i < 6; i++) {
    const r = await s.getWithMetadata("col/" + coll, { type: "json" });
    const docs: Record<string, any> = (r && r.data) || {};
    if (op === "update" && !docs[id]) return { code: "not_found" };
    if (op === "delete") delete docs[id];
    else docs[id] = op === "update" ? { ...docs[id], ...data } : data;
    const res = r && r.etag
      ? await s.setJSON("col/" + coll, docs, { onlyIfMatch: r.etag })
      : await s.setJSON("col/" + coll, docs, { onlyIfNew: true });
    if (res.modified) return { ok: true, etag: res.etag };
    await new Promise((ok) => setTimeout(ok, 50 + Math.random() * 150));
  }
  return { code: "busy" };
}
