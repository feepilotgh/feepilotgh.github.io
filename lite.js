/* FeePilot connection to Supabase, built in (no outside library to download).
   It speaks the same public web API as the official client: sign-in, database tables and functions, and file storage.
   Only the PUBLIC key is used here. The signed-in token is kept in this browser's local storage. */
(function () {
  var C = window.FP_CONFIG || {}, KEY = 'fp_session', subs = [];
  var NET = function (e) { return { message: 'Network error: ' + ((e && e.message) || 'Failed to fetch') }; };
  function ls(op, k, v) { try { if (op === 'g') return localStorage.getItem(k); if (op === 's') localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { } return null; }
  function load() { try { return JSON.parse(ls('g', KEY) || 'null'); } catch (e) { return null; } }
  function save(s) { s ? ls('s', KEY, JSON.stringify(s)) : ls('d', KEY); }
  function emit(ev, s) { subs.slice().forEach(function (f) { try { f(ev, s); } catch (e) { } }); }
  function norm(j) { return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: j.user }; }
  function emsg(j, st) { return { message: (j && (j.msg || j.message || j.error_description || (typeof j.error === 'string' ? j.error : '') || j.hint)) || ('Request failed (' + st + ')'), code: j && (j.code || j.error_code), status: st, details: j && j.details, hint: j && j.hint }; }
  function pub(s) { return s ? { user: s.user, access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at } : null; }

  async function authReq(path, body, method, tok) {
    var h = { apikey: C.key, 'Content-Type': 'application/json' }; if (tok) h.Authorization = 'Bearer ' + tok;
    var r = await fetch(C.url + '/auth/v1/' + path, { method: method || 'POST', headers: h, body: body ? JSON.stringify(body) : undefined });
    var j = await r.json().catch(function () { return {}; });
    return r.ok ? { ok: true, j: j } : { ok: false, e: emsg(j, r.status), st: r.status };
  }
  var refreshing = null;
  async function fresh() {
    var s = load(); if (!s) return null;
    if (s.expires_at - 60 > Date.now() / 1000) return s;
    if (refreshing) return refreshing;
    refreshing = (async function () {
      try {
        var r = await authReq('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
        if (!r.ok) { if (r.st === 400 || r.st === 401 || r.st === 403) { save(null); emit('SIGNED_OUT', null); return null; } return s; }
        var n = norm(r.j); save(n); emit('TOKEN_REFRESHED', pub(n)); return n;
      } catch (e) { return s; } /* offline: keep the session, the app works from its saved copy */
      finally { refreshing = null; }
    })();
    return refreshing;
  }
  async function bearer() { var s = await fresh(); return s ? s.access_token : C.key; }

  /* ---------- database tables ---------- */
  function builder(table) {
    var st = { m: 'GET', q: [], sel: '*', body: null, pref: [], rep: false, ord: [], single: false, off: null, lim: null, onc: null, writing: false };
    var b = {};
    function f(op) { return function (c, v) { st.q.push([c, op + '.' + (op === 'in' ? '(' + v.join(',') + ')' : v)]); return b; }; }
    ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in'].forEach(function (k) { b[k] = f(k); });
    b.select = function (c) { if (st.writing) { st.rep = true; if (c) st.sel = c; } else st.sel = c || '*'; return b; };
    b.order = function (c, o) { st.ord.push(c + '.' + (o && o.ascending === false ? 'desc' : 'asc') + (o && o.nullsFirst ? '.nullsfirst' : '')); return b; };
    b.limit = function (n) { st.lim = n; return b; };
    b.range = function (a, z) { st.off = a; st.lim = z - a + 1; return b; };
    b.maybeSingle = function () { st.single = 'maybe'; return b; };
    b.single = function () { st.single = 'one'; return b; };
    b.insert = function (rows) { st.m = 'POST'; st.body = rows; st.writing = true; return b; };
    b.upsert = function (rows, o) { st.m = 'POST'; st.body = rows; st.writing = true; o = o || {}; if (o.onConflict) st.onc = o.onConflict; st.pref.push('resolution=' + (o.ignoreDuplicates ? 'ignore' : 'merge') + '-duplicates'); return b; };
    b.update = function (v) { st.m = 'PATCH'; st.body = v; st.writing = true; return b; };
    b.delete = function () { st.m = 'DELETE'; st.writing = true; return b; };
    b.then = function (ok, bad) { return run().then(ok, bad); };
    async function run() {
      try {
        var p = []; if (!st.writing) p.push('select=' + encodeURIComponent(st.sel)); else if (st.rep) p.push('select=' + encodeURIComponent(st.sel));
        st.q.forEach(function (x) { p.push(encodeURIComponent(x[0]) + '=' + encodeURIComponent(x[1]).replace(/%2C/g, ',').replace(/%28/g, '(').replace(/%29/g, ')')); });
        if (st.ord.length) p.push('order=' + st.ord.join(','));
        if (st.off != null) p.push('offset=' + st.off); if (st.lim != null) p.push('limit=' + st.lim);
        if (st.onc) p.push('on_conflict=' + encodeURIComponent(st.onc));
        var h = { apikey: C.key, Authorization: 'Bearer ' + (await bearer()), 'Content-Type': 'application/json' };
        var pref = st.pref.slice(); if (st.writing) pref.push(st.rep ? 'return=representation' : 'return=minimal'); if (pref.length) h.Prefer = pref.join(',');
        var r = await fetch(C.url + '/rest/v1/' + table + (p.length ? '?' + p.join('&') : ''), { method: st.m, headers: h, body: st.body != null ? JSON.stringify(st.body) : undefined });
        var t = await r.text(), j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { }
        if (!r.ok) return { data: null, error: emsg(j, r.status), status: r.status };
        if (st.single && Array.isArray(j)) {
          if (j.length > 1) return { data: null, error: { message: 'Multiple rows returned', code: 'PGRST116' } };
          if (!j.length) return st.single === 'maybe' ? { data: null, error: null } : { data: null, error: { message: 'No rows returned', code: 'PGRST116' } };
          return { data: j[0], error: null };
        }
        return { data: j, error: null, status: r.status };
      } catch (e) { return { data: null, error: NET(e) }; }
    }
    return b;
  }

  /* ---------- storage ---------- */
  function sp(path) { return path.split('/').map(encodeURIComponent).join('/'); }
  function bucket(name) {
    return {
      upload: async function (path, body, o) {
        try {
          o = o || {}; var h = { apikey: C.key, Authorization: 'Bearer ' + (await bearer()), 'Content-Type': o.contentType || (body && body.type) || 'application/octet-stream', 'cache-control': 'max-age=' + (o.cacheControl || 3600) };
          if (o.upsert) h['x-upsert'] = 'true';
          var r = await fetch(C.url + '/storage/v1/object/' + name + '/' + sp(path), { method: 'POST', headers: h, body: body });
          var j = await r.json().catch(function () { return {}; });
          return r.ok ? { data: { path: path }, error: null } : { data: null, error: emsg(j, r.status) };
        } catch (e) { return { data: null, error: NET(e) }; }
      },
      getPublicUrl: function (path) { return { data: { publicUrl: C.url + '/storage/v1/object/public/' + name + '/' + sp(path) } }; },
      createSignedUrls: async function (paths, exp) {
        try {
          var r = await fetch(C.url + '/storage/v1/object/sign/' + name, { method: 'POST', headers: { apikey: C.key, Authorization: 'Bearer ' + (await bearer()), 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: exp, paths: paths }) });
          var j = await r.json().catch(function () { return {}; });
          if (!r.ok) return { data: null, error: emsg(j, r.status) };
          return { data: (j || []).map(function (x) { return { path: x.path, error: x.error || null, signedUrl: x.signedURL ? C.url + '/storage/v1' + x.signedURL : null }; }), error: null };
        } catch (e) { return { data: null, error: NET(e) }; }
      },
      createSignedUrl: async function (path, exp) {
        var r = await this.createSignedUrls([path], exp); if (r.error) return r; var x = r.data[0]; return x && x.signedUrl ? { data: { signedUrl: x.signedUrl }, error: null } : { data: null, error: { message: (x && x.error) || 'Could not sign' } };
      }
    };
  }

  /* ---------- the client ---------- */
  window.sbLite = {
    from: builder,
    rpc: function (name, args) {
      var o = { then: function (ok, bad) { return go().then(ok, bad); } };
      async function go() {
        try {
          var r = await fetch(C.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: C.key, Authorization: 'Bearer ' + (await bearer()), 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
          var t = await r.text(), j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { }
          return r.ok ? { data: j, error: null } : { data: null, error: emsg(j, r.status) };
        } catch (e) { return { data: null, error: NET(e) }; }
      }
      return o;
    },
    storage: { from: bucket },
    functions: {
      invoke: async function (name, o) {
        try {
          o = o || {}; var r = await fetch(C.url + '/functions/v1/' + name, { method: 'POST', headers: { apikey: C.key, Authorization: 'Bearer ' + (await bearer()), 'Content-Type': 'application/json' }, body: o.body != null ? JSON.stringify(o.body) : undefined });
          if (!r.ok) return { data: null, error: { message: 'Function returned ' + r.status, context: r } };
          var j = await r.json().catch(function () { return null; }); return { data: j, error: null };
        } catch (e) { return { data: null, error: NET(e) }; }
      }
    },
    auth: {
      getSession: async function () { var s = await fresh(); return { data: { session: pub(s) }, error: null }; },
      signInWithPassword: async function (c) {
        try {
          var r = await authReq('token?grant_type=password', { email: c.email, password: c.password });
          if (!r.ok) return { data: { user: null, session: null }, error: r.e };
          var s = norm(r.j); save(s); emit('SIGNED_IN', pub(s)); return { data: { user: s.user, session: pub(s) }, error: null };
        } catch (e) { return { data: { user: null, session: null }, error: NET(e) }; }
      },
      signUp: async function (c) {
        try {
          var r = await authReq('signup', { email: c.email, password: c.password });
          if (!r.ok) return { data: { user: null, session: null }, error: r.e };
          if (r.j && r.j.access_token) { var s = norm(r.j); save(s); emit('SIGNED_IN', pub(s)); return { data: { user: s.user, session: pub(s) }, error: null }; }
          return { data: { user: r.j.user || r.j, session: null }, error: null };
        } catch (e) { return { data: { user: null, session: null }, error: NET(e) }; }
      },
      signOut: async function () {
        var s = load(); save(null);
        try { if (s) await authReq('logout', null, 'POST', s.access_token); } catch (e) { }
        emit('SIGNED_OUT', null); return { error: null };
      },
      resetPasswordForEmail: async function (email, o) {
        try {
          var h = { apikey: C.key, 'Content-Type': 'application/json' };
          var r = await fetch(C.url + '/auth/v1/recover' + (o && o.redirectTo ? '?redirect_to=' + encodeURIComponent(o.redirectTo) : ''), { method: 'POST', headers: h, body: JSON.stringify({ email: email }) });
          var j = await r.json().catch(function () { return {}; });
          return r.ok ? { data: {}, error: null } : { data: null, error: emsg(j, r.status) };
        } catch (e) { return { data: null, error: NET(e) }; }
      },
      updateUser: async function (v) {
        try {
          var s = await fresh(); if (!s) return { data: null, error: { message: 'Auth session missing!' } };
          var r = await authReq('user', v, 'PUT', s.access_token);
          if (!r.ok) return { data: null, error: r.e };
          s.user = r.j; save(s); emit('USER_UPDATED', pub(s)); return { data: { user: r.j }, error: null };
        } catch (e) { return { data: null, error: NET(e) }; }
      },
      onAuthStateChange: function (cb) {
        subs.push(cb);
        if (window.__fpRecovery) { var s = window.__fpRecovery; window.__fpRecovery = null; setTimeout(function () { try { cb('PASSWORD_RECOVERY', pub(s)); } catch (e) { } }, 0); }
        return { data: { subscription: { unsubscribe: function () { subs = subs.filter(function (x) { return x !== cb; }); } } } };
      }
    }
  };

  /* links from emails (password reset / confirm email) arrive as #access_token=...&type=recovery */
  try {
    var h = location.hash || '';
    if (/access_token=/.test(h) && /refresh_token=/.test(h)) {
      var P = new URLSearchParams(h.replace(/^#\/?/, ''));
      var tok = P.get('access_token');
      var s = { access_token: tok, refresh_token: P.get('refresh_token'), expires_at: Math.floor(Date.now() / 1000) + (parseInt(P.get('expires_in') || '3600', 10)), user: null };
      try { var pl = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); s.user = { id: pl.sub, email: pl.email, aud: pl.aud }; } catch (e) { }
      if (s.user) { save(s); if (P.get('type') === 'recovery') window.__fpRecovery = s; }
      history.replaceState(null, '', location.pathname + location.search + '#/');
    }
  } catch (e) { }
})();
