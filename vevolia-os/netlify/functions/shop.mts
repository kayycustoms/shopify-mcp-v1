// Order count from the Shopify Admin API, shaped like a ShopifyQL answer: { columns, rows }.
import type { Config } from "@netlify/functions";
import { denied, isAuthed, json } from "../../lib/auth.mts";
import { cached, Problem } from "../../lib/cache.mts";
import { store } from "../../lib/store.mts";

const VERSION = "2025-07";

// Either a fixed Admin API token, or a Dev Dashboard app's client id + secret (token lasts about a day).
async function adminToken(shop: string) {
  const fixed = Netlify.env.get("SHOPIFY_ADMIN_TOKEN");
  if (fixed) return fixed;
  const id = Netlify.env.get("SHOPIFY_CLIENT_ID"), secret = Netlify.env.get("SHOPIFY_CLIENT_SECRET");
  if (!id || !secret) throw new Problem("not_set_up", "Add SHOPIFY_ADMIN_TOKEN (or SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET) in Netlify.", 503);
  const s = store();
  const hit: any = await s.get("cache/shopify-token", { type: "json" }).catch(() => null);
  if (hit && hit.until > Date.now()) return hit.token as string;
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Problem("needs_reauth", "Shopify would not give a key. Check the app id and secret.");
  await s.setJSON("cache/shopify-token", { token: body.access_token, until: Date.now() + ((body.expires_in || 3600) - 300) * 1000 });
  return body.access_token as string;
}

async function countOrders(shop: string, since: string) {
  const res = await fetch(`https://${shop}/admin/api/${VERSION}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": await adminToken(shop) },
    body: JSON.stringify({ query: `query($q: String!) { ordersCount(query: $q) { count } }`, variables: { q: `created_at:>=${since} test:false` } }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new Problem("needs_reauth", "Shopify said no. The key needs the read_orders permission.");
  if (!res.ok || body.errors) throw new Problem("tool_error", "Shopify did not answer.");
  return { columns: [{ name: "orders" }], rows: [[String(body.data.ordersCount.count)]] };
}

export default async (req: Request) => {
  if (!isAuthed(req)) return denied();
  const shop = Netlify.env.get("SHOPIFY_STORE") || "w6i8gk-1p.myshopify.com";
  const q = new URL(req.url).searchParams;
  const since = /^\d{4}-\d{2}-\d{2}$/.test(q.get("since") || "") ? q.get("since")! : "2026-10-17";
  try {
    return json(await cached("shop-" + since, 5 * 60_000, q.get("fresh") === "1", () => countOrders(shop, since)));
  } catch (e: any) {
    return json({ code: e.code || "tool_error", message: e.message }, e.status || 502);
  }
};

export const config: Config = { path: "/api/shop" };
