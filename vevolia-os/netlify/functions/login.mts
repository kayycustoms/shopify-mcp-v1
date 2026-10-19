import type { Config } from "@netlify/functions";
import { checkPassword, clearCookie, isAuthed, json, sessionCookie } from "../../lib/auth.mts";

export default async (req: Request) => {
  const path = new URL(req.url).pathname;
  if (path.endsWith("/me")) return json({ ok: isAuthed(req) }, isAuthed(req) ? 200 : 401);
  if (req.method !== "POST") return json({ code: "bad_method" }, 405);
  if (path.endsWith("/logout")) return json({ ok: true }, 200, { "set-cookie": clearCookie });
  const { password } = await req.json().catch(() => ({}));
  if (!checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 800));
    return json({ code: "wrong_password", message: "That password is not right." }, 401);
  }
  return json({ ok: true }, 200, { "set-cookie": sessionCookie() });
};

export const config: Config = { path: ["/api/login", "/api/logout", "/api/me"] };
