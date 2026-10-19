// "Make it Meta-safe with Claude": sends the page's rewrite prompt to the Claude API and returns the new script.
import type { Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";
import { denied, isAuthed, json } from "../../lib/auth.mts";

export default async (req: Request) => {
  if (!isAuthed(req)) return denied();
  if (req.method !== "POST") return json({ code: "bad_method" }, 405);
  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ code: "not_granted", message: "Add ANTHROPIC_API_KEY in Netlify to turn on Claude help." }, 503);
  const { prompt } = await req.json().catch(() => ({}));
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 20_000) return json({ code: "invalid_argument" }, 400);

  const client = new Anthropic({ apiKey });
  try {
    const msg = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: prompt }],
    } as any);
    if (msg.stop_reason === "refusal") return json({ code: "refused", message: "Claude would not rewrite this one." }, 422);
    const text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    return json({ text });
  } catch (e: any) {
    if (e instanceof Anthropic.RateLimitError) return json({ code: "rate_limited" }, 429);
    return json({ code: "tool_error", message: "Claude did not answer." }, 502);
  }
};

export const config: Config = { path: "/api/rewrite" };
