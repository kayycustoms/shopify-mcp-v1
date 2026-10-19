// Live ad numbers from the Meta Marketing API, shaped like the Meta Ads connector so the page reads them the same way.
import type { Config } from "@netlify/functions";
import { denied, isAuthed, json } from "../../lib/auth.mts";
import { cached, Problem } from "../../lib/cache.mts";

const GRAPH = "https://graph.facebook.com/v21.0";
const PURCHASE = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];

async function pull(account: string, token: string) {
  const fields = "id,name,effective_status,insights.date_preset(maximum){spend,impressions,clicks,ctr,cpc,actions}";
  let url: string | null = `${GRAPH}/act_${account}/ads?fields=${encodeURIComponent(fields)}&limit=200&access_token=${encodeURIComponent(token)}`;
  const rows: any[] = [];
  for (let page = 0; url && page < 10; page++) {
    const res = await fetch(url);
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = body.error || {};
      if (e.code === 190) throw new Problem("needs_reauth", "The Meta key expired. Make a new one and update META_ACCESS_TOKEN in Netlify.");
      if (e.code === 4 || e.code === 17 || e.code === 613) throw new Problem("rate_limited", "Meta says slow down. Try again in a few minutes.", 429);
      throw new Problem("tool_error", e.message || "Meta did not answer.");
    }
    for (const ad of body.data || []) {
      const i = (ad.insights && ad.insights.data && ad.insights.data[0]) || {};
      const act = (i.actions || []).find((a: any) => PURCHASE.includes(a.action_type));
      rows.push({
        id: ad.id, name: ad.name, effective_status: ad.effective_status,
        amount_spent: { value: i.spend || "0", unit: "USD" },
        impressions: i.impressions || "0", clicks: i.clicks || "0",
        ctr: i.ctr != null ? i.ctr + "%" : null, cpc: i.cpc || null,
        omni_purchase: act ? act.value : null,
      });
    }
    url = body.paging && body.paging.next ? body.paging.next : null;
  }
  return { ad_entities: JSON.stringify(rows) };
}

export default async (req: Request) => {
  if (!isAuthed(req)) return denied();
  const token = Netlify.env.get("META_ACCESS_TOKEN");
  const account = (Netlify.env.get("META_AD_ACCOUNT_ID") || "925419377068716").replace(/^act_/, "");
  if (!token) return json({ code: "not_set_up", message: "Add META_ACCESS_TOKEN in Netlify to see live ad numbers." }, 503);
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  try {
    return json(await cached("meta-" + account, 5 * 60_000, fresh, () => pull(account, token)));
  } catch (e: any) {
    return json({ code: e.code || "tool_error", message: e.message }, e.status || 502);
  }
};

export const config: Config = { path: "/api/meta" };
