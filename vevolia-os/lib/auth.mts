// Team login: one shared password, a signed cookie, and a separate key for the night helper.
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "vos";
const DAYS = 30;

const env = (k: string) => Netlify.env.get(k) || "";

function sign(value: string) {
  return createHmac("sha256", env("SESSION_SECRET")).update(value).digest("base64url");
}

function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(given: string) {
  const want = env("TEAM_PASSWORD");
  return !!want && !!env("SESSION_SECRET") && same(String(given || ""), want);
}

export function sessionCookie() {
  const exp = String(Date.now() + DAYS * 864e5);
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}

export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function isAuthed(req: Request) {
  const key = req.headers.get("x-agent-key");
  if (key && env("AGENT_KEY") && same(key, env("AGENT_KEY"))) return true;
  if (!env("SESSION_SECRET")) return false;
  const raw = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return false;
  const [exp, sig] = raw.slice(COOKIE.length + 1).split(".");
  return !!exp && !!sig && same(sig, sign(exp)) && Number(exp) > Date.now();
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

export const denied = () => json({ code: "signed_out", message: "Please log in." }, 401);
