// Remember live numbers for a few minutes so Meta and Shopify are not asked on every page load.
import { store } from "./store.mts";

export async function cached<T>(key: string, maxAgeMs: number, fresh: boolean, get: () => Promise<T>) {
  const s = store();
  if (!fresh) {
    const hit = await s.get("cache/" + key, { type: "json" }).catch(() => null);
    if (hit && Date.now() - hit.at < maxAgeMs) return { payload: hit.payload as T, at: hit.at as number };
  }
  const payload = await get();
  const at = Date.now();
  await s.setJSON("cache/" + key, { at, payload }).catch(() => {});
  return { payload, at };
}

export class Problem extends Error {
  constructor(public code: string, message: string, public status = 502) { super(message); }
}
