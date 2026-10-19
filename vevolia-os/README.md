# Vevolia OS (website)

The Vevolia team dashboard as a normal website on Netlify. It has a team login, a shared database,
live Meta and Shopify numbers, and a "Make it Meta-safe with Claude" button.

## What is in here

| Path | What it does |
|---|---|
| `public/index.html` | The dashboard page (same as the Claude version). |
| `public/shim.js` | Login screen, and connects the page to the `/api/*` endpoints below. |
| `netlify/functions/login.mts` | `/api/login`, `/api/logout`, `/api/me`: team password and a 30-day cookie. |
| `netlify/functions/data.mts` | `/api/data`: read and save tasks, ads, scripts, notes and the rest (Netlify Blobs). |
| `netlify/functions/meta.mts` | `/api/meta`: live ad spend, clicks and sales from Meta. Cached 5 minutes. |
| `netlify/functions/shop.mts` | `/api/shop`: Shopify order count since ads started. Cached 5 minutes. |
| `netlify/functions/rewrite.mts` | `/api/rewrite`: asks Claude to make a script Meta-safe. |
| `netlify/functions/file.mts` | `/api/file/testing.pdf`: the Avant Testing Philosophy PDF, for logged-in people only. |
| `private/` | Not in Git (this repo is public). Holds `seed.json` (all data from the Claude dashboard, loaded once on first run) and the testing PDF. |

## Settings (Netlify → Project configuration → Environment variables)

| Name | Needed? | What it is |
|---|---|---|
| `TEAM_PASSWORD` | Yes | The password the team types to log in. |
| `SESSION_SECRET` | Yes | Any long random text. Changing it logs everyone out. |
| `AGENT_KEY` | For the night helper | Long random text. Send it as the `x-agent-key` header to use `/api/data` without logging in. |
| `META_ACCESS_TOKEN` | For live ad advice | A Meta system-user token with `ads_read` on ad account 925419377068716. |
| `META_AD_ACCOUNT_ID` | No | Defaults to `925419377068716`. |
| `SHOPIFY_STORE` | No | Defaults to `w6i8gk-1p.myshopify.com`. |
| `SHOPIFY_ADMIN_TOKEN` | For live orders | Admin API token with `read_orders`. Or use the two below instead. |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | Instead of the token | From a Shopify Dev Dashboard app installed on the store with `read_orders`. |
| `ANTHROPIC_API_KEY` | For the Claude button | From console.anthropic.com. |

Mark every key as a secret in Netlify. Never put keys in this folder.

## Deploy

In Netlify, link this repo with **Base directory** `vevolia-os`. Netlify reads `netlify.toml`, so nothing else is needed.
Or from this folder: `npm install && npx netlify deploy --prod`.

If you deploy from Git, `private/` is missing: the site starts empty and the PDF link won't work. Load the data with the API below.

## Night helper API

```
GET  /api/data                         -> { colls: { tasks: { etag, docs: { id: doc } }, ... } }
POST /api/data  { op: "set"|"update"|"delete", coll, id, data }
POST /api/data  { ops: [ ...up to 50 of the above ] }
```

Collections: tasks, ads, memory, docs, sops, intel, spins, scorecard, research, scripts, goals, meta, plan.

## Check the code

`npm install && npm run typecheck`
