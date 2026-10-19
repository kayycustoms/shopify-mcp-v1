/* Vevolia OS website adapter.
   The dashboard was first built to run inside Claude, which gives it window.claude.use('db' | 'user' | 'mcp' | 'sample').
   This file gives it the same thing on our own website: a login screen, the team database (/api/data),
   live Meta and Shopify numbers (/api/meta, /api/shop) and Claude rewrites (/api/rewrite). */
(() => {
  const POLL_MS = 8000;

  async function api(path, opts = {}) {
    const res = await fetch(path, { credentials: 'same-origin', ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith('/api/login')) { showLogin(); throw { code: 'signed_out' }; }
    if (!res.ok) throw { code: body.code || 'tool_error', message: body.message || 'Something went wrong.' };
    return body;
  }

  /* ---------- login ---------- */
  let ready, signedIn;
  const loggedIn = new Promise((ok) => { signedIn = ok; });
  function showLogin() {
    if (document.getElementById('login')) return;
    const css = document.createElement('style');
    css.textContent = `#login{position:fixed;inset:0;z-index:999;background:var(--bg,#f7f1e3);display:grid;place-items:center;padding:16px}
      #login form{width:min(380px,100%);background:var(--white,#fffdf8);border:1px solid var(--line,#dcd2bd);border-radius:24px;padding:28px;display:grid;gap:14px}
      #login h1{margin:0;font-size:28px;letter-spacing:-.02em;display:flex;align-items:center;gap:10px}
      #login h1 i{width:12px;height:12px;border-radius:50%;background:var(--pink,#f5b8d8)}
      #login p{margin:0;color:var(--muted,#6e675a)}
      #login input{padding:13px 14px;border-radius:12px;border:1px solid var(--line,#dcd2bd);background:#fff;font-size:16px}
      #login button{all:unset;cursor:pointer;text-align:center;background:var(--ink,#141414);color:#fff;border-radius:999px;padding:13px;font-weight:600}
      #login button:disabled{opacity:.6}
      #login .err{color:var(--red,#c2413b);min-height:1.5em;font-size:14px}`;
    const box = document.createElement('div');
    box.id = 'login';
    box.innerHTML = `<form><h1><i></i>Vevolia OS</h1><p>Type the team password to come in.</p>
      <label for="pw" style="position:absolute;left:-9999px">Team password</label>
      <input id="pw" type="password" autocomplete="current-password" placeholder="Team password" required>
      <button type="submit">Log in</button><div class="err" role="alert"></div></form>`;
    document.head.append(css); document.body.append(box);
    const form = box.querySelector('form'), pw = box.querySelector('#pw'), err = box.querySelector('.err'), btn = box.querySelector('button');
    pw.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); btn.disabled = true; err.textContent = '';
      try {
        await api('/api/login', { method: 'POST', body: JSON.stringify({ password: pw.value }) });
        box.remove(); signedIn(); poll();
      } catch (x) { err.textContent = x.message || 'That did not work. Try again.'; btn.disabled = false; pw.select(); }
    });
  }
  window.vosLogout = async () => { try { await api('/api/logout', { method: 'POST' }); } catch (e) {} location.reload(); };

  /* ---------- database ---------- */
  const cache = {};            // coll -> { etag, docs: {id: doc} }
  const subs = {};             // coll -> Set(fn)
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const notify = (c) => (subs[c] || new Set()).forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  const docSnap = (c, id) => { const d = cache[c] && cache[c].docs[id]; return { id, exists: !!d, data: () => clone(d) }; };
  const collSnap = (c) => ({ docs: Object.keys((cache[c] && cache[c].docs) || {}).map((id) => docSnap(c, id)), empty: !Object.keys((cache[c] && cache[c].docs) || {}).length });

  let polling = null, firstLoad;
  const loaded = new Promise((ok) => { firstLoad = ok; });
  async function poll() {
    clearTimeout(polling);
    try {
      const have = Object.entries(cache).map(([c, v]) => c + ':' + v.etag).join(',');
      const { colls } = await api('/api/data' + (have ? '?have=' + encodeURIComponent(have) : ''));
      for (const [c, v] of Object.entries(colls)) { cache[c] = v; notify(c); }
      firstLoad();
      offerImport();
    } catch (e) { if (e.code === 'signed_out') return; }
    polling = setTimeout(poll, document.hidden ? POLL_MS * 4 : POLL_MS);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !document.getElementById('login')) poll(); });

  async function write(op, c, id, data) {
    try { await api('/api/data', { method: 'POST', body: JSON.stringify({ op, coll: c, id, data }) }); }
    catch (e) {
      if (e.code === 'signed_out') throw e;
      // The page reads 'invalid_argument' as "you are read-only", so report other problems as plain failures.
      throw { code: e.code === 'not_found' ? 'not_found' : 'write_failed', message: e.message };
    }
    const entry = (cache[c] ||= { etag: 'local', docs: {} });
    if (op === 'delete') delete entry.docs[id];
    else entry.docs[id] = op === 'update' ? { ...entry.docs[id], ...clone(data) } : clone(data);
    entry.etag = 'local';     // makes the next poll fetch the real copy
    notify(c); setTimeout(poll, 300);
  }

  /* ---------- first-time data load ----------
     A brand-new site starts empty. Show a button to load the vevolia-data.json file
     (all tasks, ads, notes and the testing PDF copied from the Claude dashboard). */
  function offerImport() {
    const total = Object.values(cache).reduce((n, v) => n + Object.keys(v.docs || {}).length, 0);
    const bar = document.getElementById('vos-import');
    if (total > 0) { if (bar) bar.remove(); return; }
    if (bar) return;
    const box = document.createElement('div');
    box.id = 'vos-import';
    box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:900;background:#141414;color:#fff;border-radius:20px;padding:16px 20px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;max-width:calc(100% - 32px);box-shadow:0 8px 30px rgba(0,0,0,.25)';
    box.innerHTML = '<span>Your dashboard is empty. Load your saved data file to fill it.</span><label style="background:#f5b8d8;color:#141414;border-radius:999px;padding:10px 16px;font-weight:600;cursor:pointer">Load my data<input type="file" accept=".json,application/json" style="display:none"></label>';
    document.body.append(box);
    const span = box.querySelector('span');
    box.querySelector('input').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        span.textContent = 'Loading… please wait.';
        const all = JSON.parse(await file.text());
        const data = all.data || all;
        const ops = [];
        for (const [coll, docs] of Object.entries(data)) for (const [id, d] of Object.entries(docs)) ops.push({ op: 'set', coll, id, data: d });
        for (let i = 0; i < ops.length; i += 50) {
          const r = await api('/api/data', { method: 'POST', body: JSON.stringify({ ops: ops.slice(i, i + 50) }) });
          if (r.results && r.results.some((x) => x.code)) throw { message: 'Some items did not save.' };
          span.textContent = 'Loading… ' + Math.min(i + 50, ops.length) + ' of ' + ops.length;
        }
        if (all.pdfBase64) {
          const bin = Uint8Array.from(atob(all.pdfBase64), (ch) => ch.charCodeAt(0));
          const res = await fetch('/api/file/testing.pdf', { method: 'POST', credentials: 'same-origin', body: bin });
          if (!res.ok) throw { message: 'The PDF did not upload.' };
        }
        box.remove(); poll();
      } catch (x) { span.textContent = (x && x.message) || 'That file did not work. Try again.'; }
    });
  }

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function docRef(c, id) {
    return {
      id,
      get: async () => { await loaded; return docSnap(c, id); },
      set: (d) => write('set', c, id, d),
      update: (d) => write('update', c, id, d),
      delete: () => write('delete', c, id),
      onSnapshot: (next) => { const fn = () => next(docSnap(c, id)); (subs[c] ||= new Set()).add(fn); if (cache[c]) fn(); else loaded.then(fn); return () => subs[c].delete(fn); },
    };
  }
  const db = {
    collection: (c) => ({
      doc: (id) => docRef(c, id || newId()),
      get: async () => { await loaded; return collSnap(c); },
      onSnapshot: (next) => { const fn = () => next(collSnap(c)); (subs[c] ||= new Set()).add(fn); loaded.then(fn); return () => subs[c].delete(fn); },
    }),
    doc: (path) => { const [c, id] = path.split('/'); return docRef(c, id); },
  };

  /* ---------- live numbers ---------- */
  const fresh = new Set();
  const mcp = {
    watchTool(server, tool, input, handler, opts) {
      let live = true;
      const isMeta = /meta/i.test(server);
      const since = ((input && input.query) || '').match(/SINCE (\d{4}-\d{2}-\d{2})/);
      const force = fresh.delete(server) || (opts && opts.cache && opts.cache.staleTime === 0);
      const url = isMeta ? '/api/meta' : '/api/shop' + (since ? '?since=' + since[1] : '');
      api(url + (force ? (url.includes('?') ? '&' : '?') + 'fresh=1' : ''))
        .then((r) => live && handler({ type: 'data', result: { payload: r.payload, cache: { storedAt: r.at } } }))
        .catch((e) => live && handler({ type: 'error', error: { code: e.code, message: e.message } }));
      return () => { live = false; };
    },
    invalidate: async (server) => { fresh.add(server); },
    callTool: async () => { throw { code: 'not_supported' }; },
  };

  /* ---------- Claude rewrite ---------- */
  const sample = async (prompt) => {
    const r = await api('/api/rewrite', { method: 'POST', body: JSON.stringify({ prompt }) });
    return { text: r.text };
  };

  const user = { can: async () => true };
  const parts = { db, user, mcp, sample };

  ready = (async () => {
    try { await api('/api/me'); signedIn(); poll(); } catch (e) { /* login screen is showing */ }
    await loggedIn;
  })();
  window.claude = { use: async (name) => { await ready; return parts[name] || null; } };
})();
