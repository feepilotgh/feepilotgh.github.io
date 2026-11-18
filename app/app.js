'use strict';
/* ===== FeePilot core: helpers, data layer, offline queue, auth, router ===== */
const CFG = window.FP_CONFIG || {};
const $ = id => document.getElementById(id);
const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DEMO = !!window.FP_DEMO;
let sb = null;
try { sb = window.sbLite || (window.supabase ? window.supabase.createClient(CFG.url, CFG.key) : null); } catch (e) { sb = null; }

/* ---------- money, dates, text ---------- */
const toP = s => {
  s = String(s == null ? '' : s).replace(/GH[₵S]?|₵|,|\s/gi, '');
  return /^\d+(\.\d{1,2})?$/.test(s) ? (([w, c]) => parseInt(w, 10) * 100 + parseInt((c || '').padEnd(2, '0') || '0', 10))(s.split('.')) : null;
};
const fmn = p => (p < 0 ? '-' : '') + String(Math.floor(Math.abs(p) / 100)).replace(/\B(?=(\d{3})+$)/g, ',') + '.' + String(Math.abs(p) % 100).padStart(2, '0');
const fm = p => (p < 0 ? '-' : '') + 'GH₵ ' + fmn(Math.abs(p));
const fmShort = p => { const v = p / 100; return 'GH₵ ' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e4 ? (v / 1e3).toFixed(1) + 'k' : fmn(p).replace(/\.00$/, '')); };
const mn = p => Number((p < 0 ? '-' : '') + Math.floor(Math.abs(p) / 100) + '.' + String(Math.abs(p) % 100).padStart(2, '0'));
const td = () => new Date().toISOString().slice(0, 10);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fd = iso => { if (!iso) return ''; const d = new Date(String(iso).length <= 10 ? iso + 'T00:00:00Z' : iso); return isNaN(d) ? String(iso) : d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
const fdt = iso => { const d = new Date(iso); return isNaN(d) ? '' : fd(iso) + ', ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, Math.floor(a * 1000 / b) / 10)) : 0;
const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
function words(p) { // amount in words, e.g. "One hundred and fifty Ghana cedis only"
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const h = n => n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '');
  const t = n => n < 100 ? h(n) : ones[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + h(n % 100) : '');
  const big = n => { if (n === 0) return 'zero'; const parts = []; const b = Math.floor(n / 1e9), m = Math.floor(n % 1e9 / 1e6), k = Math.floor(n % 1e6 / 1e3), r = n % 1e3; if (b) parts.push(t(b) + ' billion'); if (m) parts.push(t(m) + ' million'); if (k) parts.push(t(k) + ' thousand'); if (r) parts.push((parts.length && r < 100 ? 'and ' : '') + t(r)); return parts.join(' '); };
  p = Math.abs(p); const c = Math.floor(p / 100), ps = p % 100;
  let s = big(c) + ' Ghana cedi' + (c === 1 ? '' : 's'); if (ps) s += ' and ' + big(ps) + ' pesewa' + (ps === 1 ? '' : 's');
  return s.charAt(0).toUpperCase() + s.slice(1) + ' only';
}
function friendly(err) {
  const m = String((err && err.message) || err || '');
  if (/code is not valid|too many tries/i.test(m)) return m;
  if (/anonymous sign-ins are disabled/i.test(m)) return 'Joining with a code is not switched on yet. Please contact FeePilot support.';
  if (/invalid login|invalid credentials/i.test(m)) return 'That email or password is not right. Check it and try again.';
  if (/not confirmed|confirm your/i.test(m)) return 'Please confirm your email first. Check your inbox (and spam), then sign in.';
  if (/already registered|already been registered|already exists/i.test(m) && /user|email/i.test(m)) return 'This email already has an account. Sign in instead.';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Too many attempts. Please wait a minute and try again.';
  if (/password/i.test(m) && /(least|short|weak|characters)/i.test(m)) return 'Choose a longer password (at least 6 characters).';
  if (/subscription ended|read-only/i.test(m)) return 'Your subscription has ended, so this school is read-only. Call FeePilot support to renew.';
  if (/row-level security|permission denied|not authorized|not allowed|forbidden/i.test(m)) return 'You do not have permission to do that.';
  if (/duplicate key|unique constraint|already exists/i.test(m)) return 'That already exists. Check the student ID or name.';
  if (/failed to fetch|network|load failed|timeout/i.test(m)) return 'Cannot reach the server. Check your internet and try again.';
  if (/suspended/i.test(m)) return 'This school account is suspended. Contact FeePilot support.';
  if (/limit|plan/i.test(m) && /student|staff|exceed|reached/i.test(m)) return m;
  return m || 'Something went wrong. Please try again.';
}

/* ---------- local storage (IndexedDB) ---------- */
const idb = new Promise(r => { try { const q = indexedDB.open(DEMO ? 'fp-demo' : 'fp', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => r(q.result); q.onerror = () => r(null); } catch (e) { r(null); } });
const kv = {
  get: k => idb.then(d => d ? new Promise(r => { try { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(undefined); } catch (e) { r(undefined); } }) : undefined),
  set: (k, v) => idb.then(d => d ? new Promise(r => { try { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(JSON.parse(JSON.stringify(v)), k); t.oncomplete = r; t.onerror = r; } catch (e) { r(); } }) : undefined)
};
if (!crypto.randomUUID) crypto.randomUUID = function () { const b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128; const h = Array.from(b, x => (x + 256).toString(16).slice(1)).join(''); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20); };
let devId = 'dev'; try { devId = localStorage.fpdev || (localStorage.fpdev = crypto.randomUUID()); } catch (e) { }

/* ---------- state ---------- */
let U = null, busy = false, loading = false;
let D = { school: null, students: [], fees: [], pays: [], q: [], staff: [] };
const LISTS = ['acc', 'sup', 'exp', 'cb', 'bud', 'sbal', 'accb', 'ma', 'yrs', 'trm', 'cfw', 'smsm', 'smss', 'smst', 'smsu'];
LISTS.forEach(k => D[k] = []);
let FIDX = {}, SIDX = {};
function reindex() {
  FIDX = {}; SIDX = {};
  D.students.forEach(s => SIDX[s.id] = s);
  D.fees.forEach(f => (FIDX[f.student_id] = FIDX[f.student_id] || []).push(f));
}
const stu = id => SIDX[id] || {};
const sn = id => (SIDX[id] || {}).full_name || 'Unknown student';
const sid = () => D.school.id;
const pend = fid => D.q.filter(q => !q.k && q.fee === fid && q.state !== 'done').reduce((t, q) => t + q.amt, 0);
const bal = f => f.balance_minor - pend(f.fee_item_id);
const sbal = id => (FIDX[id] || []).reduce((t, f) => t + bal(f), 0);
const sPaid = id => (FIDX[id] || []).reduce((t, f) => t + f.paid_minor, 0);
const sDue = id => (FIDX[id] || []).reduce((t, f) => t + (f.carried_to ? f.paid_minor : f.amount_minor), 0);
const role = () => (D.school || {}).role;
const canPay = () => ['proprietor', 'admin', 'accountant', 'account_officer'].includes(role());
const canFee = () => ['proprietor', 'admin', 'accountant'].includes(role());
const isAd = () => ['proprietor', 'admin'].includes(role());
const ROLES = { proprietor: 'Proprietor', admin: 'Administrator', accountant: 'Accountant', account_officer: 'Account officer', auditor: 'Auditor', readonly: 'Read-only' };
const classes = () => [...new Set(D.students.map(s => s.class_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const online = () => navigator.onLine;

async function all(mk) { // read every row, 1000 at a time (the server returns at most 1000 per request)
  let o = [], f = 0;
  for (; ;) { const r = await mk().range(f, f + 999); if (r.error) throw r.error; o = o.concat(r.data || []); if ((r.data || []).length < 1000) return o; f += 1000; }
}

/* ---------- loading data ---------- */
async function pull() {
  if (!online() || !U || !sb) return;
  loading = true;
  try {
    await sb.rpc('accept_invites');
    const m = await sb.from('school_members').select('school_id,role,schools(name,logo_path,address,phone)').eq('user_id', U.id).eq('active', true).limit(1);
    if (m.error) return;
    try { const pa = await sb.rpc('is_platform_admin'); if (!pa.error) D.padmin = pa.data === true; } catch (e) { }
    const x = m.data[0];
    if (!x) { D.school = null; const ms = await sb.rpc('my_schools'); D.susp = !ms.error && (ms.data || []).some(z => z.status === 'suspended'); return; }
    D.susp = false;
    D.school = { id: x.school_id, name: x.schools.name, logo: x.schools.logo_path, address: x.schools.address, phone: x.schools.phone, role: x.role };
    D.staff = [];
    if (['proprietor', 'admin'].includes(x.role)) { const sf = await sb.rpc('list_staff', { p_school: x.school_id }); if (!sf.error) D.staff = sf.data || [];
      D.jn = { names: {}, codes: [] }; try { const ji = await sb.rpc('list_join_info', { p_school: x.school_id }); if (!ji.error) (ji.data || []).forEach(z => z.kind === 'member' ? D.jn.names[z.user_id] = z.name : D.jn.codes.push(z)); } catch (e) { } }
    const take = (keys, res) => keys.forEach((k, i) => { if (res[i] && !res[i].error) D[k] = res[i].data || (k === 'smsc' ? null : []); });
    take(['acc', 'sup', 'exp', 'cb', 'bud', 'sbal', 'accb', 'ma'], await Promise.all([
      sb.from('accounts').select('*').order('name'), sb.from('suppliers').select('*').order('name'),
      sb.from('expenses').select('*').order('created_at', { ascending: false }).limit(150),
      sb.from('cashbook').select('*').order('entry_ts', { ascending: false }).limit(400),
      sb.from('budget_actuals').select('*').order('academic_year'), sb.from('supplier_balances').select('*').order('name'),
      sb.from('account_balances').select('*'), sb.from('method_accounts').select('*')]));
    take(['yrs', 'trm', 'cfw'], await Promise.all([
      sb.from('academic_years').select('*').order('start_date', { ascending: false }), sb.from('terms').select('*').order('start_date'),
      sb.from('carry_forwards').select('*').order('created_at', { ascending: false })]));
    const R3 = await Promise.all([
      sb.from('sms_messages').select('*').order('created_at', { ascending: false }).limit(60), sb.from('sms_schedules').select('*').order('created_at', { ascending: false }),
      sb.from('sms_templates').select('*').order('name'), sb.from('sms_settings').select('*').maybeSingle(), sb.from('sms_usage').select('*').order('month', { ascending: false }).limit(6)]);
    take(['smsm', 'smss', 'smst'], R3); if (!R3[3].error) D.smsc = R3[3].data; if (!R3[4].error) D.smsu = R3[4].data || [];
    const R4 = await Promise.all([
      sb.from('dashboard_totals').select('*').eq('school_id', x.school_id).maybeSingle(), sb.from('dash_class').select('*').eq('school_id', x.school_id),
      sb.from('dash_method').select('*').eq('school_id', x.school_id), sb.from('subscriptions').select('*,plans(*)').eq('school_id', x.school_id).maybeSingle()]);
    if (!R4[0].error) D.dash = R4[0].data; if (!R4[1].error) D.dcl = R4[1].data || []; if (!R4[2].error) D.dme = R4[2].data || []; if (!R4[3].error) D.sub = R4[3].data;
    const since = new Date(Date.now() - 120 * 864e5).toISOString();
    const [s, f, p] = await Promise.all([
      all(() => sb.from('students').select('*').order('full_name').order('id')),
      all(() => sb.from('fee_balances').select('*').order('fee_item_id')),
      all(() => sb.from('payments').select('*').gte('created_at', since).order('created_at', { ascending: false }).order('id'))]).catch(e => [null, null, null]);
    if (s && f && p) { D.students = s; D.fees = f; D.pays = p.slice(0, 4000); D.loaded = Date.now(); reindex(); await saveCache(); }
  } finally { loading = false; }
}
const saveCache = () => kv.set('cache', Object.assign({ school: D.school, students: D.students, fees: D.fees, pays: D.pays, staff: D.staff, dash: D.dash, dcl: D.dcl, dme: D.dme, sub: D.sub, smsc: D.smsc, loaded: D.loaded }, Object.fromEntries(LISTS.map(k => [k, D[k]]))));

/* ---------- offline queue + sync ---------- */
async function sync(quiet) {
  if (busy || !online() || !U || !sb) return;
  busy = true; draw();
  try {
    for (const q of D.q.filter(x => x.state !== 'done')) {
      let r;
      if (q.k === 'r') r = await sb.rpc('queue_reminders', { p_school: sid(), p_students: q.ids, p_template: q.tpl, p_when: q.when || null });
      else if (q.k === 'x') r = await sb.from('expenses').upsert(q.row, { onConflict: 'id', ignoreDuplicates: true });
      else r = await sb.rpc('record_payment', { p_id: q.id, p_fee_item: q.fee, p_amount: q.amt, p_method: q.method, p_ref: q.ref || null, p_occurred: q.at, p_device: devId });
      if (r.error) { q.state = 'failed'; q.err = friendly(r.error); } else { q.state = 'done'; q.receipt = r.data && (r.data.receipt_no || (Array.isArray(r.data) && r.data[0] && r.data[0].receipt_no)); }
    }
    await kv.set('q', D.q);
    await pull();
    D.q = D.q.filter(x => x.state !== 'done' || (Date.now() - new Date(x.at)) < 86400000);
    await kv.set('q', D.q);
  } catch (e) { if (!quiet) toast(friendly(e), 'bad'); }
  busy = false; draw(); if (window.afterSync) window.afterSync();
}
async function enqueue(item) { D.q.push(item); await kv.set('q', D.q); draw(); if (online()) await sync(true); }
function dropFailed(id) { D.q = D.q.filter(q => q.id !== id); kv.set('q', D.q); draw(); }

/* ---------- auth ---------- */
async function boot() {
  if (location.hash === '#signup') { AUTH_UP = true; history.replaceState(null, '', location.pathname); }
  const c = await kv.get('cache'); if (c) { Object.assign(D, c); reindex(); }
  D.q = (await kv.get('q')) || [];
  if (!sb) return draw();
  try {
    const s = await sb.auth.getSession(); U = s.data.session ? s.data.session.user : null;
    if (!U && c && c.school && !online()) U = { id: 'offline' };
    sb.auth.onAuthStateChange((ev, se) => { if (ev === 'PASSWORD_RECOVERY') { RECOVERY = true; draw(); } const nu = se ? se.user : null; if ((nu && (!U || U.id !== nu.id)) || (!nu && U && U.id !== 'offline')) { U = nu; if (U) pull().then(draw); else draw(); } });
    draw();
    if (U && U.id !== 'offline') { await pull(); draw(); sync(true); }
  } catch (e) { draw(); }
}
async function doAuth(up) {
  const e = $('au_e').value.trim(), p = $('au_p').value;
  if (!e || !p) { AUTH_ERR = 'Enter your email and password.'; return draw(); }
  $('au_b').disabled = true;
  const r = up ? await sb.auth.signUp({ email: e, password: p }) : await sb.auth.signInWithPassword({ email: e, password: p });
  if (r.error) { AUTH_ERR = friendly(r.error); return draw(); }
  if (up && !r.data.session) { AUTH_ERR = ''; AUTH_OK = 'Account created. Check your email to confirm it, then sign in.'; AUTH_UP = false; return draw(); }
  AUTH_ERR = ''; AUTH_OK = ''; U = r.data.user; await pull(); location.hash = '#/home'; draw(); sync(true);
}
async function signOut() {
  const ok = await askYes('Sign out?', D.q.some(q => q.state !== 'done') ? 'Some payments are still waiting to sync. Sign in again later on this device to send them.' : 'You will need to sign in again.', 'Sign out');
  if (!ok) return;
  closeSheet(); try { await sb.auth.signOut(); } catch (e) { }
  U = null; const q = D.q; D = { school: null, students: [], fees: [], pays: [], q, staff: [] }; LISTS.forEach(k => D[k] = []); reindex(); await kv.set('cache', {}); location.hash = '#/home'; draw();
}
async function makeSchool() {
  const n = $('sc_n').value.trim(); if (n.length < 2) { toast('Enter the school name.', 'bad'); return; }
  const r = await sb.rpc('create_school', { p_name: n }); if (r.error) return toast(friendly(r.error), 'bad');
  await pull(); location.hash = '#/home'; draw(); toast('School created. It will be switched on once FeePilot approves it.', 'ok');
}

/* ---------- router ---------- */
function parseRoute() { const h = (location.hash || '#/home').replace(/^#\/?/, ''); const [name, id] = h.split('/'); return { name: name || 'home', id: id ? decodeURIComponent(id) : null }; }
function go(path) { if (location.hash === '#/' + path) draw(); else location.hash = '#/' + path; }
addEventListener('hashchange', () => { closeSheet(); draw(); window.scrollTo(0, 0); });
addEventListener('online', () => { sync(true); });
addEventListener('offline', () => draw());

async function joinCode() {
  const raw = val('jc_c'); if (raw.replace(/[^A-Za-z0-9]/g, '').length < 8) { AUTH_ERR = 'Enter the 8-character code you were given.'; return draw(); }
  const b = $('jc_b'); if (b) b.disabled = true;
  if (!U || U.id === 'offline') { const a = await sb.auth.signInAnonymously(); if (a.error) { AUTH_ERR = friendly(a.error); return draw(); } U = a.data.user; }
  const r = await sb.rpc('join_with_code', { p_code: raw });
  if (r.error) { AUTH_ERR = friendly(r.error); return draw(); }
  AUTH_ERR = ''; AUTH_OK = ''; AUTH_JOIN = false; await pull(); location.hash = '#/home'; draw(); sync(true); toast('Welcome! You have joined ' + ((D.school && D.school.name) || 'the school') + '.', 'ok');
}

/* ===== FeePilot UI kit: icons, sheets, toast, dialogs, charts, combo box, shell ===== */
const IC = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
  students: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>',
  pay: '<path d="M12 5v14M5 12h14"/>',
  payments: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
  expenses: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  accounts: '<path d="M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/>',
  budgets: '<path d="M12 3a9 9 0 109 9h-9z"/><path d="M15 3.5A9 9 0 0120.5 9H15z"/>',
  suppliers: '<path d="M2 7h11v9H2zM13 10h4l4 3v3h-8z"/><circle cx="6.5" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  reports: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  years: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  sms: '<path d="M4 5h16v11H9l-5 4z"/>',
  staff: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M16 5a3.5 3.5 0 010 6M18 14c2.5.6 4 2.6 4 5"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  sync: '<path d="M20 11a8 8 0 00-14-4L4 9M4 4v5h5M4 13a8 8 0 0014 4l2-2M20 20v-5h-5"/>',
  platform: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  more: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
  chat: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>',
  print: '<path d="M7 9V3h10v6M6 18H4v-7h16v7h-2M7 14h10v7H7z"/>',
  down: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>',
  check: '<path d="M5 12.5l4.500 4.500L19 7.500"/>',
  chev: '<path d="M9 6l6 6-6 6"/>'
};
const ico = (k, sz) => '<svg viewBox="0 0 24 24" ' + (sz ? 'width="' + sz + '" height="' + sz + '" ' : '') + 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[k] || '') + '</svg>';

/* ---------- toast + sheets + dialogs ---------- */
let TO = null;
function toast(msg, kind) {
  const old = document.querySelector('.toast'); if (old) old.remove(); clearTimeout(TO);
  const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t);
  TO = setTimeout(() => t.remove(), kind === 'bad' ? 5200 : 3200);
}
let SH = null, DIRTY = false;
function sheet(html, opt) {
  opt = opt || {}; closeSheet(true);
  const o = document.createElement('div'); o.className = 'ov';
  o.innerHTML = '<div class="sheet' + (opt.wide ? ' wide' : '') + '" role="dialog" aria-modal="true"><div class="grab"></div><button class="x np" aria-label="Close" onclick="closeSheet()">✕</button>' + html + '</div>';
  o.addEventListener('mousedown', e => { if (e.target === o) closeSheet(); });
  document.body.appendChild(o); SH = o; document.body.style.overflow = 'hidden';
  if (opt.after) setTimeout(opt.after, 0);
}
function closeSheet(silent) {
  if (SH) { SH.remove(); SH = null; document.body.style.overflow = ''; }
  if (!silent && DIRTY) { DIRTY = false; draw(); }
}
addEventListener('keydown', e => { if (e.key === 'Escape') { const d = document.getElementById('dlg'); if (d) d.remove(); else closeSheet(); } });
function dialog(inner) {
  return new Promise(res => {
    const o = document.createElement('div'); o.id = 'dlg'; o.className = 'ov'; o.style.zIndex = 110; o.style.alignItems = 'center';
    o.innerHTML = '<div class="sheet" style="border-radius:24px;max-width:400px;padding:22px 20px">' + inner + '</div>';
    document.body.appendChild(o);
    const done = v => { o.remove(); res(v); };
    o.querySelector('[data-ok]').onclick = () => done(o.querySelector('textarea,input') ? o.querySelector('textarea,input').value : true);
    o.querySelector('[data-no]').onclick = () => done(null);
    const f = o.querySelector('textarea,input'); if (f) f.focus();
  });
}
const askYes = (title, msg, ok, danger) => dialog('<h2 style="padding:0">' + E(title) + '</h2><p class="m" style="font-size:14.5px">' + E(msg) + '</p><div class="btns"><button class="btn sec" data-no>Cancel</button><button class="btn ' + (danger ? 'bad' : '') + '" data-ok>' + E(ok || 'OK') + '</button></div>').then(v => !!v);
const askText = (title, label, ok) => dialog('<h2 style="padding:0">' + E(title) + '</h2><label class="l">' + E(label) + '</label><textarea class="in" rows="3"></textarea><div class="btns"><button class="btn sec" data-no>Cancel</button><button class="btn" data-ok>' + E(ok || 'Continue') + '</button></div>');

/* ---------- small components ---------- */
const AVC = ['#2158D6', '#7A4FFF', '#0E9F8E', '#E8590C', '#C2255C', '#2B8A3E', '#9C36B5', '#1C7ED6'];
function avatar(name, size, photo) {
  let h = 0; for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; const col = AVC[h % AVC.length];
  const s = size || 40;
  return '<span class="av" style="width:' + s + 'px;height:' + s + 'px;background:' + col + '1A;color:' + col + ';font-size:' + Math.round(s * .38) + 'px">' + (photo ? '<img alt="" src="' + E(photo) + '">' : E(initials(name))) + '</span>';
}
const empty = (i, t, b) => '<div class="empty"><span class="ei">' + i + '</span>' + E(t) + (b ? '<div class="btns" style="justify-content:center">' + b + '</div>' : '') + '</div>';
const rowH = (left, mid, right, onclick) => '<div class="row ' + (onclick ? 'tap' : '') + '"' + (onclick ? ' onclick="' + onclick + '"' : '') + '>' + (left || '') + '<div class="t">' + mid + '</div>' + (right != null ? '<div class="v">' + right + '</div>' : '') + '</div>';
const opts = (a, cur) => a.map(o => '<option value="' + E(o[0]) + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + E(o[1]) + '</option>').join('');
const statusBadge = b => b <= 0 ? '<span class="badge ok">Paid up</span>' : '<span class="badge warn">Owes</span>';
function field(id, label, ph, x) { return '<label class="l" for="' + id + '">' + label + '</label><input class="in" id="' + id + '" placeholder="' + E(ph || '') + '" ' + (x || '') + '>'; }
const val = id => { const e = $(id); return e ? e.value.trim() : ''; };
function segH(id, items, cur, fn) { return '<div class="seg" id="' + id + '">' + items.map(i => '<button class="' + (i[0] === cur ? 'on' : '') + '" onclick="' + fn + '(\'' + i[0] + '\')">' + E(i[1]) + '</button>').join('') + '</div>'; }

/* ---------- charts ---------- */
function ring(id, v, c1, c2, label, size) {
  const L = 2 * Math.PI * 33, a = (L * v / 100).toFixed(1), s = size || 92;
  return '<div><svg viewBox="0 0 80 80" width="' + s + '" height="' + s + '" role="img" aria-label="' + E(label) + ' ' + Math.round(v) + '%"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs><circle cx="40" cy="40" r="33" fill="none" stroke="#E4EAF7" stroke-width="8"/><circle cx="40" cy="40" r="33" fill="none" stroke="url(#' + id + ')" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + a + ' ' + L.toFixed(1) + '" transform="rotate(-90 40 40)"/><text x="40" y="46" text-anchor="middle" font-size="17" font-weight="800" fill="#0B1B3A">' + Math.round(v) + '%</text></svg><div class="m">' + E(label) + '</div></div>';
}
function spark(vals) {
  const mx = Math.max(1, ...vals), n = vals.length;
  return '<polyline points="' + vals.map((v, i) => (i * 130 / (n - 1)).toFixed(1) + ',' + (46 - Math.floor(v * 40 / mx))).join(' ') + '" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
}
function smooth(P) { // P: [[x,y],...] -> smooth path, control points clamped so the curve never overshoots
  if (P.length < 2) return ''; let d = 'M' + P[0][0].toFixed(1) + ',' + P[0][1].toFixed(1);
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2, lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
    const c1y = Math.max(lo, Math.min(hi, p1[1] + (p2[1] - p0[1]) / 6)), c2y = Math.max(lo, Math.min(hi, p2[1] - (p3[1] - p1[1]) / 6));
    d += 'C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ',' + c1y.toFixed(1) + ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
  } return d;
}
const TR = {};
function trendSVG(id, pts) { // pts: [{l,v}]
  TR[id] = pts; const W = 320, H = 130, pl = 6, pr = 6, pt = 14, pb = 22, mx = Math.max(1, ...pts.map(p => p.v));
  const X = i => pl + i * (W - pl - pr) / Math.max(1, pts.length - 1), Y = v => pt + (H - pt - pb) * (1 - v / mx);
  const P = pts.map((p, i) => [X(i), Y(p.v)]), line = smooth(P), area = line + 'L' + X(pts.length - 1) + ',' + (H - pb) + 'L' + X(0) + ',' + (H - pb) + 'Z';
  const bi = pts.reduce((b, p, i) => p.v > pts[b].v ? i : b, 0), step = Math.max(1, Math.ceil(pts.length / 5));
  return '<div class="m" id="' + id + '_r" style="font-weight:700;min-height:18px"></div><svg id="' + id + '" viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;touch-action:pan-y;display:block" onpointermove="trendMove(event,\'' + id + '\')" onpointerleave="trendOut(\'' + id + '\')"><defs><linearGradient id="' + id + '_g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F6FED" stop-opacity=".30"/><stop offset="1" stop-color="#2F6FED" stop-opacity="0"/></linearGradient></defs>' +
    [0, .5, 1].map(t => '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + (pt + (H - pt - pb) * t) + '" y2="' + (pt + (H - pt - pb) * t) + '" stroke="#E7EDFA" stroke-width="1"/>').join('') +
    '<path d="' + area + '" fill="url(#' + id + '_g)"/><path d="' + line + '" fill="none" stroke="#2158D6" stroke-width="2.6" stroke-linecap="round"/>' +
    '<circle cx="' + P[bi][0] + '" cy="' + P[bi][1] + '" r="4.5" fill="#fff" stroke="#F5B301" stroke-width="2.5"/>' +
    pts.map((p, i) => i % step === 0 || i === pts.length - 1 ? '<text x="' + X(i) + '" y="' + (H - 5) + '" font-size="9" fill="#55657F" text-anchor="' + (i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle') + '">' + E(p.l) + '</text>' : '').join('') +
    '<circle id="' + id + '_d" r="5" fill="#2158D6" stroke="#fff" stroke-width="2" style="display:none"/></svg>';
}
function trendMove(e, id) {
  const pts = TR[id], s = $(id); if (!pts || !s) return; const r = s.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 320;
  const i = Math.max(0, Math.min(pts.length - 1, Math.round((x - 6) / (308 / Math.max(1, pts.length - 1))))), mx = Math.max(1, ...pts.map(p => p.v));
  const d = $(id + '_d'); d.style.display = ''; d.setAttribute('cx', 6 + i * 308 / Math.max(1, pts.length - 1)); d.setAttribute('cy', 14 + 94 * (1 - pts[i].v / mx));
  $(id + '_r').textContent = pts[i].l + ' · ' + fm(pts[i].v);
}
function trendOut(id) { const d = $(id + '_d'); if (d) d.style.display = 'none'; const r = $(id + '_r'); if (r) r.textContent = ''; }
const DC = ['#2158D6', '#F5B301', '#14A44D', '#7A4FFF', '#E8590C', '#0E9F8E'];
function donut(items) { // items [[label,value]]
  const tot = sum(items, x => x[1]); if (tot <= 0) return '<div class="m">No data yet.</div>';
  let acc = 0; const L = 2 * Math.PI * 30;
  const segs = items.map((x, i) => { const f = x[1] / tot, o = '<circle cx="40" cy="40" r="30" fill="none" stroke="' + DC[i % DC.length] + '" stroke-width="13" stroke-dasharray="' + (f * L).toFixed(2) + ' ' + (L - f * L).toFixed(2) + '" stroke-dashoffset="' + (-acc * L).toFixed(2) + '" transform="rotate(-90 40 40)"/>'; acc += f; return o; }).join('');
  return '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap"><svg viewBox="0 0 80 80" width="120" height="120" role="img" aria-label="Collections by method">' + segs + '</svg><div style="flex:1;min-width:150px">' + items.map((x, i) => '<div class="hb" style="margin:6px 0"><div class="hr"><span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + DC[i % DC.length] + ';margin-right:7px"></i>' + E(x[0]) + '</span><span>' + Math.round(x[1] * 100 / tot) + '%</span></div></div>').join('') + '</div></div>';
}
function hbars(items) {
  const mx = Math.max(1, ...items.map(x => x[1]));
  return items.length ? items.map(x => '<div class="hb"><div class="hr"><span>' + E(x[0]) + '</span><span>' + fm(x[1]) + '</span></div><div class="bar"><i style="width:' + Math.max(2, Math.floor(x[1] * 100 / mx)) + '%"></i></div></div>').join('') : '<div class="m">No data yet.</div>';
}

/* ---------- type-to-search combo box ---------- */
const CB = {};
function combo(id, get, pick, ph, val0) {
  CB[id] = { get, pick, items: [], hl: 0 };
  return '<div class="combo"><input class="in" id="' + id + '" autocomplete="off" placeholder="' + E(ph) + '" value="' + E(val0 || '') + '" oninput="cbIn(\'' + id + '\')" onfocus="cbIn(\'' + id + '\')" onkeydown="cbKey(event,\'' + id + '\')"><div class="clist hide" id="' + id + '_l"></div></div>';
}
function cbIn(id) {
  const c = CB[id], l = $(id + '_l'); if (!c || !l) return; c.items = c.get($(id).value.trim()).slice(0, 40); c.hl = 0;
  l.innerHTML = c.items.length ? c.items.map((x, i) => '<div class="ci' + (i === 0 ? ' hl' : '') + '" onmousedown="event.preventDefault();cbPick(\'' + id + '\',' + i + ')"><div class="t"><b>' + E(x.label) + '</b><span class="m">' + E(x.sub || '') + '</span></div>' + (x.right ? '<b>' + x.right + '</b>' : '') + '</div>').join('') : '<div class="ci m">No match. Check the spelling or ID.</div>';
  l.classList.remove('hide');
}
function cbPick(id, i) { const c = CB[id], x = c.items[i]; if (!x) return; $(id).value = x.label; $(id + '_l').classList.add('hide'); c.pick(x); }
function cbKey(e, id) {
  const c = CB[id], l = $(id + '_l'); if (!c) return; const n = c.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); c.hl = (c.hl + (e.key === 'ArrowDown' ? 1 : -1) + n) % Math.max(1, n); [...l.children].forEach((el, i) => el.classList.toggle('hl', i === c.hl)); }
  else if (e.key === 'Enter') { e.preventDefault(); if (n) cbPick(id, c.hl); } else if (e.key === 'Escape') l.classList.add('hide');
}
document.addEventListener('mousedown', e => { if (!e.target.closest || !e.target.closest('.combo')) document.querySelectorAll('.clist').forEach(l => l.classList.add('hide')); });
function matchStudents(q) {
  q = q.toLowerCase(); const act = D.students.filter(s => s.status === 'active' || !s.status);
  const sc = s => { const n = String(s.full_name).toLowerCase(); if (!q) return 3; if (n.startsWith(q)) return 0; if (n.split(/\s+/).some(w => w.startsWith(q))) return 1; if (String(s.student_no || '').toLowerCase().startsWith(q)) return 1; if (n.includes(q) || String(s.student_no || '').toLowerCase().includes(q) || String(s.guardian_name || '').toLowerCase().includes(q)) return 2; return 9; };
  return act.map(s => [sc(s), s]).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0] || a[1].full_name.localeCompare(b[1].full_name)).map(x => { const s = x[1], b = sbal(s.id); return { id: s.id, label: s.full_name, sub: (s.class_name || '') + (s.student_no ? ' · ' + s.student_no : ''), right: b > 0 ? '<span class="neg">' + fm(b) + '</span>' : '<span class="pos">Paid up</span>' }; });
}

/* ---------- shell ---------- */
let AUTH_ERR = '', AUTH_OK = '', AUTH_UP = false, AUTH_JOIN = false;
const MOBNAV = [['home', 'Home'], ['students', 'Students'], ['pay', 'Pay'], ['reports', 'Reports'], ['more', 'More']];
function deskNav() {
  const a = [['home', 'Overview'], ['students', 'Students'], ['payments', 'Payments'], ['expenses', 'Expenses'], ['accounts', 'Accounts'], ['budgets', 'Budgets'], ['suppliers', 'Suppliers'], ['reports', 'Reports'], ['years', 'Academic years']];
  if (canFee()) a.push(['sms', 'SMS reminders']); if (isAd()) a.push(['staff', 'Staff'], ['settings', 'Settings']); a.push(['sync', 'Status']); if (D.padmin) a.push(['platform', 'Platform admin']); return a;
}
const MORE_PAGES = () => [['payments', 'Payments', '💳'], ['expenses', 'Expenses', '🧾'], ['accounts', 'Accounts & cashbook', '🏦'], ['budgets', 'Budgets', '📊'], ['suppliers', 'Suppliers', '🚚'], ['years', 'Academic years', '📅']].concat(canFee() ? [['sms', 'SMS reminders', '💬']] : [], isAd() ? [['staff', 'Staff & permissions', '👥'], ['settings', 'School settings', '⚙️']] : [], [['sync', 'Sync & status', '🔄']], D.padmin ? [['platform', 'Platform admin', '🛡️']] : []);
function chromeHTML() {
  const r = parseRoute(), np = D.q.filter(x => x.state !== 'done').length, on = online();
  const top = '<header id="tb"><span class="logo">F</span><span class="sch">' + E(D.school.name) + '</span><span class="sp"></span><span class="st ' + (on ? '' : 'off') + '">' + (on ? (busy ? 'Syncing…' : 'Online') : 'Offline') + (np ? ' · ' + np + ' to sync' : '') + '</span><button class="ib" aria-label="Search students" onclick="searchSheet()">' + ico('search') + '</button><button class="ib" style="border-radius:50%;padding:0" aria-label="Account" onclick="profileSheet()">' + avatar((U && U.email) || D.school.name, 40) + '</button></header>';
  const act = n => r.name === n || (n === 'students' && r.name === 'student');
  const nav = '<nav id="nav" aria-label="Main"><div class="nb"><span class="logo">F</span>FeePilot</div>' +
    (canPay() ? '<button class="fab desk" onclick="paySheet()">' + ico('pay') + '<span>Record payment</span></button>' : '') +
    deskNav().map(x => '<button class="desk ' + (act(x[0]) ? 'on' : '') + '" onclick="go(\'' + x[0] + '\')">' + ico(x[0] === 'sync' ? 'sync' : x[0]) + '<span>' + x[1] + '</span></button>').join('') +
    MOBNAV.map(x => x[0] === 'pay' ? (canPay() ? '<button class="fab mob" onclick="paySheet()" aria-label="Record payment">' + ico('pay') + '<span>PAY</span></button>' : '<button class="mob" onclick="searchSheet()">' + ico('search') + '<span>Search</span></button>') : '<button class="mob ' + (act(x[0]) || (x[0] === 'more' && !['home', 'students', 'reports'].includes(r.name) && r.name !== 'student') ? 'on' : '') + '" onclick="go(\'' + x[0] + '\')">' + ico(x[0]) + '<span>' + x[1] + '</span></button>').join('') + '</nav>';
  return top + nav;
}
function authHTML() {
  if (!sb) return '<div class="auth"><div class="logo">F</div><h1>FeePilot</h1><div class="card c"><p class="b">FeePilot could not load.</p><p class="m">Check your internet connection and try again.</p><button class="btn blk" onclick="location.reload()">Try again</button></div></div>';
  if (RECOVERY) return '<div class="auth"><div class="logo">F</div><h1>Choose a new password</h1><div class="card"><label class="l" for="np1">New password</label><input class="in" id="np1" type="password" autocomplete="new-password" placeholder="At least 6 characters"><label class="l" for="np2">Repeat it</label><input class="in" id="np2" type="password" autocomplete="new-password" onkeydown="if(event.key===\'Enter\')saveNewPw()">' + (AUTH_ERR ? '<div class="err" role="alert">' + E(AUTH_ERR) + '</div>' : '') + '<div class="btns"><button class="btn" onclick="saveNewPw()">Save password</button></div></div></div>';
  if (U && D.susp && !D.school) return '<div class="auth"><div class="logo">F</div><h1>FeePilot</h1><div class="card"><p class="b neg">This school account is suspended.</p><p class="m">Contact FeePilot support to restore access.</p><button class="btn sec blk" onclick="signOut()">Sign out</button></div></div>';
  if (AUTH_JOIN) return '<div class="auth"><div class="logo">F</div><h1>Join a school</h1><p class="tag">Type the code your school gave you. No email or password needed.</p><div class="card">' + field('jc_c', 'Join code', 'e.g. K7M2QX4R', 'autocapitalize="characters" autocomplete="off" maxlength="12" style="letter-spacing:3px;font-size:20px;text-align:center" onkeydown="if(event.key===\'Enter\')joinCode()"') + (AUTH_ERR ? '<div class="err" role="alert">' + E(AUTH_ERR) + '</div>' : '') + '<div class="btns"><button class="btn" id="jc_b" onclick="joinCode()">Join school</button></div>' + (U ? '' : '<p class="c m" style="margin:14px 0 0"><a href="#" onclick="AUTH_JOIN=false;AUTH_ERR=\'\';draw();return false">← Back to sign in</a></p>') + '</div></div>';
  if (U && !D.school) return '<div class="auth"><div class="logo">F</div><h1>Set up your school</h1><p class="tag">Create your school to start recording fees. If you were invited by a school, sign in with the email that was invited.</p><div class="card">' + field('sc_n', 'School name', 'e.g. Bright Future Academy') + '<div class="btns"><button class="btn" onclick="makeSchool()">Create school</button></div><div class="btns"><button class="btn sec" onclick="AUTH_JOIN=true;AUTH_ERR=\'\';draw()">I have a join code</button><button class="btn sec" onclick="boot()">I was invited by email. Check again</button><button class="btn sec" onclick="signOut()">Sign out</button></div></div></div>';
  return '<div class="auth"><div class="logo">F</div><h1>FeePilot</h1><p class="tag">Every payment. Every student. Every cedi. Accounted for.</p><div class="card"><h3 style="margin-bottom:4px">' + (AUTH_UP ? 'Create your account' : 'Welcome back') + '</h3><p class="m" style="margin:0 0 6px">' + (AUTH_UP ? 'Use your work email. You will set up your school next.' : 'Sign in to your school account.') + '</p>' + (AUTH_OK ? '<div class="sync" style="background:var(--okl);color:#0C7A38">' + E(AUTH_OK) + '</div>' : '') + field('au_e', 'Email', 'you@school.edu.gh', 'type="email" autocomplete="username" inputmode="email"') + '<label class="l" for="au_p">Password</label><input class="in" id="au_p" type="password" placeholder="Password" autocomplete="' + (AUTH_UP ? 'new-password' : 'current-password') + '" onkeydown="if(event.key===\'Enter\')doAuth(' + AUTH_UP + ')">' + (AUTH_ERR ? '<div class="err" role="alert">' + E(AUTH_ERR) + '</div>' : '') + '<div class="btns"><button class="btn" id="au_b" onclick="doAuth(' + AUTH_UP + ')">' + (AUTH_UP ? 'Create account' : 'Sign in') + '</button></div><p class="c m" style="margin:14px 0 0">' + (AUTH_UP ? 'Already have an account? <a href="#" onclick="AUTH_UP=false;AUTH_ERR=\'\';draw();return false">Sign in</a>' : '<a href="#" onclick="forgotPw();return false">Forgot password?</a><br><span style="display:inline-block;margin-top:8px">New school? <a href="#" onclick="AUTH_UP=true;AUTH_ERR=\'\';AUTH_OK=\'\';draw();return false">Create an account</a></span><br><span style="display:inline-block;margin-top:8px">Have a join code? <a href="#" onclick="AUTH_JOIN=true;AUTH_ERR=\'\';draw();return false">Join a school</a></span>') + '</p></div><p class="back"><a href="../">← Back to home</a></p></div>';
}
const PAGES = {}; const ACCESS = { sms: canFee, staff: isAd, settings: isAd, platform: () => !!D.padmin };
function isTyping() { const a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest && a.closest('#main'); }
function subBanner() {
  const s = D.sub; if (!s) return ''; const p = s.plans || {}; let m = '', k = 'warn';
  const gone = s.status === 'trial' ? (s.trial_ends_at && new Date(s.trial_ends_at) < new Date()) : s.status === 'active' ? (s.renews_on && new Date(s.renews_on).getTime() + 5 * 864e5 < Date.now()) : false;
  if (s.status === 'pending') { m = 'Waiting for approval. You can look around, but recording is switched on once FeePilot activates your school.'; k = 'gold'; }
  else if (gone) { m = 'Subscription ended. The school is read-only. Call FeePilot support to renew.'; }
  else if (s.status === 'active' && s.renews_on && (new Date(s.renews_on) - Date.now()) < 7 * 864e5) { m = 'Subscription renews ' + fd(s.renews_on) + '. Please pay before then to stay active.'; k = 'gold'; }
  else if (s.status === 'trial') { m = 'Free trial' + (s.trial_ends_at ? ' ends ' + fd(s.trial_ends_at) : ''); k = 'gold'; }
  else if (s.status === 'past_due') m = 'Subscription overdue. Contact FeePilot support to avoid suspension.';
  else if (s.status === 'suspended' || s.status === 'cancelled') m = 'Subscription ' + s.status + '.';
  return m ? '<div class="att ' + (k === 'gold' ? '' : 'warn') + '" style="cursor:default"><span class="ai" style="background:var(--goldl)">⭐</span><div class="t"><b>' + E(m) + '</b>' + (p.name ? '<span class="m">Plan: ' + E(p.name) + '</span>' : '') + '</div></div>' : '';
}
function draw(force) {
  const A = $('app'); if (!A) return;
  if (RECOVERY || !sb || !U || !D.school) { A.innerHTML = authHTML(); return; }
  if (!force && (SH || isTyping())) { DIRTY = !!SH || DIRTY; const t = $('tb'), n = $('nav'); if (t && n) { const w = document.createElement('div'); w.innerHTML = chromeHTML(); t.replaceWith(w.firstChild); n.replaceWith(w.firstChild); } return; }
  const r = parseRoute(); let name = r.name, fn = PAGES[name] || PAGES.home;
  if (ACCESS[name] && !ACCESS[name]()) fn = PAGES.home;
  window.__after = null;
  const body = fn(r);
  A.innerHTML = (DEMO ? '<div class="demo">DEMO · sample school data · nothing here is saved or sent</div>' : '') + chromeHTML() + '<main id="main">' + subBanner() + body + '</main>';
  if (window.__after) setTimeout(window.__after, 0);
}

/* ---------- student photos (private bucket, signed URLs cached) ---------- */
const PHC = {};
function avs(id, size) { const s = stu(id), c = PHC[s.photo_path]; return avatar(s.full_name || '?', size, c && c.exp > Date.now() ? c.url : '').replace('<span class="av"', '<span class="av" data-sid="' + E(id) + '"'); }
let phBusy = false, phT = 0;
async function hydratePhotos() {
  if (phBusy || !sb || !U || !D.school || !navigator.onLine) return;
  const els = [...document.querySelectorAll('.av[data-sid]')]; if (!els.length) return;
  const need = new Set(); els.forEach(e => { const s = stu(e.dataset.sid), c = s.photo_path && PHC[s.photo_path]; if (s.photo_path && !(c && c.exp > Date.now())) need.add(s.photo_path); });
  if (need.size) { phBusy = true; try { const list = [...need].slice(0, 200), r = await sb.storage.from('photos').createSignedUrls(list, 3600); (r.data || []).forEach(x => { if (x.signedUrl) PHC[x.path] = { url: x.signedUrl, exp: Date.now() + 3300000 }; }); } catch (e) { } phBusy = false; }
  document.querySelectorAll('.av[data-sid]').forEach(e => { const s = stu(e.dataset.sid), c = s.photo_path && PHC[s.photo_path]; if (c && !e.querySelector('img')) { const i = document.createElement('img'); i.alt = ''; i.src = c.url; e.textContent = ''; e.appendChild(i); } });
}
new MutationObserver(() => { clearTimeout(phT); phT = setTimeout(hydratePhotos, 120); }).observe(document.body, { childList: true, subtree: true });

/* ---------- password reset / change ---------- */
let RECOVERY = false;
async function forgotPw() {
  const e = ($('au_e') && $('au_e').value.trim()) || ''; if (!/^\S+@\S+\.\S+$/.test(e)) { AUTH_ERR = 'Type your email above first, then tap "Forgot password?".'; return draw(); }
  const r = await sb.auth.resetPasswordForEmail(e, { redirectTo: location.origin + location.pathname });
  if (r.error) { AUTH_ERR = friendly(r.error); AUTH_OK = ''; } else { AUTH_ERR = ''; AUTH_OK = 'If that email has an account, a reset link is on its way. Check your inbox and spam.'; }
  draw();
}
async function saveNewPw() {
  const a = $('np1').value, b = $('np2').value; if (a.length < 6) { AUTH_ERR = 'Use at least 6 characters.'; return draw(); } if (a !== b) { AUTH_ERR = 'The two passwords do not match.'; return draw(); }
  const r = await sb.auth.updateUser({ password: a }); if (r.error) { AUTH_ERR = friendly(r.error); return draw(); }
  RECOVERY = false; AUTH_ERR = ''; history.replaceState(null, '', location.pathname + '#/home'); await pull(); draw(); toast('Password changed.', 'ok');
}
function changePwSheet() {
  sheet('<h2>Change password</h2><label class="l" for="cp1">New password</label><input class="in" id="cp1" type="password" autocomplete="new-password" placeholder="At least 6 characters"><label class="l" for="cp2">Repeat it</label><input class="in" id="cp2" type="password" autocomplete="new-password"><div class="btns"><button class="btn blk" onclick="changePw()">Save password</button></div>');
}
async function changePw() {
  const a = $('cp1').value, b = $('cp2').value; if (a.length < 6) return toast('Use at least 6 characters.', 'bad'); if (a !== b) return toast('The two passwords do not match.', 'bad'); if (!online()) return toast('You need a connection to change your password.', 'bad');
  const r = await sb.auth.updateUser({ password: a }); if (r.error) return toast(friendly(r.error), 'bad'); closeSheet(); toast('Password changed.', 'ok');
}
/* ---------- quiet "add to home screen" tip (after sign-in only) ---------- */
let DEFERRED = null; addEventListener('beforeinstallprompt', e => { e.preventDefault(); DEFERRED = e; });
function installTip() {
  try { if (localStorage.fp_tip || matchMedia('(display-mode: standalone)').matches || navigator.standalone || !U || !D.school) return; } catch (e) { return; }
  if ($('tip')) return; const d = document.createElement('div'); d.id = 'tip'; d.className = 'card np'; d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:84px;z-index:50;max-width:520px;margin:0 auto;display:flex;gap:12px;align-items:center;box-shadow:0 12px 40px rgba(11,42,102,.25)';
  d.innerHTML = '<div style="flex:1"><b>Open FeePilot like an app</b><div class="m">Add it to your home screen for one-tap access.</div></div><button class="btn sm" onclick="tipGo()">Add</button><button class="btn sm sec" onclick="tipX()">Not now</button>'; document.body.appendChild(d);
}
function tipX() { try { localStorage.fp_tip = '1'; } catch (e) { } const d = $('tip'); if (d) d.remove(); }
async function tipGo() { tipX(); if (DEFERRED) { DEFERRED.prompt(); DEFERRED = null; } else toast('In your browser menu, choose "Add to Home screen".', 'ok'); }
setInterval(() => { if (U && D.school && !SH) installTip(); }, 20000);

/* ===== FeePilot pages 1: dashboard, students, student profile, payments, receipts, search ===== */
const SV = { cls: '', sf: 'all', q: '', more: 60, days: 14, tpl: '0', pcls: '' };
const waNum = p => { p = String(p || '').replace(/\D/g, ''); if (!p) return ''; if (p.startsWith('0')) return '233' + p.slice(1); if (p.length === 9) return '233' + p; return p; };
const exF = f => f.carried_to ? f.paid_minor : f.amount_minor;
const netByDay = n => { const m = {}; D.pays.forEach(p => { const d = p.occurred_at.slice(0, 10); m[d] = (m[d] || 0) + p.amount_minor; }); return [...Array(n).keys()].map(i => { const dt = new Date(Date.now() - (n - 1 - i) * 864e5), k = dt.toISOString().slice(0, 10); return { l: dt.getUTCDate() + ' ' + MON[dt.getUTCMonth()], v: Math.max(0, m[k] || 0), k }; }); };
function stats() {
  const d = D.dash, F = D.fees, St = D.students.filter(s => s.status === 'active' || !s.status), T = d ? d.expected_minor : sum(F, exF), C = d ? d.collected_minor : sum(F, f => f.paid_minor);
  const owing = St.filter(s => sbal(s.id) > 0);
  return { d, T, C, O: Math.max(0, d ? d.outstanding_minor : T - C), rate: pct(C, T), ns: d ? d.students : St.length, ow: d ? d.owing : owing.length, od: d ? (d.overdue || 0) : 0 };
}
const checklist = () => {
  const st = [['Create your school', true], ['Add your students', D.students.length > 0], ['Assign fees to students', D.fees.length > 0], ['Record the first payment', D.pays.some(p => p.amount_minor > 0)]];
  if (st.every(x => x[1]) || !canPay()) return '';
  return '<div class="card"><h3>Get started</h3>' + st.map(x => '<div class="row"><span class="badge ' + (x[1] ? 'ok' : 'mut') + '" style="width:26px;text-align:center">' + (x[1] ? '✓' : '·') + '</span><div class="t ' + (x[1] ? 'm' : 'b') + '">' + x[0] + '</div></div>').join('') + '<div class="btns">' + (!D.students.length ? '<button class="btn" onclick="studentSheet()">Add a student</button><button class="btn sec" onclick="importSheet()">Import from Excel</button>' : !D.fees.length ? '<button class="btn" onclick="feeSheet()">Assign fees</button>' : '<button class="btn gold" onclick="paySheet()">Record a payment</button>') + '</div></div>';
};
PAGES.home = function () {
  const S = stats(), P = D.pays, t = td(), tp = P.filter(p => p.occurred_at.slice(0, 10) === t), tm = S.d && S.d.today_minor != null ? S.d.today_minor : sum(tp, p => p.amount_minor), hr = new Date().getUTCHours(), gr = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const nm = U && U.email ? U.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
  const days = netByDay(14).map(x => x.v), tr = netByDay(SV.days);
  const q = [];
  if (canPay()) q.push(['paySheet()', '💳', 'Payment', '#DCE8FF']); if (canPay()) q.push(['studentSheet()', '🎓', 'Student', '#EBE1FF']); if (canFee()) q.push(['feeSheet()', '🏷️', 'Fees', '#FFF0C7']);
  if (canPay()) q.push(['expenseSheet()', '🧾', 'Expense', '#FFE3D1']); if (canFee()) q.push(["go('sms')", '💬', 'Reminders', '#D9F5E3']); q.push(["go('reports')", '📊', 'Reports', '#E4E9F2']);
  const failed = D.q.filter(x => x.state === 'failed').length;
  let att = '';
  if (failed) att += '<div class="att bad" onclick="go(\'sync\')"><span class="ai">⚠️</span><div class="t"><b>' + failed + ' item' + (failed > 1 ? 's' : '') + ' failed to sync</b><span class="m">Tap to review</span></div>' + ico('chev', 18) + '</div>';
  if (S.ow) att += '<div class="att warn" onclick="SV.sf=\'owing\';SV.cls=\'\';go(\'students\')"><span class="ai">🔔</span><div class="t"><b>' + S.ow + ' student' + (S.ow > 1 ? 's' : '') + ' owe ' + fm(S.O) + '</b><span class="m">Tap to see who owes</span></div>' + ico('chev', 18) + '</div>' + (canFee() ? '<div class="att" onclick="go(\'sms\')"><span class="ai" style="background:#D9F5E3">💬</span><div class="t"><b>Send payment reminders</b><span class="m">SMS the guardians of students who owe</span></div>' + ico('chev', 18) + '</div>' : '');
  if (S.od) att += '<div class="att bad" onclick="SV.sf=\'owing\';go(\'students\')"><span class="ai">⏰</span><div class="t"><b>' + S.od + ' overdue account' + (S.od > 1 ? 's' : '') + '</b><span class="m">Past their due date</span></div>' + ico('chev', 18) + '</div>';
  if (!att && D.students.length) att = '<div class="att ok" style="cursor:default"><span class="ai">✅</span><div class="t"><b>You are all caught up</b><span class="m">Nobody owes the school right now.</span></div></div>';
  const cl = (D.dcl || []).filter(x => x.balance_minor > 0).sort((a, b) => b.balance_minor - a.balance_minor);
  const ins = []; if (S.ow) ins.push('📌 ' + S.ow + ' student' + (S.ow > 1 ? 's' : '') + ' owe ' + fm(S.O) + ' in total.'); if (cl[0]) ins.push('🏫 ' + E(cl[0].class_name) + ' owes the most: ' + fm(cl[0].balance_minor) + '.');
  const me = (D.dme || []).slice().sort((a, b) => b.total_minor - a.total_minor)[0]; if (me && me.total_minor > 0) ins.push('💳 Most collections this month came by ' + E(me.method) + ' (' + fm(me.total_minor) + ').');
  if (S.d && S.d.expenses_month_minor > 0) ins.push('🧾 Expenses this month: ' + fm(S.d.expenses_month_minor) + ' against ' + fm(S.d.month_minor) + ' collected.');
  const n = Math.max(1, S.ns), z = S.ns === 0;
  return '<h2 class="ph">' + gr + (nm ? ', ' + E(nm.split(' ')[0]) : '') + ' 👋</h2><div class="sub">' + new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Accra' }) + ' · ' + E(ROLES[role()] || role()) + '</div>' +
    '<div class="hero"><svg class="spk" viewBox="0 0 130 50" preserveAspectRatio="none">' + spark(days) + '</svg><div class="lab">COLLECTED TODAY</div><div class="big">' + fm(tm) + '</div><div class="sm2">' + tp.filter(p => p.amount_minor > 0).length + ' payment' + (tp.filter(p => p.amount_minor > 0).length === 1 ? '' : 's') + ' today</div><div class="pills"><span class="pill">Collected ' + fmShort(S.C) + '</span><span class="pill">Outstanding ' + fmShort(S.O) + '</span><span class="pill">Rate ' + S.rate + '%</span>' + (S.d ? '<span class="pill">This month ' + fmShort(S.d.month_minor) + '</span>' : '') + '</div></div>' +
    '<div class="card qa">' + q.map(x => '<button onclick="' + x[0] + '"><i style="background:' + x[3] + '">' + x[1] + '</i>' + x[2] + '</button>').join('') + '</div>' +
    checklist() + (att ? '<div>' + att + '</div>' : '') +
    '<div class="grid-d"><div class="card"><h3>Collection health</h3><div class="rings">' + ring('r1', S.rate, '#2F6FED', '#14A44D', 'Collected') + ring('r2', z ? 0 : pct(n - S.ow, n), '#7A4FFF', '#2F6FED', 'Cleared') + ring('r3', z ? 0 : pct(n - S.od, n), '#F5B301', '#E5484D', 'Not overdue') + '</div></div>' +
    '<div class="card"><h3>Insights</h3>' + (ins.length ? ins.map(x => '<div class="ins">' + x + '</div>').join('') : '<div class="m">Insights appear once you have students, fees and payments.</div>') + (canFee() && online() ? '<div class="srch" style="margin-top:12px"><input class="in" id="aq" placeholder="Ask FeePilot: which class owes the most?" onkeydown="if(event.key===\'Enter\')askAI()"></div><div id="ar" class="m" style="margin-top:6px"></div>' : '') + '</div></div>' +
    '<div class="card"><h3>Collections <span>' + segH('trd', [['7', '7d'], ['14', '14d'], ['30', '30d']], String(SV.days), 'setTrend') + '</span></h3>' + trendSVG('tr1', tr) + '</div>' +
    '<div class="grid-d"><div class="card"><h3>Outstanding by class</h3>' + hbars(cl.slice(0, 6).map(x => [x.class_name, x.balance_minor])) + '</div><div class="card"><h3>By payment method</h3>' + donut((D.dme || []).filter(x => x.total_minor > 0).map(x => [x.method, x.total_minor])) + '</div></div>' +
    '<div class="card"><h3>Recent receipts <a href="#/payments">See all</a></div>'.replace('</div>', '</h3>') + (P.filter(p => p.receipt_no).slice(0, 6).map(recRow).join('') || empty('🧾', 'No receipts yet. Record the first payment.')) + '</div>';
};
const setTrend = d => { SV.days = +d; draw(true); };
async function askAI() {
  const q = val('aq'); if (!q || !online()) return; $('ar').textContent = 'Thinking…';
  try { const r = await sb.functions.invoke('ai-assistant', { body: { question: q, school_id: sid() } }); let m = r.data && r.data.answer; if (r.error) { try { m = (await r.error.context.json()).error; } catch (e) { m = 'The assistant is unavailable right now.'; } } $('ar').textContent = m || 'No answer.'; } catch (e) { $('ar').textContent = 'The assistant is unavailable right now.'; }
}
function recRow(p) {
  const rev = p.amount_minor < 0;
  return rowH(avs(p.student_id, 40), '<b>' + E(sn(p.student_id)) + '</b><span class="m">' + E(p.receipt_no || 'Reversal') + ' · ' + E(p.method) + ' · ' + fd(p.occurred_at) + '</span>', '<span class="' + (rev ? 'neg' : '') + '">' + fm(p.amount_minor) + '</span>', p.receipt_no ? 'receiptSheet(\'' + p.id + '\')' : '');
}

/* ---------- students ---------- */
function stuRows() {
  const q = SV.q.toLowerCase();
  let L = D.students.filter(s => (SV.sf === 'inactive' ? (s.status && s.status !== 'active') : (!s.status || s.status === 'active')));
  if (SV.cls) L = L.filter(s => s.class_name === SV.cls);
  if (q) L = L.filter(s => [s.full_name, s.student_no, s.guardian_name, s.guardian_phone, s.class_name].some(v => String(v || '').toLowerCase().includes(q)));
  const B = {}; L.forEach(s => B[s.id] = sbal(s.id));
  if (SV.sf === 'owing') L = L.filter(s => B[s.id] > 0).sort((a, b) => B[b.id] - B[a.id]); else if (SV.sf === 'paid') L = L.filter(s => B[s.id] <= 0 && (FIDX[s.id] || []).length);
  return { L, B };
}
function stuList() {
  const { L, B } = stuRows();
  if (!L.length) return empty('🎓', D.students.length ? 'No students match.' : 'No students yet.', !D.students.length && canPay() ? '<button class="btn" onclick="studentSheet()">Add a student</button><button class="btn sec" onclick="importSheet()">Import from Excel</button>' : '');
  const tot = sum(L, s => Math.max(0, B[s.id]));
  return '<div class="m" style="margin:2px 0 6px">' + L.length + ' student' + (L.length > 1 ? 's' : '') + (tot > 0 ? ' · ' + fm(tot) + ' outstanding' : '') + '</div>' + L.slice(0, SV.more).map(s => rowH(avs(s.id, 42), '<b>' + E(s.full_name) + '</b><span class="m">' + E(s.class_name || 'No class') + (s.student_no ? ' · ' + E(s.student_no) : '') + (s.status && s.status !== 'active' ? ' · ' + E(s.status) : '') + '</span>', B[s.id] > 0 ? '<span class="neg">' + fm(B[s.id]) + '</span>' : (FIDX[s.id] ? '<span class="badge ok">Paid up</span>' : '<span class="badge mut">No fees</span>'), 'go(\'student/' + s.id + '\')')).join('') + (L.length > SV.more ? '<div class="btns"><button class="btn sec" onclick="SV.more+=100;stuRefresh()">Show more (' + (L.length - SV.more) + ')</button></div>' : '');
}
const stuRefresh = () => { const e = $('stu_list'); if (e) e.innerHTML = stuList(); };
const stuSearch = v => { SV.q = v; SV.more = 60; stuRefresh(); };
const setCls = c => { SV.cls = c; SV.more = 60; draw(true); };
const setSF = f => { SV.sf = f; SV.more = 60; draw(true); };
PAGES.students = function () {
  const cl = classes();
  return '<h2 class="ph">Students</h2><div class="sub">' + D.students.filter(s => !s.status || s.status === 'active').length + ' active · ' + cl.length + ' class' + (cl.length === 1 ? '' : 'es') + '</div>' +
    (canPay() ? '<div class="chips"><button class="chip on" style="background:var(--p);border-color:var(--p)" onclick="studentSheet()">＋ Add student</button>' + (canFee() ? '<button class="chip" onclick="feeSheet()">🏷️ Assign fees</button>' : '') + '<button class="chip" onclick="importSheet()">📥 Import</button><button class="chip" onclick="exportStudents()">📤 Export</button>' + (canFee() ? '<button class="chip" onclick="promoSheet()">⬆️ Promote class</button>' : '') + '</div>' : '') +
    '<div class="srch">' + ico('search') + '<input class="in" id="stu_q" placeholder="Search name, ID, guardian or phone" value="' + E(SV.q) + '" oninput="stuSearch(this.value)" autocomplete="off"></div>' +
    '<div class="chips"><button class="chip ' + (!SV.cls ? 'on' : '') + '" onclick="setCls(\'\')">All classes</button>' + cl.map(c => '<button class="chip ' + (SV.cls === c ? 'on' : '') + '" onclick="setCls(this.dataset.c)" data-c="' + E(c) + '">' + E(c) + '</button>').join('') + '</div>' +
    segH('sfs', [['all', 'All'], ['owing', 'Owing'], ['paid', 'Paid up'], ['inactive', 'Left']], SV.sf, 'setSF') +
    '<div class="card" style="padding:6px 16px" id="stu_list">' + stuList() + '</div>';
};

/* ---------- student profile ---------- */
PAGES.student = function (r) {
  const s = stu(r.id); if (!s.id) return '<div class="card">' + empty('🔎', 'Student not found.', '<button class="btn" onclick="go(\'students\')">Back to students</button>') + '</div>';
  const F = (FIDX[s.id] || []), b = sbal(s.id), due = sDue(s.id), paid = sPaid(s.id), ph = waNum(s.guardian_phone);
  window.__after = () => stuHistory(s.id);
  return '<div style="margin:10px 0"><a href="#/students">← Students</a></div>' +
    '<div class="card"><div style="display:flex;gap:14px;align-items:center"><span id="sphoto">' + avs(s.id, 64) + '</span><div class="t" style="min-width:0"><h2 style="font-size:21px">' + E(s.full_name) + '</h2><div class="m">' + E(s.class_name || 'No class') + (s.student_no ? ' · ID ' + E(s.student_no) : '') + '</div>' + (s.status && s.status !== 'active' ? '<span class="badge mut">' + E(s.status) + '</span>' : '') + '</div></div>' +
    '<div class="kpis" style="margin-top:14px"><div class="kpi"><span class="m">Owes</span><b class="' + (b > 0 ? 'neg' : 'pos') + '">' + fm(Math.max(0, b)) + '</b></div><div class="kpi"><span class="m">Paid so far</span><b>' + fm(paid) + '</b></div></div>' +
    (due > 0 ? '<div class="bar"><i style="width:' + pct(paid, due) + '%"></i></div><div class="m" style="margin-top:4px">' + pct(paid, due) + '% of ' + fm(due) + ' paid</div>' : '') +
    '<div class="btns">' + (canPay() && F.some(f => bal(f) > 0) ? '<button class="btn gold" onclick="paySheet(\'' + s.id + '\')">Record payment</button>' : '') + (canFee() ? '<button class="btn sec" onclick="feeSheet(\'' + s.id + '\')">Assign fee</button>' : '') + '</div></div>' +
    '<div class="card"><h3>Guardian</h3>' + (s.guardian_name || s.guardian_phone ? '<div class="kv"><span>Name</span><span>' + E(s.guardian_name || '—') + '</span></div><div class="kv"><span>Phone</span><span>' + E(s.guardian_phone || '—') + '</span></div>' + (s.sms_opt_out ? '<div class="m">SMS reminders are switched off for this guardian.</div>' : '') : '<div class="m">No guardian details yet.</div>') +
    (ph ? '<div class="btns"><a class="btn sec sm" href="tel:+' + ph + '">' + ico('phone', 16) + ' Call</a><a class="btn sec sm" target="_blank" rel="noopener" href="https://wa.me/' + ph + '?text=' + encodeURIComponent('Dear ' + (s.guardian_name || 'Parent') + ', ' + (b > 0 ? 'this is a friendly reminder that ' + s.full_name + ' has an outstanding school fee balance of GHS ' + fmn(b) + '. Kindly contact ' + D.school.name + ' for payment arrangements. Thank you.' : 'greetings from ' + D.school.name + '.')) + '">' + ico('chat', 16) + ' WhatsApp</a>' + (canFee() && b > 0 ? '<button class="btn sec sm" onclick="remindOne(\'' + s.id + '\')">💬 SMS reminder</button>' : '') + '</div>' : '') + '</div>' +
    '<div class="card"><h3>Fees</h3>' + (F.length ? F.slice().sort((a, c) => String(c.academic_year).localeCompare(String(a.academic_year))).map(f => { const bb = bal(f); return '<div class="row"><div class="t"><b>' + E(f.category) + '</b><span class="m">' + E(f.academic_year) + (f.carried_to ? ' · carried to ' + E(f.carried_to) : '') + ' · ' + fm(f.paid_minor) + ' of ' + fm(f.amount_minor) + '</span><div class="bar"><i style="width:' + pct(f.paid_minor, f.amount_minor) + '%"></i></div></div><div class="v">' + (bb > 0 ? '<div class="neg">' + fm(bb) + '</div>' + (canPay() ? '<button class="btn sm" style="margin-top:6px" onclick="paySheet(\'' + s.id + '\',\'' + f.fee_item_id + '\')">Pay</button>' : '') : '<span class="badge ok">Paid</span>') + '</div></div>'; }).join('') : empty('🏷️', 'No fees assigned yet.', canFee() ? '<button class="btn" onclick="feeSheet(\'' + s.id + '\')">Assign a fee</button>' : '')) + '</div>' +
    '<div class="card"><h3>Payments</h3><div id="stu_pays">' + stuPaysHTML(D.pays.filter(p => p.student_id === s.id)) + '</div></div>' +
    (canPay() ? '<div class="card"><h3>Manage</h3><div class="btns" style="margin-top:0"><button class="btn sec" onclick="studentSheet(\'' + s.id + '\')">Edit details</button><button class="btn sec" onclick="photoSheet(\'' + s.id + '\')">Photo</button><button class="btn sec" onclick="statementSheet(\'' + s.id + '\')">Statement</button>' + (canFee() ? '<button class="btn sec" onclick="statusSheet(\'' + s.id + '\')">Status &amp; SMS</button>' : '') + '</div></div>' : '<div class="btns"><button class="btn sec" onclick="statementSheet(\'' + s.id + '\')">Statement</button></div>');
};
const stuPaysHTML = L => L.length ? L.slice(0, 60).map(p => recRow(p)).join('') : '<div class="m">No payments recorded yet.</div>';
async function stuHistory(id) {
  const s = stu(id);
  if (!online()) return;
  try { const P = await all(() => sb.from('payments').select('*').eq('student_id', id).order('occurred_at', { ascending: false }).order('id')); const e = $('stu_pays'); if (e) e.innerHTML = stuPaysHTML(P); } catch (e) { }
}

/* ---------- payments page ---------- */
PAGES.payments = function () {
  const pq = D.q.filter(x => !x.k && x.state !== 'done'), q = (SV.pq || '').toLowerCase();
  const L = D.pays.filter(p => !q || String(p.receipt_no || '').toLowerCase().includes(q) || sn(p.student_id).toLowerCase().includes(q) || String(p.method || '').toLowerCase().includes(q));
  let last = '', h = '';
  L.slice(0, SV.pmore || 80).forEach(p => { const d = p.occurred_at.slice(0, 10), lab = d === td() ? 'Today' : d === new Date(Date.now() - 864e5).toISOString().slice(0, 10) ? 'Yesterday' : fd(d); if (lab !== last) { h += '<div class="m b" style="margin:14px 0 2px">' + lab + '</div>'; last = lab; } h += recRow(p); });
  return '<h2 class="ph">Payments</h2><div class="sub">Receipts for the last 4 months</div>' + (canPay() ? '<div class="btns" style="margin:0 0 10px"><button class="btn gold" onclick="paySheet()">＋ Record payment</button><button class="btn sec" onclick="exportPayments()">📤 Export</button></div>' : '') +
    (pq.length ? '<div class="card"><h3>Waiting to sync</h3>' + pq.map(q => rowH('<span class="badge ' + (q.state === 'failed' ? 'bad' : 'warn') + '">' + (q.state === 'failed' ? 'Failed' : 'Pending') + '</span>', '<b>' + E(sn((D.fees.find(f => f.fee_item_id === q.fee) || {}).student_id)) + '</b><span class="m">' + E(q.method) + (q.err ? ' · ' + E(q.err) : ' · saved on this device') + '</span>', fm(q.amt))).join('') + '</div>' : '') +
    '<div class="srch">' + ico('search') + '<input class="in" id="pq" placeholder="Search receipt number or student" value="' + E(SV.pq || '') + '" oninput="SV.pq=this.value;payRefresh()" autocomplete="off"></div><div class="card" style="padding:6px 16px" id="pay_list">' + (h || empty('🧾', 'No payments found.')) + (L.length > (SV.pmore || 80) ? '<div class="btns"><button class="btn sec" onclick="SV.pmore=(SV.pmore||80)+100;draw(true)">Show more</button></div>' : '') + '</div>';
};
const payRefresh = () => { const f = $('pq'); const p = $('pay_list'); if (p) { const keep = f && f.value; draw(true); const n = $('pq'); if (n) { n.focus(); n.setSelectionRange(keep.length, keep.length); } } };

/* ---------- record payment ---------- */
const PS = { sid: '', fid: '', method: 'Cash' };
function paySheet(studentId, feeId) {
  if (!canPay()) return toast('Your role cannot record payments.', 'bad');
  PS.sid = studentId || ''; PS.fid = feeId || ''; PS.method = 'Cash'; const s = stu(studentId);
  sheet('<h2>Record payment</h2><div class="m">Type the student\'s name or ID.</div><label class="l">Student</label>' + combo('ps_s', matchStudents, x => { PS.sid = x.id; PS.fid = ''; payFees(); }, 'Start typing a name or ID…', s.full_name) + '<div id="ps_f"></div>', { after: () => { if (PS.sid) payFees(); else $('ps_s').focus(); } });
}
function payFees() {
  const s = stu(PS.sid), F = (FIDX[PS.sid] || []).filter(f => bal(f) > 0).sort((a, b) => String(a.academic_year).localeCompare(String(b.academic_year)));
  if (!F.length) { $('ps_f').innerHTML = '<div class="card c" style="box-shadow:none">' + (D.fees.some(f => f.student_id === PS.sid) ? '<b class="pos">' + E(s.full_name) + ' has paid everything.</b>' : '<b>' + E(s.full_name) + ' has no fees yet.</b>') + (canFee() ? '<div class="btns" style="justify-content:center"><button class="btn sm" onclick="feeSheet(\'' + PS.sid + '\')">Assign a fee</button></div>' : '') + '</div>'; return; }
  if (!F.find(f => f.fee_item_id === PS.fid)) PS.fid = F[0].fee_item_id;
  $('ps_f').innerHTML = '<div class="card" style="box-shadow:none;margin:12px 0 0;padding:12px"><div class="row" style="padding:0 0 8px">' + avs(s.id, 40) + '<div class="t"><b>' + E(s.full_name) + '</b><span class="m">' + E(s.class_name || '') + ' · owes ' + fm(sbal(s.id)) + '</span></div></div>' + F.map(f => '<button class="fee ' + (f.fee_item_id === PS.fid ? 'on' : '') + '" onclick="PS.fid=\'' + f.fee_item_id + '\';payFees()"><div class="a"><span>' + E(f.category) + '</span><span>' + fm(bal(f)) + '</span></div><div class="m">' + E(f.academic_year) + '</div></button>').join('') + '</div>' +
    '<label class="l" for="ps_a">Amount (GH₵)</label><input class="in" id="ps_a" inputmode="decimal" placeholder="0.00" autocomplete="off"><div class="chips" style="padding-bottom:0"><button class="chip" onclick="payAmt(1)">Full ' + fm(bal(F.find(f => f.fee_item_id === PS.fid))) + '</button><button class="chip" onclick="payAmt(.5)">Half</button></div>' +
    '<label class="l">Paid by</label><div class="pick" id="ps_m">' + ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque'].map(m => '<button class="' + (PS.method === m ? 'on' : '') + '" onclick="PS.method=\'' + m + '\';payMethod()">' + m + '</button>').join('') + '</div>' +
    '<div id="ps_r" class="' + (PS.method === 'Cash' ? 'hide' : '') + '"><label class="l" for="ps_ref">Reference / transaction ID</label><input class="in" id="ps_ref" placeholder="Optional" autocomplete="off"></div><div class="btns"><button class="btn blk" id="ps_go" onclick="payConfirm()">Confirm payment</button></div><div class="m c" style="margin-top:8px">Works offline. It saves on this device and syncs when you are online.</div>';
}
function payAmt(f) { const x = (FIDX[PS.sid] || []).find(y => y.fee_item_id === PS.fid); if (x) $('ps_a').value = (Math.floor(bal(x) * f) / 100).toFixed(2); $('ps_a').focus(); }
function payMethod() { [...$('ps_m').children].forEach(b => b.classList.toggle('on', b.textContent === PS.method)); $('ps_r').classList.toggle('hide', PS.method === 'Cash'); }
async function payConfirm() {
  const a = toP($('ps_a').value), f = D.fees.find(x => x.fee_item_id === PS.fid); if (!f) return toast('Choose a student and a fee.', 'bad');
  if (!a || a <= 0) return toast('Enter a valid amount.', 'bad');
  if (a > bal(f) && !await askYes('More than the balance', 'The balance is ' + fm(bal(f)) + ' but you entered ' + fm(a) + '. Record it anyway?', 'Record anyway')) return;
  const ref = val('ps_ref');
  if (D.q.some(q => !q.k && q.fee === PS.fid && q.amt === a && q.method === PS.method && Date.now() - new Date(q.at) < 600000) && !await askYes('Possible duplicate', 'The same amount and method was recorded for this fee in the last 10 minutes. Record it again?', 'Record again')) return;
  $('ps_go').disabled = true;
  const item = { id: crypto.randomUUID(), fee: PS.fid, amt: a, method: PS.method, ref: ref, at: new Date().toISOString(), state: 'pending' };
  const sName = sn(f.student_id);
  await enqueue(item);
  const cur = D.q.find(q => q.id === item.id), p = cur && cur.state === 'done' && cur.receipt ? D.pays.find(x => x.receipt_no === cur.receipt) : null;
  if (p) { toast('Payment recorded · ' + p.receipt_no, 'ok'); return receiptSheet(p.id); }
  if (cur && cur.state === 'failed') { sheet('<h2>Could not record</h2><p class="neg b">' + E(cur.err) + '</p><div class="btns"><button class="btn sec" onclick="dropFailed(\'' + item.id + '\');closeSheet()">Discard</button><button class="btn" onclick="closeSheet();go(\'sync\')">Review</button></div>'); return; }
  sheet('<div class="c" style="padding:14px 0"><div style="font-size:46px">📥</div><h2 style="padding:0">Saved on this device</h2><p class="m">' + fm(a) + ' for ' + E(sName) + '. It will get its receipt number when you are back online.</p><div class="btns"><button class="btn sec" onclick="closeSheet()">Done</button><button class="btn" onclick="paySheet()">Record another</button></div></div>');
}

/* ---------- receipt ---------- */
function rcCalc(p, hist) {
  const f = D.fees.find(x => x.fee_item_id === p.fee_item_id); if (!f) return null;
  const H = hist || D.pays.filter(x => x.fee_item_id === p.fee_item_id), later = sum(H.filter(x => x.created_at > p.created_at), x => x.amount_minor);
  const after = f.balance_minor + later + 0; return { f, after: Math.max(0, after), before: Math.max(0, after + p.amount_minor) };
}
async function receiptSheet(id) {
  const p = D.pays.find(x => x.id === id); if (!p) return;
  let hist = null; if (online()) { try { hist = await all(() => sb.from('payments').select('*').eq('fee_item_id', p.fee_item_id).order('created_at').order('id')); } catch (e) { } }
  const c = rcCalc(p, hist), s = stu(p.student_id), rev = D.pays.some(x => x.reversal_of === p.id), neg = p.amount_minor < 0;
  const url = location.origin + '/verify/?r=' + encodeURIComponent(p.receipt_no || '');
  const logo = D.school.logo ? sb.storage.from('logos').getPublicUrl(D.school.logo).data.publicUrl : '';
  sheet('<h2>' + (neg ? 'Reversal' : 'Receipt') + '</h2><div class="rc"><div class="h">' + (logo ? '<img alt="" src="' + E(logo) + '">' : '<span class="logo">F</span>') + '<div class="t"><b>' + E(D.school.name) + '</b><div class="m">' + E([D.school.address, D.school.phone].filter(Boolean).join(' · ')) + '</div></div></div>' +
    '<div class="m" style="margin-top:10px">Receipt no.</div><b>' + E(p.receipt_no || '—') + '</b><div class="big">' + fm(Math.abs(p.amount_minor)) + '</div><div class="m" style="font-style:italic">' + E(words(p.amount_minor)) + '</div>' +
    '<div style="margin-top:10px"><div class="kv"><span>Student</span><span>' + E(sn(p.student_id)) + '</span></div><div class="kv"><span>Class</span><span>' + E(s.class_name || '') + '</span></div>' + (c ? '<div class="kv"><span>Fee</span><span>' + E(c.f.category) + ' · ' + E(c.f.academic_year) + '</span></div>' : '') + '<div class="kv"><span>Date</span><span>' + fdt(p.occurred_at) + '</span></div><div class="kv"><span>Paid by</span><span>' + E(p.method) + (p.reference ? ' · ' + E(p.reference) : '') + '</span></div>' + (c ? '<div class="kv"><span>Balance before</span><span>' + fm(c.before) + '</span></div><div class="kv"><span>Balance after</span><span class="b">' + fm(c.after) + '</span></div>' : '') + '</div>' +
    (rev ? '<div class="rv">THIS PAYMENT WAS REVERSED</div>' : '') + '<div class="m" style="margin-top:10px;word-break:break-all">Verify this receipt: ' + E(url) + '</div></div>' +
    '<div class="btns np"><button class="btn" onclick="rcPDF(\'' + p.id + '\')">' + ico('down', 18) + ' Save PDF</button><button class="btn sec" onclick="window.print()">' + ico('print', 18) + ' Print</button></div><div class="btns np" style="margin-top:0"><button class="btn sec" onclick="rcWA(\'' + p.id + '\')">' + ico('chat', 18) + ' WhatsApp</button></div><div class="btns np" style="margin-top:0">' + (canFee() ? '<button class="btn sec" onclick="rcSMS(\'' + p.id + '\')">SMS guardian</button>' : '') + (canFee() && !rev && !neg ? '<button class="btn bad" onclick="rcRev(\'' + p.id + '\')">Reverse payment</button>' : '') + '</div>', { wide: true });
}
function rcWA(id) { const p = D.pays.find(x => x.id === id), c = rcCalc(p), s = stu(p.student_id), n = waNum(s.guardian_phone); const t = 'Receipt ' + p.receipt_no + ' from ' + D.school.name + ': ' + fm(p.amount_minor) + ' received for ' + s.full_name + (c ? '. Balance: ' + fm(c.after) : '') + '. Verify: ' + location.origin + '/verify/?r=' + encodeURIComponent(p.receipt_no); window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(t), '_blank', 'noopener'); }
async function rcSMS(id) { if (!online()) return toast('SMS needs a connection.', 'bad'); const p = D.pays.find(x => x.id === id), c = rcCalc(p); const body = 'Receipt ' + p.receipt_no + ': GHS ' + fmn(p.amount_minor) + ' received for ' + sn(p.student_id) + (c ? '. Balance GHS ' + fmn(c.after) : '') + '. ' + D.school.name; const r = await sb.rpc('queue_sms', { p_school: sid(), p_student: p.student_id, p_kind: 'receipt', p_body: body, p_key: 'rcpt:' + p.id }); toast(r.error ? friendly(r.error) : (r.data ? 'SMS queued. The server will send it.' : 'Not queued: no guardian phone, opted out, or already queued.'), r.error ? 'bad' : 'ok'); }
async function rcRev(id) {
  if (!online()) return toast('Reversal needs a connection.', 'bad');
  const why = await askText('Reverse this payment', 'Reason (required). The original receipt is kept.', 'Reverse'); if (!why || !why.trim()) return;
  const r = await sb.rpc('reverse_payment', { p_id: id, p_reverse_id: crypto.randomUUID(), p_reason: why.trim() }); if (r.error) return toast(friendly(r.error), 'bad');
  toast('Reversal recorded. The original is kept.', 'ok'); closeSheet(true); await pull(); draw(true);
}

/* ---------- search + account ---------- */
function searchSheet() {
  sheet('<h2>Search</h2><div class="srch" style="margin-top:10px">' + ico('search') + '<input class="in" id="gs" placeholder="Student name, ID, guardian or receipt no." oninput="gsRun()" autocomplete="off"></div><div id="gs_r" style="margin-top:8px"></div>', { after: () => { $('gs').focus(); gsRun(); } });
}
function gsRun() {
  const q = $('gs').value.trim().toLowerCase(); let h = '';
  if (q) {
    const S = D.students.filter(s => [s.full_name, s.student_no, s.guardian_name, s.guardian_phone].some(v => String(v || '').toLowerCase().includes(q))).slice(0, 25);
    h += S.map(s => rowH(avs(s.id, 40), '<b>' + E(s.full_name) + '</b><span class="m">' + E(s.class_name || '') + (s.student_no ? ' · ' + E(s.student_no) : '') + '</span>', sbal(s.id) > 0 ? '<span class="neg">' + fm(sbal(s.id)) + '</span>' : '<span class="badge ok">Paid up</span>', 'closeSheet(true);go(\'student/' + s.id + '\')')).join('');
    h += D.pays.filter(p => p.receipt_no && p.receipt_no.toLowerCase().includes(q)).slice(0, 6).map(p => recRow(p)).join('');
  } else h = '<div class="m">Recent students</div>' + D.students.slice(0, 0).join('');
  $('gs_r').innerHTML = h || (q ? empty('🔎', 'Nothing found.') : '');
}
function profileSheet() {
  const np = D.q.filter(x => x.state !== 'done').length;
  sheet('<div class="c" style="padding-top:6px">' + avatar((U && U.email) || D.school.name, 64) + '<h2 style="padding:0;margin-top:8px">' + E((U && U.email) || 'Signed in') + '</h2><div class="m">' + E(ROLES[role()] || role()) + ' · ' + E(D.school.name) + '</div></div><div class="btns"><button class="btn sec" onclick="closeSheet(true);go(\'sync\')">' + (np ? np + ' to sync' : 'Sync & status') + '</button>' + (isAd() ? '<button class="btn sec" onclick="closeSheet(true);go(\'settings\')">School settings</button>' : '') + '<button class="btn bad" onclick="signOut()">Sign out</button></div>');
}
PAGES.more = function () { return '<h2 class="ph">More</h2><div class="sub">Everything else in FeePilot</div><div class="card" style="padding:6px 16px">' + MORE_PAGES().map(x => rowH('<span style="font-size:22px">' + x[2] + '</span>', '<b>' + x[1] + '</b>', ico('chev', 18), 'go(\'' + x[0] + '\')')).join('') + '</div><div class="btns"><button class="btn bad" onclick="signOut()">Sign out</button></div>'; };

/* Receipt PDF built in the browser with no library (works offline, on any phone). Plain ASCII, one A5 page. */
function miniPDF(rows, boxes) {
  const A = t => String(t == null ? '' : t).replace(/GH₵\s?/g, 'GHS ').replace(/₵/g, 'GHS ').replace(/[·•]/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/([\\()])/g, '\\$1');
  let c = '0.8 w 0.6 G\n';
  boxes.forEach(b => { c += b[0] + ' ' + b[1] + ' ' + b[2] + ' ' + b[3] + ' re S\n'; });
  c += '0 G\n';
  rows.forEach(r => { c += 'BT /' + (r.b ? 'F2' : 'F1') + ' ' + (r.s || 10) + ' Tf ' + (r.g ? r.g + ' g ' : '0 g ') + r.x + ' ' + r.y + ' Td (' + A(r.t) + ') Tj ET\n'; });
  const o = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + c.length + ' >>\nstream\n' + c + 'endstream'];
  let out = '%PDF-1.4\n', off = [];
  o.forEach((b, i) => { off.push(out.length); out += (i + 1) + ' 0 obj\n' + b + '\nendobj\n'; });
  const x = out.length; out += 'xref\n0 ' + (o.length + 1) + '\n0000000000 65535 f \n';
  off.forEach(f => { out += String(f).padStart(10, '0') + ' 00000 n \n'; });
  out += 'trailer\n<< /Size ' + (o.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
  const u = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255;
  return new Blob([u], { type: 'application/pdf' });
}
async function rcPDF(id) {
  const p = D.pays.find(x => x.id === id); if (!p) return;
  let hist = null; if (online()) { try { hist = await all(() => sb.from('payments').select('*').eq('fee_item_id', p.fee_item_id).order('created_at').order('id')); } catch (e) { } }
  const c = rcCalc(p, hist), s = stu(p.student_id), rev = D.pays.some(x => x.reversal_of === p.id), neg = p.amount_minor < 0;
  const url = location.origin + '/verify/?r=' + (p.receipt_no || '');
  const R = [], L = 40; let y = 540;
  R.push({ t: D.school.name, x: L, y, s: 16, b: 1 }); y -= 16;
  const ad = [D.school.address, D.school.phone].filter(Boolean).join(' - '); if (ad) { R.push({ t: ad, x: L, y, s: 9, g: 0.4 }); y -= 14; }
  y -= 14; R.push({ t: neg ? 'REVERSAL' : 'PAYMENT RECEIPT', x: L, y, s: 9, g: 0.4 }); y -= 18;
  R.push({ t: p.receipt_no || '', x: L, y, s: 14, b: 1 }); y -= 38;
  R.push({ t: fm(Math.abs(p.amount_minor)), x: L, y, s: 28, b: 1 }); y -= 18;
  R.push({ t: words(p.amount_minor), x: L, y, s: 9, g: 0.4 }); y -= 34;
  const kv = [['Student', sn(p.student_id)], ['Class', s.class_name || ''], ['Fee', c ? c.f.category + ' - ' + c.f.academic_year : ''], ['Date', fdt(p.occurred_at)], ['Paid by', p.method + (p.reference ? ' - ' + p.reference : '')]];
  if (c) { kv.push(['Balance before', fm(c.before)]); kv.push(['Balance after', fm(c.after)]); }
  kv.forEach(k => { if (k[1] === '') return; R.push({ t: k[0], x: L, y, s: 10, g: 0.4 }); R.push({ t: k[1], x: 150, y, s: 10, b: k[0] === 'Balance after' }); y -= 22; });
  if (rev) { y -= 8; R.push({ t: 'THIS PAYMENT WAS REVERSED', x: L, y, s: 11, b: 1 }); y -= 20; }
  y -= 10; R.push({ t: 'Verify this receipt online:', x: L, y, s: 9, g: 0.4 }); y -= 13; R.push({ t: url, x: L, y, s: 9 });
  R.push({ t: 'Issued with FeePilot', x: L, y: 60, s: 8, g: 0.5 });
  const blob = miniPDF(R, [[28, 40, 364, 530]]), name = 'receipt-' + (p.receipt_no || id) + '.pdf';
  /* phones and tablets: open the share sheet (Save to Files/Drive, WhatsApp, Print...) - this works where plain downloads silently fail */
  try {
    const f = new File([blob], name, { type: 'application/pdf' });
    if (/Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f], title: name }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
  } catch (e) { }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 120000);
  toast('Receipt PDF is downloading. Check your Downloads folder.');
}

/* ===== FeePilot pages 2: students & fees management, expenses, accounts, budgets, suppliers, years ===== */
const need = () => { if (online()) return true; toast('This needs an internet connection.', 'bad'); return false; };
async function saved(r, ok, keepOpen) { if (r.error) { toast(friendly(r.error), 'bad'); return false; } toast(ok, 'ok'); if (!keepOpen) closeSheet(true); await pull(); draw(true); return true; }
const lj = urls => new Promise((res, rej) => { urls = [].concat(urls); const t = i => { if (i >= urls.length) return rej(new Error('Could not load the export tool. It needs an internet connection.')); const s = document.createElement('script'); s.src = urls[i]; s.onload = res; s.onerror = () => { s.remove(); t(i + 1); }; document.head.appendChild(s); }; t(0); });
const XLSX_URLS = ['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'];
const clsList = id => '<datalist id="' + id + '">' + classes().map(c => '<option value="' + E(c) + '">').join('') + '</datalist>';
const curYear = () => { const o = (D.yrs || []).find(y => y.status === 'open'); if (o) return o.name; const d = new Date(), y = d.getUTCFullYear(); return d.getUTCMonth() >= 8 ? y + '/' + (y + 1) : (y - 1) + '/' + y; };
const yrList = id => '<datalist id="' + id + '">' + (D.yrs || []).map(y => '<option value="' + E(y.name) + '">').join('') + '</datalist>';

/* ---------- add / edit student ---------- */
function studentSheet(id) {
  if (!canPay()) return toast('Your role cannot add students.', 'bad'); const s = id ? stu(id) : {};
  sheet('<h2>' + (id ? 'Edit student' : 'Add student') + '</h2>' + field('sn_no', 'Student ID', 'e.g. 2026-014', 'value="' + E(s.student_no || '') + '" ' + (id ? '' : '')) + field('sn_nm', 'Full name', 'Surname and other names', 'value="' + E(s.full_name || '') + '"') + '<div class="grid2"><div><label class="l" for="sn_cl">Class</label><input class="in" id="sn_cl" list="cls_dl" placeholder="e.g. Basic 4A" value="' + E(s.class_name || '') + '">' + clsList('cls_dl') + '</div><div><label class="l" for="sn_g">Gender</label><select class="in" id="sn_g">' + opts([['', '—'], ['female', 'Female'], ['male', 'Male']], s.gender || '') + '</select></div></div>' + field('sn_dob', 'Date of birth (optional)', '', 'type="date" value="' + E(s.dob || '') + '"') + '<div class="grid2"><div>' + field('sn_gn', 'Guardian name', '', 'value="' + E(s.guardian_name || '') + '"') + '</div><div>' + field('sn_gp', 'Guardian phone', '024 000 0000', 'inputmode="tel" value="' + E(s.guardian_phone || '') + '"') + '</div></div><label class="l">Student photo (optional)</label><div style="display:flex;gap:12px;align-items:center;margin:4px 0 8px"><span id="sn_pv">' + (id ? avs(id, 64) : avatar('?', 64)) + '</span><input class="in" id="sn_ph" type="file" accept="image/*" onchange="pvPhoto(this)"></div><div class="btns"><button class="btn blk" onclick="studentSave(\'' + (id || '') + '\')">' + (id ? 'Save changes' : 'Add student') + '</button></div>', { after: () => $(id ? 'sn_nm' : 'sn_no').focus() });
}
function pvPhoto(i) { const f = i.files[0]; if (f && $('sn_pv')) { const u = URL.createObjectURL(f); $('sn_pv').innerHTML = '<span class="av" style="width:64px;height:64px"><img alt="" src="' + u + '"></span>'; } }
async function studentSave(id) {
  if (!need()) return; const row = { student_no: val('sn_no'), full_name: val('sn_nm'), class_name: val('sn_cl'), gender: $('sn_g').value || null, dob: $('sn_dob').value || null, guardian_name: val('sn_gn') || null, guardian_phone: val('sn_gp') || null };
  if (!row.student_no || !row.full_name || !row.class_name) return toast('Student ID, name and class are required.', 'bad');
  if (!id && D.students.some(s => String(s.student_no).toLowerCase() === row.student_no.toLowerCase())) return toast('That student ID is already used.', 'bad');
  const nid = id || crypto.randomUUID(), pf = $('sn_ph') && $('sn_ph').files[0];
  if (pf) { if (!online()) return toast('Photos need a connection. Save without the photo, or reconnect.', 'bad'); try { const b = await resizeImg(pf, 640, 'image/jpeg'), pth = sid() + '/' + nid + '-' + Date.now() + '.jpg', up = await sb.storage.from('photos').upload(pth, b, { contentType: 'image/jpeg' }); if (up.error) return toast('Photo upload failed: ' + friendly(up.error), 'bad'); row.photo_path = pth; } catch (e) { return toast(e.message, 'bad'); } }
  const r = id ? await sb.from('students').update(row).eq('id', id) : await sb.from('students').insert(Object.assign({ id: nid, school_id: sid() }, row));
  await saved(r, id ? 'Student updated.' : row.full_name + ' added.');
}

/* ---------- assign fees (one student or a whole class) ---------- */
const FEECATS = ['Tuition', 'Admission', 'PTA levy', 'Feeding', 'Transport', 'Books', 'Uniform', 'Exams', 'ICT', 'Sports', 'Other'];
const FS = { mode: 'one', sid: '' };
function feeSheet(studentId) {
  if (!canFee()) return toast('Your role cannot assign fees.', 'bad'); FS.mode = studentId ? 'one' : (D.students.length > 1 ? 'class' : 'one'); FS.sid = studentId || ''; const s = stu(studentId);
  sheet('<h2>Assign fees</h2><div class="m">Add a fee to one student, or to a whole class at once.</div><div style="margin:12px 0"><div class="seg" id="fs_m"><button class="' + (FS.mode === 'one' ? 'on' : '') + '" onclick="feeMode(\'one\')">One student</button><button class="' + (FS.mode === 'class' ? 'on' : '') + '" onclick="feeMode(\'class\')">Whole class</button></div></div>' +
    '<div id="fs_one" class="' + (FS.mode === 'one' ? '' : 'hide') + '"><label class="l">Student</label>' + combo('fs_s', matchStudents, x => { FS.sid = x.id; feePrev(); }, 'Start typing a name or ID…', s.full_name) + '</div>' +
    '<div id="fs_cls" class="' + (FS.mode === 'class' ? '' : 'hide') + '"><label class="l" for="fs_c">Class</label><select class="in" id="fs_c" onchange="feePrev()"><option value="">All classes</option>' + classes().map(c => '<option>' + E(c) + '</option>').join('') + '</select></div>' +
    '<label class="l" for="fs_k">Fee</label><select class="in" id="fs_k" onchange="$(\'fs_ko\').classList.toggle(\'hide\',this.value!==\'Other\');feePrev()">' + FEECATS.map(c => '<option>' + c + '</option>').join('') + '</select><input class="in hide" id="fs_ko" placeholder="Name of the fee" style="margin-top:8px">' +
    '<div class="grid2"><div><label class="l" for="fs_y">Academic year</label><input class="in" id="fs_y" list="yr_dl" value="' + E(curYear()) + '" oninput="feePrev()">' + yrList('yr_dl') + '</div><div><label class="l" for="fs_a">Amount (GH₵)</label><input class="in" id="fs_a" inputmode="decimal" placeholder="0.00" oninput="feePrev()"></div></div><div class="ins" id="fs_p" style="margin-top:14px">Choose who this fee is for.</div><div class="btns"><button class="btn blk" id="fs_go" onclick="feeSave()">Assign fee</button></div>', { after: feePrev });
}
function feeMode(m) { FS.mode = m; [...$('fs_m').children].forEach(b => b.classList.toggle('on', (b.textContent === 'One student') === (m === 'one'))); $('fs_one').classList.toggle('hide', m !== 'one'); $('fs_cls').classList.toggle('hide', m !== 'class'); feePrev(); }
function feeTargets() { const cat = $('fs_k').value === 'Other' ? val('fs_ko') : $('fs_k').value, yr = val('fs_y'); let T = FS.mode === 'one' ? (FS.sid ? [stu(FS.sid)] : []) : D.students.filter(s => (!s.status || s.status === 'active') && (!$('fs_c').value || s.class_name === $('fs_c').value)); T = T.filter(s => s.id); const dup = T.filter(s => (FIDX[s.id] || []).some(f => f.category === cat && f.academic_year === yr)); return { T, dup, cat, yr, add: T.filter(s => !dup.includes(s)) }; }
function feePrev() { const e = $('fs_p'); if (!e) return; const t = feeTargets(), a = toP($('fs_a').value); e.innerHTML = !t.T.length ? 'Choose who this fee is for.' : '<b>' + t.add.length + '</b> student' + (t.add.length === 1 ? '' : 's') + ' will get <b>' + E(t.cat || 'this fee') + '</b> for ' + E(t.yr || '…') + (a ? ' at <b>' + fm(a) + '</b> each, <b>' + fm(a * t.add.length) + '</b> in total' : '') + '.' + (t.dup.length ? '<div class="m" style="margin-top:4px">' + t.dup.length + ' already ha' + (t.dup.length === 1 ? 's' : 've') + ' this fee and will be skipped.</div>' : ''); }
async function feeSave() {
  if (!need()) return; const t = feeTargets(), a = toP($('fs_a').value);
  if (!t.cat) return toast('Enter the name of the fee.', 'bad'); if (!t.yr) return toast('Enter the academic year.', 'bad'); if (!a || a <= 0) return toast('Enter a valid amount.', 'bad'); if (!t.add.length) return toast(t.T.length ? 'Everyone selected already has this fee.' : 'Choose who this fee is for.', 'bad');
  if (t.add.length > 1 && !await askYes('Assign to ' + t.add.length + ' students?', t.cat + ' · ' + t.yr + ' · ' + fm(a) + ' each (' + fm(a * t.add.length) + ' in total).', 'Assign')) return;
  $('fs_go').disabled = true; const rows = t.add.map(s => ({ school_id: sid(), student_id: s.id, category: t.cat, academic_year: t.yr, amount_minor: a }));
  for (let i = 0; i < rows.length; i += 200) { const r = await sb.from('fee_items').insert(rows.slice(i, i + 200)); if (r.error) { $('fs_go').disabled = false; await pull(); return toast(friendly(r.error) + (i ? ' (' + i + ' were added before the error.)' : ''), 'bad'); } }
  await saved({}, t.cat + ' assigned to ' + rows.length + ' student' + (rows.length > 1 ? 's' : '') + '.');
}

/* ---------- import students ---------- */
const IMPMAP = { student_no: ['student_no', 'student_id', 'id', 'studentno', 'admission_no', 'admission_number', 'index_number'], full_name: ['full_name', 'name', 'student_name', 'fullname', 'student'], class_name: ['class_name', 'class', 'grade', 'form', 'level'], guardian_name: ['guardian_name', 'guardian', 'parent', 'parent_name'], guardian_phone: ['guardian_phone', 'phone', 'parent_phone', 'guardian_contact', 'contact', 'telephone'], gender: ['gender', 'sex'], dob: ['dob', 'date_of_birth', 'birth_date', 'birthday'] };
function parseCSV(t) { const R = []; let r = [], c = '', q = false; t = t.replace(/^﻿/, ''); for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); c = ''; if (r.some(x => x !== '')) R.push(r); r = []; } else c += ch; } r.push(c); if (r.some(x => x !== '')) R.push(r); return R; }
let IMP = null;
function importSheet() {
  if (!canPay()) return toast('Your role cannot import students.', 'bad'); IMP = null;
  sheet('<h2>Import students</h2><div class="m">Upload a CSV or Excel file with one student per row.</div><div class="ins" style="margin-top:10px">Columns: <b>student_no</b>, <b>full_name</b>, <b>class_name</b> are required. Optional: guardian_name, guardian_phone, gender, dob (YYYY-MM-DD).</div><div class="btns" style="margin-top:8px"><button class="btn sec sm" onclick="impTemplate()">' + ico('down', 16) + ' Download template</button></div><label class="l" for="im_f">File</label><input class="in" id="im_f" type="file" accept=".csv,.xlsx,.xls" onchange="impRead()"><div id="im_p"></div>');
}
function impTemplate() { const b = new Blob(['student_no,full_name,class_name,guardian_name,guardian_phone,gender,dob\n2026-001,Ama Mensah,Basic 4A,Kofi Mensah,0241234567,female,2016-05-14\n2026-002,Yaw Boateng,Basic 4A,Abena Boateng,0201234567,male,2015-11-02\n'], { type: 'text/csv' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'feepilot-students-template.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
async function impRead() {
  const fl = $('im_f').files[0]; if (!fl) return; const p = $('im_p'); p.innerHTML = '<div class="m" style="margin-top:10px">Reading…</div>'; let rows;
  try { if (/\.csv$/i.test(fl.name)) rows = parseCSV(await fl.text()); else { await lj(XLSX_URLS); const wb = XLSX.read(await fl.arrayBuffer(), { cellDates: false }); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }); } } catch (e) { p.innerHTML = '<div class="err">' + E(e.message || 'Could not read that file.') + '</div>'; return; }
  if (!rows.length) { p.innerHTML = '<div class="err">The file is empty.</div>'; return; }
  const H = rows[0].map(h => String(h).trim().toLowerCase().replace(/[\s-]+/g, '_')), col = {}; Object.keys(IMPMAP).forEach(k => { col[k] = H.findIndex(h => IMPMAP[k].includes(h)); });
  if (col.student_no < 0 || col.full_name < 0 || col.class_name < 0) { p.innerHTML = '<div class="err">Could not find the required columns (student_no, full_name, class_name) in the first row.</div>'; return; }
  const ex = new Set(D.students.map(s => String(s.student_no).toLowerCase())), seen = new Set(), ok = [], bad = [], dup = []; const g = (r, k) => col[k] < 0 ? '' : String(r[col[k]] == null ? '' : r[col[k]]).trim();
  rows.slice(1).forEach((r, i) => { if (!r.some(x => String(x).trim() !== '')) return; const n = g(r, 'student_no'), nm = g(r, 'full_name'), c = g(r, 'class_name'); if (!n || !nm || !c) { bad.push(i + 2); return; } if (ex.has(n.toLowerCase()) || seen.has(n.toLowerCase())) { dup.push(n); return; } seen.add(n.toLowerCase()); const gd = g(r, 'gender').toLowerCase(); ok.push({ school_id: sid(), student_no: n, full_name: nm, class_name: c, gender: /^f/.test(gd) ? 'female' : /^m/.test(gd) ? 'male' : null, dob: /^\d{4}-\d{2}-\d{2}$/.test(g(r, 'dob')) ? g(r, 'dob') : null, guardian_name: g(r, 'guardian_name') || null, guardian_phone: g(r, 'guardian_phone') || null }); });
  IMP = ok;
  p.innerHTML = '<div class="card" style="box-shadow:none;margin-top:12px"><div class="row"><div class="t"><b class="pos">' + ok.length + ' ready to import</b></div></div>' + (dup.length ? '<div class="row"><div class="t m">' + dup.length + ' skipped: student ID already exists</div></div>' : '') + (bad.length ? '<div class="row"><div class="t m neg">' + bad.length + ' skipped: missing ID, name or class (rows ' + bad.slice(0, 8).join(', ') + (bad.length > 8 ? '…' : '') + ')</div></div>' : '') + ok.slice(0, 4).map(s => '<div class="row"><div class="t"><b>' + E(s.full_name) + '</b><span class="m">' + E(s.class_name) + ' · ' + E(s.student_no) + '</span></div></div>').join('') + (ok.length > 4 ? '<div class="m">…and ' + (ok.length - 4) + ' more</div>' : '') + '</div>' + (ok.length ? '<div class="btns"><button class="btn blk" id="im_go" onclick="impGo()">Import ' + ok.length + ' student' + (ok.length > 1 ? 's' : '') + '</button></div>' : '');
}
async function impGo() {
  if (!need() || !IMP || !IMP.length) return; $('im_go').disabled = true; $('im_go').textContent = 'Importing…';
  for (let i = 0; i < IMP.length; i += 200) { const r = await sb.from('students').upsert(IMP.slice(i, i + 200), { onConflict: 'school_id,student_no', ignoreDuplicates: true }); if (r.error) { await pull(); draw(true); return toast(friendly(r.error) + ' (' + i + ' imported before the error)', 'bad'); } }
  const n = IMP.length; IMP = null; await saved({}, n + ' students imported.');
}

/* ---------- promote / status / photo / statement / reminder ---------- */
function promoSheet() {
  if (!canFee()) return; sheet('<h2>Promote a class</h2><div class="m">Moves every active student from one class to another, e.g. at the start of a new year.</div><label class="l" for="pr_f">From class</label><select class="in" id="pr_f" onchange="promoPrev()">' + classes().map(c => '<option>' + E(c) + '</option>').join('') + '</select><label class="l" for="pr_t">To class</label><input class="in" id="pr_t" list="cls_dl" placeholder="e.g. Basic 5A" oninput="promoPrev()">' + clsList('cls_dl') + '<div class="ins" id="pr_p" style="margin-top:12px">Choose both classes.</div><div class="btns"><button class="btn blk" onclick="promoGo()">Promote</button></div>', { after: promoPrev });
}
const promoPrev = () => { const f = $('pr_f').value, n = D.students.filter(s => s.class_name === f && (!s.status || s.status === 'active')).length; $('pr_p').innerHTML = '<b>' + n + '</b> active student' + (n === 1 ? '' : 's') + ' in ' + E(f) + ' will move to <b>' + E(val('pr_t') || '…') + '</b>.'; };
async function promoGo() { if (!need()) return; const f = $('pr_f').value, t = val('pr_t'); if (!f || !t) return toast('Choose both classes.', 'bad'); if (f === t) return toast('Choose a different class.', 'bad'); if (!await askYes('Promote ' + f + ' to ' + t + '?', 'All active students in ' + f + ' will move to ' + t + '.', 'Promote')) return; await saved(await sb.from('students').update({ class_name: t }).eq('school_id', sid()).eq('class_name', f).eq('status', 'active'), 'Class promoted.'); }
function statusSheet(id) {
  const s = stu(id); sheet('<h2>' + E(s.full_name) + '</h2><label class="l" for="st_s">Status</label><select class="in" id="st_s">' + opts([['active', 'Active'], ['graduated', 'Graduated'], ['withdrawn', 'Withdrawn'], ['transferred', 'Transferred']], s.status || 'active') + '</select><label class="l" style="display:flex;gap:10px;align-items:center;margin-top:16px"><input type="checkbox" id="st_o" ' + (s.sms_opt_out ? 'checked' : '') + ' style="width:20px;height:20px"> Do not send SMS to this guardian</label><div class="btns"><button class="btn blk" onclick="statusSave(\'' + id + '\')">Save</button></div>');
}
async function statusSave(id) { if (!need()) return; await saved(await sb.from('students').update({ status: $('st_s').value, sms_opt_out: $('st_o').checked }).eq('id', id), 'Student updated.'); }
function resizeImg(file, max, type) { return new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(b => b ? res(b) : rej(new Error('Could not process the image.')), type, .85); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('That file is not a usable image.')); }; im.src = u; }); }
function photoSheet(id) { const s = stu(id); sheet('<h2>Photo · ' + E(s.full_name) + '</h2><div class="m">Take a picture or choose one. It is resized automatically.</div><label class="l" for="ph_f">Photo</label><input class="in" id="ph_f" type="file" accept="image/*"><div class="btns"><button class="btn blk" onclick="photoSave(\'' + id + '\')">Save photo</button></div>'); }
async function photoSave(id) { if (!need()) return; const f = $('ph_f').files[0]; if (!f) return toast('Choose a photo first.', 'bad'); try { const b = await resizeImg(f, 640, 'image/jpeg'), p = sid() + '/' + id + '-' + Date.now() + '.jpg', u = await sb.storage.from('photos').upload(p, b, { contentType: 'image/jpeg' }); if (u.error) return toast('Upload failed: ' + friendly(u.error), 'bad'); await saved(await sb.from('students').update({ photo_path: p }).eq('id', id), 'Photo saved.'); } catch (e) { toast(e.message, 'bad'); } }
async function statementSheet(id) {
  const s = stu(id); let P = D.pays.filter(p => p.student_id === id).slice().reverse(); if (online()) { try { P = await all(() => sb.from('payments').select('*').eq('student_id', id).order('occurred_at').order('id')); } catch (e) { } }
  const F = FIDX[id] || [], nm = {}; F.forEach(f => nm[f.fee_item_id] = f.category);
  const rows = F.map(f => ['<tr><td>' + E(f.academic_year) + '</td><td>' + E(f.category) + (f.carried_to ? ' (carried to ' + E(f.carried_to) + ')' : '') + '</td><td class="num">' + fmn(f.amount_minor) + '</td><td class="num"></td></tr>']).concat(P.map(p => ['<tr><td>' + fd(p.occurred_at) + '</td><td>' + E(p.receipt_no || 'Reversal') + ' · ' + E(nm[p.fee_item_id] || '') + ' (' + E(p.method) + ')</td><td class="num"></td><td class="num">' + fmn(p.amount_minor) + '</td></tr>']));
  sheet('<h2>Statement</h2><div class="b">' + E(s.full_name) + '</div><div class="m">' + E(s.class_name || '') + ' · ' + E(D.school.name) + ' · ' + fd(td()) + '</div><div class="tw" style="margin-top:10px"><table class="t"><tr><th>When</th><th>Description</th><th class="num">Charge</th><th class="num">Paid</th></tr>' + rows.join('') + '<tr class="tot"><td colspan="2">Balance</td><td class="num" colspan="2">' + fm(F.reduce((t, f) => t + f.balance_minor, 0)) + '</td></tr></table></div><div class="btns np"><button class="btn" onclick="window.print()">' + ico('print', 18) + ' Print / PDF</button></div>', { wide: true });
}
async function remindOne(id) { if (!need()) return; const s = stu(id), r = await sb.rpc('queue_reminders', { p_school: sid(), p_students: [id], p_template: DEFT, p_when: null }); toast(r.error ? friendly(r.error) : (r.data ? 'Reminder queued for ' + s.full_name + '.' : 'Not queued: no phone, opted out, or already reminded today.'), r.error ? 'bad' : 'ok'); }

/* ---------- expenses ---------- */
const CATS = ['Salaries', 'Electricity', 'Water', 'Internet', 'Stationery', 'Maintenance', 'Transport', 'Food supplies', 'Cleaning', 'Security', 'Equipment', 'Other'];
const METHODS = ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque'];
const accN = id => (D.acc.find(a => a.id === id) || {}).name || '?', accO = () => D.acc.map(a => [a.id, a.name]);
PAGES.expenses = function () {
  const X = D.exp, m = td().slice(0, 7), tm = sum(X.filter(x => x.status === 'approved' && String(x.paid_on).slice(0, 7) === m), x => x.amount_minor), pend = X.filter(x => x.status === 'pending');
  return '<h2 class="ph">Expenses</h2><div class="sub">Approved expenses this month: <b>' + fm(tm) + '</b></div>' + (canPay() ? '<div class="btns" style="margin:0 0 6px"><button class="btn gold" onclick="expenseSheet()">＋ Record expense</button></div>' : '') +
    (D.q.some(q => q.k === 'x' && q.state !== 'done') ? '<div class="sync">' + D.q.filter(q => q.k === 'x' && q.state !== 'done').length + ' expense(s) saved on this device, waiting to sync.</div>' : '') +
    (canFee() && pend.length ? '<div class="card"><h3>Waiting for approval <span class="badge warn">' + pend.length + '</span></h3>' + pend.map(x => '<div class="row"><div class="t"><b>' + E(x.description) + '</b><span class="m">' + E(x.category) + ' · ' + fd(x.paid_on) + ' · ' + E(x.recipient || '') + '</span><div class="btns" style="margin-top:6px"><button class="btn sm" onclick="expAppr(\'' + x.id + '\',true)">Approve</button><button class="btn bad sm" onclick="expAppr(\'' + x.id + '\',false)">Reject</button></div></div><div class="v">' + fm(x.amount_minor) + '</div></div>').join('') + '</div>' : '') +
    '<div class="card"><h3>All expenses</h3>' + (X.length ? X.map(x => rowH('<span style="font-size:20px">' + ({ Salaries: '👩‍🏫', Electricity: '💡', Water: '💧', Internet: '📶', Stationery: '✏️', Maintenance: '🛠️', Transport: '🚌', 'Food supplies': '🍲', Cleaning: '🧹', Security: '🛡️', Equipment: '🖥️' }[x.category] || '🧾') + '</span>', '<b>' + E(x.description) + '</b><span class="m">' + E(x.category) + ' · ' + fd(x.paid_on) + (x.recipient ? ' · ' + E(x.recipient) : '') + '</span>', fm(x.amount_minor) + '<div><span class="badge ' + (x.status === 'approved' ? 'ok' : x.status === 'rejected' ? 'bad' : 'warn') + '">' + E(x.status) + '</span></div>')).join('') : empty('🧾', 'No expenses recorded yet.')) + '</div>';
};
function expenseSheet() {
  if (!canPay()) return; if (!D.acc.length) return sheet('<h2>Add an account first</h2><p class="m">Expenses are paid from an account such as Cash, Petty cash or a bank account.</p><div class="btns"><button class="btn" onclick="closeSheet(true);go(\'accounts\')">Go to Accounts</button></div>');
  sheet('<h2>Record expense</h2>' + field('ex_d', 'What was it for?', 'e.g. Electricity bill for October') + '<div class="grid2"><div><label class="l" for="ex_k">Category</label><select class="in" id="ex_k">' + CATS.map(c => '<option>' + c + '</option>').join('') + '</select></div><div><label class="l" for="ex_a">Amount (GH₵)</label><input class="in" id="ex_a" inputmode="decimal" placeholder="0.00"></div></div><div class="grid2"><div>' + field('ex_p', 'Date', '', 'type="date" value="' + td() + '"') + '</div><div><label class="l" for="ex_m">Paid by</label><select class="in" id="ex_m">' + METHODS.map(c => '<option>' + c + '</option>').join('') + '</select></div></div><label class="l" for="ex_c">Paid from account</label><select class="in" id="ex_c">' + opts(accO()) + '</select><div class="grid2"><div>' + field('ex_r', 'Recipient', 'Optional') + '</div><div>' + field('ex_f', 'Reference', 'Optional') + '</div></div><label class="l" for="ex_y">Academic year</label><input class="in" id="ex_y" list="yr_dl" value="' + E(curYear()) + '">' + yrList('yr_dl') + '<label class="l" for="ex_z">Receipt photo (optional, needs internet)</label><input class="in" id="ex_z" type="file" accept="image/*,application/pdf"><div class="btns"><button class="btn blk" id="ex_go" onclick="expenseSave()">Save expense</button></div><div class="m c" style="margin-top:8px">Needs approval by an accountant, administrator or proprietor before it counts.</div>');
}
async function expenseSave() {
  const a = toP($('ex_a').value), ds = val('ex_d'); if (!ds) return toast('Describe the expense.', 'bad'); if (!a || a <= 0) return toast('Enter a valid amount.', 'bad');
  $('ex_go').disabled = true; const id = crypto.randomUUID(), row = { id, school_id: sid(), account_id: $('ex_c').value, category: $('ex_k').value, description: ds, amount_minor: a, paid_on: $('ex_p').value || td(), method: $('ex_m').value, recipient: val('ex_r') || null, reference: val('ex_f') || null, academic_year: val('ex_y') || 'unspecified', status: 'pending' };
  const fl = $('ex_z').files[0];
  if (fl) { if (!online() || fl.size > 8 * 1048576) { $('ex_go').disabled = false; return toast(!online() ? 'Attachments need an internet connection.' : 'The file is too large (max 8 MB).', 'bad'); } try { let blob = fl, nm = fl.name; if (/^image\//.test(fl.type)) { blob = await resizeImg(fl, 1400, 'image/jpeg'); nm = nm.replace(/\.\w+$/, '') + '.jpg'; } const p = sid() + '/' + id + '-' + nm.replace(/[^\w.-]/g, '_'), u = await sb.storage.from('attachments').upload(p, blob); if (u.error) { $('ex_go').disabled = false; return toast('Upload failed: ' + friendly(u.error), 'bad'); } row.attachment_path = p; } catch (e) { $('ex_go').disabled = false; return toast(e.message, 'bad'); } }
  closeSheet(true); await enqueue({ k: 'x', id, row, amt: a, method: row.method, at: new Date().toISOString(), state: 'pending' }); toast(online() ? 'Expense recorded. Waiting for approval.' : 'Saved on this device. It will sync when you are online.', 'ok');
}
async function expAppr(id, ok) { if (!need()) return; await saved(await sb.rpc('approve_expense', { p_id: id, p_approve: ok }), ok ? 'Expense approved.' : 'Expense rejected.', true); }

/* ---------- accounts & cashbook ---------- */
let CA = '';
const ACCT = { cash: 'Cash', petty_cash: 'Petty cash', bank: 'Bank', momo: 'Mobile Money' };
PAGES.accounts = function () {
  const ca = D.acc.find(a => a.id === CA) ? CA : (D.acc[0] || {}).id, unm = [...new Set(D.pays.map(p => p.method))].filter(m => !D.ma.some(x => x.method === m));
  const tot = sum(D.acc, a => { const b = D.accb.find(x => x.account_id === a.id); return b ? b.balance_minor : a.opening_minor; });
  return '<h2 class="ph">Accounts &amp; cashbook</h2><div class="sub">Total across accounts: <b>' + fm(tot) + '</b></div>' +
    (canFee() ? '<div class="chips"><button class="chip on" style="background:var(--p);border-color:var(--p)" onclick="accSheet()">＋ New account</button>' + (D.acc.length ? '<button class="chip" onclick="txSheet()">Deposit / withdraw</button>' : '') + (D.acc.length > 1 ? '<button class="chip" onclick="xferSheet()">Transfer</button>' : '') + '</div>' : '') +
    (unm.length ? '<div class="att warn" style="cursor:default"><span class="ai">⚠️</span><div class="t"><b>' + E(unm.join(', ')) + ' payments are not linked to an account</b><span class="m">They are missing from the cashbook. Link a method when creating an account.</span></div></div>' : '') +
    '<div class="card"><h3>Accounts</h3>' + (D.acc.length ? D.acc.map(a => { const b = D.accb.find(x => x.account_id === a.id); return rowH('<span class="badge ' + (a.id === ca ? '' : 'mut') + '">' + E(ACCT[a.type] || a.type) + '</span>', '<b>' + E(a.name) + '</b>', fm(b ? b.balance_minor : a.opening_minor), 'CA=\'' + a.id + '\';draw(true)'); }).join('') : empty('🏦', 'No accounts yet. Create Cash, Petty cash, Bank or Mobile Money accounts.', canFee() ? '<button class="btn" onclick="accSheet()">Create an account</button>' : '')) + '</div>' +
    (D.acc.length ? '<div class="card"><h3>Cashbook</h3><select class="in" onchange="CA=this.value;draw(true)">' + opts(accO(), ca) + '</select><div style="margin-top:6px">' + (D.cb.filter(x => x.account_id === ca).slice(0, 60).map(x => rowH('', '<b>' + E(x.description) + '</b><span class="m">' + fd(x.entry_date) + ' · balance ' + fm(x.balance_minor) + '</span>', x.income_minor ? '<span class="pos">+' + fm(x.income_minor) + '</span>' : '<span class="neg">-' + fm(x.expense_minor) + '</span>')).join('') || empty('📒', 'No entries yet.')) + '</div></div>' : '');
};
function accSheet() { sheet('<h2>New account</h2>' + field('ac_n', 'Account name', 'e.g. School cash box') + '<div class="grid2"><div><label class="l" for="ac_t">Type</label><select class="in" id="ac_t">' + opts(Object.entries(ACCT)) + '</select></div><div><label class="l" for="ac_o">Opening balance</label><input class="in" id="ac_o" inputmode="decimal" placeholder="0.00"></div></div><label class="l" for="ac_m">Receives fee payments made by</label><select class="in" id="ac_m">' + opts([['', 'Nothing (not a fee account)']].concat(METHODS.map(m => [m, m + ' payments']))) + '</select><div class="btns"><button class="btn blk" onclick="accSave()">Create account</button></div>'); }
async function accSave() { if (!need()) return; const n = val('ac_n'), o = toP(val('ac_o') || '0'); if (!n || o === null) return toast('Enter a name and a valid opening balance.', 'bad'); const id = crypto.randomUUID(), r = await sb.from('accounts').insert({ id, school_id: sid(), name: n, type: $('ac_t').value, opening_minor: o }); if (!r.error && $('ac_m').value) await sb.from('method_accounts').upsert({ school_id: sid(), method: $('ac_m').value, account_id: id }); await saved(r, 'Account created.'); }
function txSheet() { sheet('<h2>Deposit / withdrawal</h2><label class="l" for="tx_c">Account</label><select class="in" id="tx_c">' + opts(accO(), CA) + '</select><div class="seg" style="margin-top:12px" id="tx_k"><button class="on" onclick="txKind(this,\'deposit\')">Deposit</button><button onclick="txKind(this,\'withdrawal\')">Withdrawal</button></div><div class="grid2"><div><label class="l" for="tx_a">Amount (GH₵)</label><input class="in" id="tx_a" inputmode="decimal" placeholder="0.00"></div><div>' + field('tx_d', 'Date', '', 'type="date" value="' + td() + '"') + '</div></div>' + field('tx_n', 'Description', 'e.g. Bank deposit of fees') + '<div class="btns"><button class="btn blk" onclick="txSave()">Record</button></div>'); window.TXK = 'deposit'; }
function txKind(b, k) { window.TXK = k; [...b.parentNode.children].forEach(x => x.classList.toggle('on', x === b)); }
async function txSave() { if (!need()) return; const a = toP(val('tx_a')); if (!a || a <= 0) return toast('Enter a valid amount.', 'bad'); await saved(await sb.rpc('add_account_txn', { p_school: sid(), p_account: $('tx_c').value, p_kind: window.TXK, p_amount: a, p_date: $('tx_d').value || td(), p_desc: val('tx_n') || null }), 'Entry recorded.'); }
function xferSheet() { sheet('<h2>Transfer between accounts</h2><label class="l" for="xf_f">From</label><select class="in" id="xf_f">' + opts(accO()) + '</select><label class="l" for="xf_t">To</label><select class="in" id="xf_t">' + opts(accO(), (D.acc[1] || {}).id) + '</select><label class="l" for="xf_a">Amount (GH₵)</label><input class="in" id="xf_a" inputmode="decimal" placeholder="0.00">' + field('xf_n', 'Note', 'e.g. Petty cash top-up') + '<div class="btns"><button class="btn blk" onclick="xferSave()">Transfer</button></div>'); }
async function xferSave() { if (!need()) return; const a = toP(val('xf_a')); if (!a || a <= 0) return toast('Enter a valid amount.', 'bad'); if ($('xf_f').value === $('xf_t').value) return toast('Choose two different accounts.', 'bad'); await saved(await sb.rpc('transfer_funds', { p_school: sid(), p_from: $('xf_f').value, p_to: $('xf_t').value, p_amount: a, p_date: td(), p_note: val('xf_n') || null }), 'Transfer recorded.'); }

/* ---------- budgets ---------- */
PAGES.budgets = function () {
  const yrs = [...new Set(D.bud.map(b => b.academic_year))];
  return '<h2 class="ph">Budgets</h2><div class="sub">Plan income and spending, then compare with what happened.</div>' + (canFee() ? '<div class="btns" style="margin:0 0 6px"><button class="btn gold" onclick="budSheet()">＋ Set budget line</button></div>' : '') +
    (yrs.length ? yrs.map(y => '<div class="card"><h3>' + E(y) + '</h3>' + ['income', 'expense'].map(k => { const L = D.bud.filter(b => b.academic_year === y && b.kind === k); return L.length ? '<div class="m b" style="margin:10px 0 2px;text-transform:uppercase;letter-spacing:.06em">' + k + '</div>' + L.map(b => { const v = k === 'income' ? b.actual_minor - b.budget_minor : b.budget_minor - b.actual_minor, p = pct(b.actual_minor, b.budget_minor); return '<div class="hb"><div class="hr"><span>' + E(b.category) + '</span><span>' + fm(b.actual_minor) + ' / ' + fm(b.budget_minor) + '</span></div><div class="bar"><i style="width:' + Math.min(100, p) + '%' + (k === 'expense' && p > 100 ? ';background:var(--bad)' : '') + '"></i></div><div class="m ' + (v >= 0 ? 'pos' : 'neg') + '">' + (v >= 0 ? 'Favourable ' : 'Adverse ') + fm(Math.abs(v)) + '</div></div>'; }).join('') : ''; }).join('') + '</div>').join('') : '<div class="card">' + empty('📊', 'No budget lines yet.') + '</div>');
};
function budSheet() { sheet('<h2>Budget line</h2><label class="l" for="bd_y">Academic year</label><input class="in" id="bd_y" list="yr_dl" value="' + E(curYear()) + '">' + yrList('yr_dl') + '<div class="seg" id="bd_k" style="margin-top:12px"><button class="on" onclick="txKind(this,\'income\')">Income</button><button onclick="txKind(this,\'expense\')">Expense</button></div>' + field('bd_c', 'Category', 'e.g. Tuition, Electricity') + '<label class="l" for="bd_a">Budgeted amount (GH₵)</label><input class="in" id="bd_a" inputmode="decimal" placeholder="0.00"><div class="btns"><button class="btn blk" onclick="budSave()">Save</button></div>'); window.TXK = 'income'; }
async function budSave() { if (!need()) return; const a = toP(val('bd_a')); if (!a || a <= 0 || !val('bd_y') || !val('bd_c')) return toast('Enter year, category and a valid amount.', 'bad'); await saved(await sb.from('budgets').upsert({ school_id: sid(), academic_year: val('bd_y'), kind: window.TXK, category: val('bd_c'), amount_minor: a }, { onConflict: 'school_id,academic_year,kind,category' }), 'Budget saved.'); }

/* ---------- suppliers ---------- */
PAGES.suppliers = function () {
  const tot = sum(D.sbal, s => s.balance_minor);
  return '<h2 class="ph">Suppliers</h2><div class="sub">Total owed to suppliers: <b>' + fm(tot) + '</b></div>' + (canFee() ? '<div class="chips"><button class="chip on" style="background:var(--p);border-color:var(--p)" onclick="supSheet()">＋ Add supplier</button>' + (D.sup.length ? '<button class="chip" onclick="supTxSheet()">Purchase / payment</button>' : '') + '</div>' : '') +
    '<div class="card" style="padding:6px 16px">' + (D.sbal.length ? D.sbal.map(s => rowH(avatar(s.name, 40), '<b>' + E(s.name) + '</b>', s.balance_minor > 0 ? '<span class="neg">' + fm(s.balance_minor) + '</span>' : '<span class="badge ok">Settled</span>')).join('') : empty('🚚', 'No suppliers yet.')) + '</div>';
};
function supSheet() { sheet('<h2>Add supplier</h2>' + field('sp_n', 'Supplier name', 'e.g. Kwame Stationery Ltd') + field('sp_p', 'Phone', 'Optional', 'inputmode="tel"') + '<div class="btns"><button class="btn blk" onclick="supSave()">Save</button></div>'); }
async function supSave() { if (!need()) return; if (!val('sp_n')) return toast('Supplier name is required.', 'bad'); await saved(await sb.from('suppliers').insert({ school_id: sid(), name: val('sp_n'), phone: val('sp_p') || null }), 'Supplier added.'); }
function supTxSheet() { sheet('<h2>Purchase / payment</h2><label class="l" for="sx_s">Supplier</label><select class="in" id="sx_s">' + opts(D.sup.map(s => [s.id, s.name])) + '</select><div class="seg" id="sx_k" style="margin-top:12px"><button class="on" onclick="txKind(this,\'purchase\');sxKind()">Bought on credit</button><button onclick="txKind(this,\'payment\');sxKind()">Paid supplier</button></div><div class="grid2"><div><label class="l" for="sx_a">Amount (GH₵)</label><input class="in" id="sx_a" inputmode="decimal" placeholder="0.00"></div><div>' + field('sx_d', 'Date', '', 'type="date" value="' + td() + '"') + '</div></div><div id="sx_ac" class="hide"><label class="l" for="sx_c">Paid from account</label><select class="in" id="sx_c">' + opts(accO()) + '</select></div>' + field('sx_r', 'Reference', 'Optional') + '<div class="btns"><button class="btn blk" onclick="supTxSave()">Record</button></div>'); window.TXK = 'purchase'; }
const sxKind = () => $('sx_ac').classList.toggle('hide', window.TXK !== 'payment');
async function supTxSave() { if (!need()) return; const a = toP(val('sx_a')), k = window.TXK; if (!a || a <= 0) return toast('Enter a valid amount.', 'bad'); if (k === 'payment' && !D.acc.length) return toast('Payments need an account. Create one first.', 'bad'); await saved(await sb.from('supplier_txns').insert({ school_id: sid(), supplier_id: $('sx_s').value, kind: k, amount_minor: a, paid_on: $('sx_d').value || td(), reference: val('sx_r') || null, account_id: k === 'payment' ? $('sx_c').value : null }), 'Entry recorded.'); }

/* ---------- academic years ---------- */
PAGES.years = function () {
  const Y = D.yrs || [], yo = Y.map(y => [y.name, y.name]);
  return '<h2 class="ph">Academic years</h2><div class="sub">Years, terms and moving balances forward.</div>' + (canFee() ? '<div class="chips"><button class="chip on" style="background:var(--p);border-color:var(--p)" onclick="yearSheet()">＋ New year</button>' + (Y.length ? '<button class="chip" onclick="termSheet()">Add term</button>' : '') + (Y.length > 1 ? '<button class="chip" onclick="cfSheet()">Carry forward balances</button>' : '') + '</div>' : '') +
    '<div class="card">' + (Y.length ? Y.map(y => '<div class="row"><div class="t"><b>' + E(y.name) + '</b><span class="m">' + fd(y.start_date) + ' to ' + fd(y.end_date) + '</span>' + ((D.trm || []).filter(t => t.year_id === y.id).map(t => '<div class="m">• ' + E(t.name) + ' · ' + fd(t.start_date) + ' to ' + fd(t.end_date) + '</div>').join('')) + '</div><div class="v"><span class="badge ' + (y.status === 'open' ? 'ok' : 'mut') + '">' + E(y.status) + '</span>' + (canFee() && y.status === 'open' ? '<div><a href="#" onclick="closeYr(\'' + y.id + '\');return false">Close year</a></div>' : '') + '</div></div>').join('') : empty('📅', 'No academic years yet.', canFee() ? '<button class="btn" onclick="yearSheet()">Create a year</button>' : '')) + '</div>' +
    ((D.cfw || []).length ? '<div class="card"><h3>Carry-forward history</h3>' + D.cfw.map(c => rowH('', '<b>' + E(c.from_year) + ' → ' + E(c.to_year) + '</b><span class="m">' + c.students_count + ' students · ' + fd(c.created_at) + '</span>', fm(c.total_minor))).join('') + '</div>' : '');
};
function yearSheet() { sheet('<h2>New academic year</h2>' + field('yr_n', 'Name', 'e.g. 2026/2027') + '<div class="grid2"><div>' + field('yr_s', 'Starts', '', 'type="date"') + '</div><div>' + field('yr_e', 'Ends', '', 'type="date"') + '</div></div><div class="btns"><button class="btn blk" onclick="yearSave()">Create year</button></div>'); }
async function yearSave() { if (!need()) return; if (!val('yr_n') || !$('yr_s').value || !$('yr_e').value) return toast('Enter a name and both dates.', 'bad'); await saved(await sb.from('academic_years').insert({ school_id: sid(), name: val('yr_n'), start_date: $('yr_s').value, end_date: $('yr_e').value }), 'Academic year created.'); }
function termSheet() { sheet('<h2>Add term</h2><label class="l" for="tm_y">Academic year</label><select class="in" id="tm_y">' + opts(D.yrs.map(y => [y.id, y.name])) + '</select>' + field('tm_n', 'Term name', 'e.g. Term 1') + '<div class="grid2"><div>' + field('tm_s', 'Starts', '', 'type="date"') + '</div><div>' + field('tm_e', 'Ends', '', 'type="date"') + '</div></div><div class="btns"><button class="btn blk" onclick="termSave()">Add term</button></div>'); }
async function termSave() { if (!need()) return; if (!val('tm_n') || !$('tm_s').value || !$('tm_e').value) return toast('Enter a term name and both dates.', 'bad'); await saved(await sb.from('terms').insert({ school_id: sid(), year_id: $('tm_y').value, name: val('tm_n'), start_date: $('tm_s').value, end_date: $('tm_e').value }), 'Term added.'); }
async function closeYr(id) { if (!need() || !await askYes('Close this academic year?', 'You can still view its records.', 'Close year')) return; await saved(await sb.from('academic_years').update({ status: 'closed' }).eq('id', id), 'Year closed.', true); }
function cfSheet() { const yo = D.yrs.map(y => [y.name, y.name]); sheet('<h2>Carry forward balances</h2><p class="m">Moves every unpaid balance from one year into a "balance brought forward" fee in the next. This happens once and cannot be undone.</p><label class="l" for="cf_f">From year</label><select class="in" id="cf_f">' + opts(yo) + '</select><label class="l" for="cf_t">To year</label><select class="in" id="cf_t">' + opts(yo, (yo[0] || [])[0]) + '</select><div class="btns"><button class="btn blk" onclick="cfGo()">Carry forward</button></div>'); }
async function cfGo() { if (!need()) return; const f = $('cf_f').value, t = $('cf_t').value; if (!f || !t || f === t) return toast('Choose two different years.', 'bad'); if (!await askYes('Carry forward from ' + f + ' to ' + t + '?', 'This happens once and cannot be undone.', 'Carry forward', true)) return; const r = await sb.rpc('carry_forward', { p_school: sid(), p_from: f, p_to: t }); await saved(r, r.data + ' student balance(s) carried forward.'); }

/* ---------- exports ---------- */
async function dlRows(name, head, rows) {
  try { await lj(XLSX_URLS); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head].concat(rows)), 'Sheet1'); XLSX.writeFile(wb, name + '.xlsx'); }
  catch (e) { const csv = [head].concat(rows).map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\n'), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' })); a.download = name + '.csv'; a.click(); }
}
function exportStudents() {
  const rows = D.students.filter(s => !SV.cls || s.class_name === SV.cls).map(s => { const f = FIDX[s.id] || []; return [s.student_no, s.full_name, s.class_name, s.gender || '', s.guardian_name || '', s.guardian_phone || '', s.status || 'active', mn(f.reduce((t, x) => t + x.amount_minor, 0)), mn(f.reduce((t, x) => t + x.paid_minor, 0)), mn(f.reduce((t, x) => t + bal(x), 0))]; });
  dlRows('students' + (SV.cls ? '-' + SV.cls : ''), ['Student ID', 'Name', 'Class', 'Gender', 'Guardian', 'Guardian phone', 'Status', 'Fees (GHS)', 'Paid (GHS)', 'Balance (GHS)'], rows);
}
function exportPayments() {
  dlRows('payments', ['Receipt', 'Date', 'Student', 'Class', 'Method', 'Reference', 'Amount (GHS)'], D.pays.map(p => [p.receipt_no || 'Reversal', String(p.occurred_at).slice(0, 10), sn(p.student_id), stu(p.student_id).class_name || '', p.method, p.reference || '', mn(p.amount_minor)]));
}

/* ===== FeePilot pages 3: SMS, staff, settings, status, reports ===== */

/* ---------- SMS & reminders ---------- */
const DEFT = 'Dear Parent, this is a friendly reminder that your child [Student Name] has an outstanding school fee balance of GHS [Amount]. Kindly contact [School Name] for payment arrangements. Thank you.';
const SM = { cls: '', tpl: '0', tab: 'send' };
const tplList = () => [['0', 'Default reminder']].concat((D.smst || []).map(t => [t.id, t.name]));
const tplBody = id => (!id || id === '0') ? DEFT : ((D.smst || []).find(t => t.id === id) || {}).body || DEFT;
const owing = cls => D.students.filter(s => s.status === 'active' && (!cls || s.class_name === cls)).map(s => ({ s: s, b: (FIDX[s.id] || []).reduce((t, f) => t + bal(f), 0) })).filter(x => x.b > 0).sort((a, b) => b.b - a.b);
const mrender = (t, x) => t.split('[Student Name]').join(x.s.full_name).split('[Amount]').join(fm(x.b).replace('GH₵ ', '')).split('[School Name]').join(D.school.name);
const DOWS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function setSmTab(t) { SM.tab = t; draw(true); }
function setSmCls(v) { SM.cls = v; draw(true); }
function setSmTpl(v) { SM.tpl = v; draw(true); }
function smPickAll(on) { document.querySelectorAll('.sck').forEach(c => c.checked = on); smCount(); }
function smCount() { const n = document.querySelectorAll('.sck:checked').length, b = $('sm_go'); if (b) b.textContent = n ? 'Queue ' + n + ' reminder' + (n > 1 ? 's' : '') : 'Select students'; if (b) b.disabled = !n; }
PAGES.sms = function () {
  ['smsm', 'smss', 'smst', 'smsu'].forEach(k => D[k] = D[k] || []);
  const L = owing(SM.cls), cl = classes(), tb = tplBody(SM.tpl);
  let h = '<h2 class="ph">SMS reminders</h2><div class="sub">Guardians are texted by the server. Balances are rechecked just before sending.</div>' + segH('smt', [['send', 'Send'], ['sched', 'Schedules'], ['tpl', 'Templates'], ['hist', 'History']], SM.tab, 'setSmTab');
  if (SM.tab === 'send') {
    h += '<div class="card"><div class="grid2"><div><label class="l">Class</label><select class="in" onchange="setSmCls(this.value)"><option value="">All classes</option>' + opts(cl.map(c => [c, c]), SM.cls) + '</select></div><div><label class="l">Message</label><select class="in" id="sm_t" onchange="setSmTpl(this.value)">' + opts(tplList(), SM.tpl) + '</select></div></div>' +
      '<label class="l" for="sm_w">Send at (optional)</label><input class="in" id="sm_w" type="datetime-local">' +
      '<div class="ins" style="margin-top:12px"><span>✉️</span><div>' + E(L.length ? mrender(tb, L[0]) : 'No students with outstanding balances.') + '</div></div></div>';
    if (L.length) h += '<div class="card"><h3>Who will get it <span class="m"><a href="#" onclick="smPickAll(true);return false">All</a> · <a href="#" onclick="smPickAll(false);return false">None</a></span></h3>' + L.map(x => '<label class="row" style="cursor:pointer"><input type="checkbox" class="sck" value="' + x.s.id + '" checked onchange="smCount()" style="width:20px;height:20px;margin-right:10px"><div class="t"><b>' + E(x.s.full_name) + '</b><span class="m">' + E(x.s.class_name || '') + (x.s.guardian_phone ? '' : ' · <span class="neg">no phone</span>') + (x.s.sms_opt_out ? ' · opted out' : '') + '</span></div><div class="v neg">' + fm(x.b) + '</div></label>').join('') + '<div class="btns"><button class="btn blk" id="sm_go" onclick="smsQueue()">Queue ' + L.length + ' reminder' + (L.length > 1 ? 's' : '') + '</button></div></div>';
    else h += '<div class="card">' + empty('🎉', 'Nobody owes anything in this selection.') + '</div>';
    h += '<div class="card"><h3>Guardian preference</h3><div class="m">Stop texting a guardian who asked not to be contacted.</div><label class="l">Student</label>' + combo('ot_s', matchStudents, x => { OT = x.id; }, 'Start typing a name…', '') + '<div class="btns"><button class="btn sec" onclick="optTog()">Toggle SMS opt-out</button></div></div>';
  }
  if (SM.tab === 'sched') {
    h += '<div class="card"><h3>New recurring schedule</h3><div class="m">Uses the class and message chosen on the Send tab. Times are Africa/Accra.</div>' + field('sn_n', 'Name', 'e.g. Monday reminders') + '<div class="grid2"><div><label class="l">Day</label><select class="in" id="sn_d">' + opts(DOWS.map((d, i) => [i, d]), 1) + '</select></div><div><label class="l">Time</label><select class="in" id="sn_h">' + opts([...Array(24).keys()].map(i => [i, String(i).padStart(2, '0') + ':00']), 8) + '</select></div></div><div class="btns"><button class="btn blk" onclick="schedNew()">Create schedule</button></div></div>' +
      '<div class="card"><h3>Schedules</h3>' + (D.smss.length ? D.smss.map(x => rowH('<span style="font-size:20px">' + (x.active ? '🔁' : '⏸️') + '</span>', '<b>' + E(x.name) + '</b><span class="m">' + DOWS[x.dow].slice(0, 3) + ' ' + String(x.hour).padStart(2, '0') + ':00 · ' + E(x.class_name || 'All classes') + ' · next ' + E(String(x.next_run_at || '').slice(0, 16).replace('T', ' ')) + '</span>', '<button class="btn sm sec" onclick="schedTog(\'' + x.id + '\',' + !x.active + ')">' + (x.active ? 'Pause' : 'Resume') + '</button>')).join('') : empty('🔁', 'No schedules yet.')) + '</div>';
  }
  if (SM.tab === 'tpl') {
    h += '<div class="card"><h3>New message template</h3><div class="m">Placeholders: [Student Name] [Amount] [School Name]</div>' + field('tn_n', 'Template name', 'e.g. Final notice') + '<label class="l" for="tn_b">Message</label><textarea class="in" id="tn_b" rows="4" placeholder="Dear Parent, …"></textarea><div class="btns"><button class="btn blk" onclick="tplSave()">Save template</button></div></div>' +
      '<div class="card"><h3>Your templates</h3><div class="row"><div class="t"><b>Default reminder</b><span class="m">' + E(DEFT) + '</span></div></div>' + D.smst.map(t => '<div class="row"><div class="t"><b>' + E(t.name) + '</b><span class="m">' + E(t.body) + '</span></div></div>').join('') + '</div>';
  }
  if (SM.tab === 'hist') {
    h += (isAd() ? '<div class="card"><h3>Cost &amp; limit</h3>' + field('cx', 'Cost per SMS segment (GHS)', 'e.g. 0.05', 'inputmode="decimal"') + field('lx', 'Monthly spending limit (GHS), blank = none', '', 'inputmode="decimal"') + '<div class="m" style="margin-top:6px">Current: ' + (D.smsc ? fm(D.smsc.cost_per_sms_minor) + ' per SMS, limit ' + (D.smsc.monthly_limit_minor == null ? 'none' : fm(D.smsc.monthly_limit_minor)) : 'not set') + '</div><div class="btns"><button class="btn blk" onclick="smsSet()">Save</button></div></div>' : '') +
      '<div class="card"><h3>Usage</h3>' + (D.smsu.length ? D.smsu.map(u => rowH('', '<b>' + E(String(u.month).slice(0, 7)) + '</b><span class="m">' + u.sent_count + ' sent</span>', fm(u.cost_minor))).join('') : '<div class="m">No usage yet.</div>') + '</div>' +
      '<div class="card"><h3>Recent messages</h3><div class="m">“Sent” means accepted by the SMS provider. Delivery receipts are not tracked yet.</div>' + (D.smsm.length ? D.smsm.map(m => rowH('', '<b>' + E(sn(m.student_id)) + '</b><span class="m">' + E(m.kind) + ' · ' + E(String(m.created_at).slice(0, 16).replace('T', ' ')) + (m.error ? ' · ' + E(m.error) : '') + '</span>', '<span class="badge ' + (m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'bad' : 'warn') + '">' + E(m.status) + '</span>')).join('') : '<div class="m">Nothing sent yet.</div>') + '</div>';
  }
  return h;
};
let OT = '';
async function smsQueue() {
  const ids = [...document.querySelectorAll('.sck:checked')].map(c => c.value); if (!ids.length) return toast('Select at least one student.', 'bad');
  const tpl = tplBody($('sm_t') ? $('sm_t').value : SM.tpl), w = $('sm_w') && $('sm_w').value ? new Date($('sm_w').value).toISOString() : null;
  if (!online()) { await enqueue({ k: 'r', id: crypto.randomUUID(), ids: ids, tpl: tpl, when: w, amt: 0, method: 'SMS reminders (' + ids.length + ')', at: new Date().toISOString(), state: 'pending' }); return toast('Prepared on this device. NOT sent yet. It is queued on the server when you reconnect.', 'ok'); }
  if (!need()) return;
  const r = await sb.rpc('queue_reminders', { p_school: sid(), p_students: ids, p_template: tpl, p_when: w });
  if (r.error) return toast(friendly(r.error), 'bad'); toast(r.data + ' reminder(s) queued. Cleared balances, opted-out guardians and same-day duplicates are skipped.', 'ok'); await pull(); SM.tab = 'hist'; draw(true);
}
async function schedNew() { if (!need()) return; if (!val('sn_n')) return toast('Give the schedule a name.', 'bad'); const r = await sb.rpc('create_sms_schedule', { p_school: sid(), p_name: val('sn_n'), p_dow: +$('sn_d').value, p_hour: +$('sn_h').value, p_class: SM.cls || null, p_template: tplBody(SM.tpl) }); await saved(r, 'Schedule created. The server sends at the scheduled time.', true); draw(true); }
async function schedTog(id, a) { if (!need()) return; await saved(await sb.from('sms_schedules').update({ active: a }).eq('id', id), a ? 'Schedule resumed.' : 'Schedule paused.', true); }
async function tplSave() { if (!need()) return; if (!val('tn_n') || !val('tn_b')) return toast('Enter a name and a message.', 'bad'); await saved(await sb.from('sms_templates').insert({ school_id: sid(), name: val('tn_n'), body: val('tn_b') }), 'Template saved.', true); }
async function smsSet() { if (!need()) return; const c = toP(val('cx') || '0'), l = val('lx') ? toP(val('lx')) : null; if (c === null || (val('lx') && l === null)) return toast('Enter valid amounts.', 'bad'); await saved(await sb.from('sms_settings').upsert({ school_id: sid(), cost_per_sms_minor: c, monthly_limit_minor: l }, { onConflict: 'school_id' }), 'SMS settings saved.', true); }
async function optTog() { if (!need()) return; const s = stu(OT); if (!s.id) return toast('Pick a student first.', 'bad'); await saved(await sb.from('students').update({ sms_opt_out: !s.sms_opt_out }).eq('id', s.id), s.full_name + (s.sms_opt_out ? ' will receive SMS again.' : ' will no longer receive SMS.'), true); }

/* ---------- staff ---------- */
const STAFF_ROLES = [['admin', 'Administrator'], ['accountant', 'Accountant'], ['account_officer', 'Account officer'], ['auditor', 'Auditor'], ['readonly', 'Read-only']];
PAGES.staff = function () {
  return '<h2 class="ph">Staff</h2><div class="sub">Invite colleagues and choose what each person can do.</div>' +
    '<div class="card"><h3>Add a person with a code</h3><div class="m" style="margin-bottom:6px">They need no email or password. Give them the code, they tap <b>Join a school</b> and they are in.</div>' + field('jn_n', 'Their name', 'e.g. Ama Mensah') + '<label class="l" for="jn_r">What can they do?</label><select class="in" id="jn_r">' + opts(STAFF_ROLES, 'account_officer') + '</select><div class="btns"><button class="btn" onclick="mkCode()">Create code</button></div></div>' +
    (((D.jn || {}).codes || []).length ? '<div class="card"><h3>Waiting to join</h3>' + D.jn.codes.map(c => '<div class="row"><div class="t"><b>' + E(c.name) + '</b><span class="m">' + E(ROLES[c.role] || c.role) + ' · code <b style="letter-spacing:2px">' + E(c.code.slice(0, 4) + ' ' + c.code.slice(4)) + '</b> · expires ' + E(String(c.expires_at).slice(0, 10)) + '</span></div><div class="v"><button class="btn sm sec" onclick="showCode(\'' + c.code + '\')">Show</button> <button class="btn sm sec" onclick="cancelCode(\'' + c.code + '\')">Cancel</button></div></div>').join('') + '</div>' : '') +
    '<details class="card"><summary><b>Invite by email instead</b></summary>' + field('iv_e', 'Their email', 'name@school.edu.gh', 'type="email" inputmode="email"') + '<label class="l" for="iv_r">Role</label><select class="in" id="iv_r">' + opts(STAFF_ROLES, 'account_officer') + '</select><div class="btns"><button class="btn blk" onclick="inv()">Send invitation</button></div><div class="m" style="margin-top:8px">They create an account with that email and are added automatically.</div>' + '</div></details>' +
    '<div class="card"><h3>Team</h3>' + ((D.staff || []).length ? D.staff.map(s => !s.user_id ? '<div class="row">' + avatar(s.email, 40) + '<div class="t"><b>' + E(s.email) + '</b><span class="m">' + E(ROLES[s.role] || s.role) + ' · invited, waiting to sign up</span></div></div>' : '<div class="row">' + avatar(s.email || (D.jn && D.jn.names[s.user_id]) || '?', 40) + '<div class="t"><b>' + E(s.email || (D.jn && D.jn.names[s.user_id]) || 'Joined with a code') + '</b><span class="m">' + E(ROLES[s.role] || s.role) + (s.email ? '' : ' · code') + (s.active ? '' : ' · deactivated') + '</span></div><div class="v">' + (s.role === 'proprietor' ? '<span class="badge ok">Owner</span>' : '<select class="in" style="min-height:38px;padding:4px 8px;width:auto" onchange="setStaff(\'' + s.user_id + '\',this.value,' + s.active + ')">' + opts(STAFF_ROLES, s.role) + '</select> <button class="btn sm sec" onclick="setStaff(\'' + s.user_id + '\',\'' + s.role + '\',' + !s.active + ')">' + (s.active ? 'Deactivate' : 'Reactivate') + '</button>') + '</div></div>').join('') : empty('👥', 'Only you so far.')) + '</div>' +
    '<div class="card"><h3>What each role can do</h3>' + [['Administrator', 'Everything except changing the owner'], ['Accountant', 'Payments, fees, expenses, accounts, reports'], ['Account officer', 'Record payments and students'], ['Auditor / Read-only', 'View and export only']].map(x => '<div class="row"><div class="t"><b>' + x[0] + '</b><span class="m">' + x[1] + '</span></div></div>').join('') + '</div>';
};
async function inv() { if (!need()) return; const e = val('iv_e'); if (!/^\S+@\S+\.\S+$/.test(e)) return toast('Enter a valid email.', 'bad'); const r = await sb.rpc('invite_staff', { p_school: sid(), p_email: e, p_role: $('iv_r').value }); if (r.error) return toast(friendly(r.error), 'bad'); toast('Invitation saved. They sign up with that email to join.', 'ok'); await pull(); draw(true); }
async function mkCode() {
  if (!need()) return; const n = val('jn_n'); if (n.length < 2) return toast("Enter the person's name.", 'bad');
  const r = await sb.rpc('create_join_code', { p_school: sid(), p_name: n, p_role: $('jn_r').value }); if (r.error) return toast(friendly(r.error), 'bad');
  await pull(); draw(true); showCode(r.data, n);
}
function showCode(c, n) {
  const f = c.slice(0, 4) + ' ' + c.slice(4), who = n || (((D.jn || {}).codes || []).find(z => z.code === c) || {}).name || '';
  const msg = 'Join ' + D.school.name + ' on FeePilot.\nOpen https://feepilotgh.github.io/app/ , tap "Join a school" and type this code: ' + f + '\n(The code works once and expires in 7 days.)';
  window.__cc = f;
  sheet('<h2>Code for ' + E(who) + '</h2><div style="font-size:34px;font-weight:800;letter-spacing:6px;text-align:center;margin:14px 0">' + E(f) + '</div><div class="m c">Works once. Expires in 7 days.</div><div class="btns"><a class="btn" style="text-align:center;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">Send on WhatsApp</a><button class="btn sec" onclick="navigator.clipboard&amp;&amp;navigator.clipboard.writeText(window.__cc).then(()=>toast(\'Copied\',\'ok\'))">Copy code</button></div>');
}
async function cancelCode(c) { if (!await askYes('Cancel this code?', 'It will stop working.', 'Cancel code')) return; const r = await sb.rpc('cancel_join_code', { p_school: sid(), p_code: c }); if (r.error) return toast(friendly(r.error) + ' [' + String(r.error.message || '').slice(0, 90) + ']', 'bad'); await pull(); draw(true); }
async function setStaff(u, role0, a) { if (!need()) return; if (!a && !await askYes('Deactivate this person?', 'They will no longer be able to open ' + D.school.name + '.', 'Deactivate')) { draw(true); return; } const r = await sb.rpc('set_staff', { p_school: sid(), p_user: u, p_role: role0, p_active: a }); if (r.error) return toast(friendly(r.error), 'bad'); toast('Staff updated.', 'ok'); await pull(); draw(true); }

/* ---------- settings ---------- */
PAGES.settings = function () {
  const sc = D.school, logo = sc.logo && sb ? sb.storage.from('logos').getPublicUrl(sc.logo).data.publicUrl : '';
  return '<h2 class="ph">School settings</h2><div class="sub">These appear on every receipt and statement.</div><div class="card">' +
    (logo ? '<img alt="" src="' + E(logo) + '" style="max-height:64px;margin-bottom:10px">' : '') + field('gs_n', 'School name', '', 'value="' + E(sc.name) + '"') + field('gs_a', 'Address', 'Town, region', 'value="' + E(sc.address || '') + '"') + field('gs_p', 'Phone', '0244 000 000', 'inputmode="tel" value="' + E(sc.phone || '') + '"') +
    '<label class="l" for="gs_l">Logo (PNG, JPG or WebP, max 1 MB)</label><input class="in" id="gs_l" type="file" accept="image/png,image/jpeg,image/webp"><div class="btns"><button class="btn blk" onclick="saveSettings()">Save settings</button></div></div>' +
    (D.sub ? '<div class="card"><h3>Subscription</h3><div class="row"><div class="t"><b>' + E((D.sub.plans || {}).name || 'Plan') + '</b><span class="m">' + (D.sub.status === 'trial' && D.sub.trial_ends_at ? 'Trial ends ' + E(D.sub.trial_ends_at.slice(0, 10)) : '') + '</span></div><div class="v"><span class="badge ' + (D.sub.status === 'active' || D.sub.status === 'trial' ? 'ok' : 'bad') + '">' + E(D.sub.status) + '</span></div></div>' + (window.SUPPORT_WA ? '<div class="btns"><a class="btn sec" target="_blank" rel="noopener" href="https://wa.me/' + E(window.SUPPORT_WA) + '">Talk to FeePilot support</a></div>' : '') + '</div>' : '');
};
async function saveSettings() {
  if (!need()) return; const u = { name: val('gs_n'), address: val('gs_a') || null, phone: val('gs_p') || null }, fl = $('gs_l').files[0];
  if (!u.name) return toast('School name is required.', 'bad');
  if (fl) { if (!/^image\/(png|jpeg|webp)$/.test(fl.type) || fl.size > 1048576) return toast('Logo must be PNG, JPG or WebP under 1 MB.', 'bad'); const p = sid() + '/logo-' + Date.now() + '.' + fl.type.split('/')[1], up = await sb.storage.from('logos').upload(p, fl, { contentType: fl.type }); if (up.error) return toast('Upload failed: ' + up.error.message, 'bad'); u.logo_path = p; }
  const r = await sb.from('schools').update(u).eq('id', sid()); if (r.error) return toast(friendly(r.error), 'bad'); toast('Settings saved.', 'ok'); await pull(); draw(true);
}

/* ---------- status / sync ---------- */
PAGES.sync = function () {
  const q = D.q.filter(x => x.state !== 'done'), on = online();
  return '<h2 class="ph">Status</h2><div class="sub">Works offline. Entries made without a connection are sent when you are back online.</div>' +
    '<div class="card"><div class="row"><div class="t"><b>Connection</b><span class="m">' + (on ? 'Online' : 'Offline: you can keep recording') + '</span></div><div class="v"><span class="badge ' + (on ? 'ok' : 'warn') + '">' + (on ? 'Online' : 'Offline') + '</span></div></div>' +
    '<div class="row"><div class="t"><b>Waiting to sync</b><span class="m">' + q.length + ' item' + (q.length === 1 ? '' : 's') + ' on this device</span></div></div>' +
    (D.loaded ? '<div class="row"><div class="t"><b>Last updated</b><span class="m">' + E(new Date(D.loaded).toLocaleString('en-GB', { timeZone: 'Africa/Accra' })) + '</span></div></div>' : '') +
    '<div class="btns"><button class="btn blk" onclick="sync()" ' + (busy || !on ? 'disabled' : '') + '>' + (busy ? 'Syncing…' : 'Sync now') + '</button></div></div>' +
    (q.length ? '<div class="card"><h3>On this device</h3>' + q.map(x => rowH('', '<b>' + E(x.k === 'r' ? x.method : (x.k === 'x' ? 'Expense: ' + (x.description || '') : (x.amt ? fm(x.amt) + ' ' : '') + (x.method || 'Payment'))) + '</b><span class="m ' + (x.state === 'failed' ? 'neg' : '') + '">' + (x.state === 'failed' ? 'Failed: ' + E(x.err || 'rejected') : 'Waiting to sync') + '</span>', x.state === 'failed' ? '<button class="btn sm bad" onclick="dropFailed(\'' + x.id + '\')">Discard</button>' : '')).join('') + '</div>' : '') +
    '<div class="card"><h3>Account</h3><div class="row"><div class="t"><b>' + E((U && U.email) || '') + '</b><span class="m">' + E(ROLES[role()] || '') + ' · ' + E(D.school.name) + '</span></div></div><div class="btns"><button class="btn sec" onclick="changePwSheet()">Change password</button><button class="btn bad" onclick="signOut()">Sign out</button></div></div>';
};

/* ---------- reports ---------- */
let RP = 'col', RES = null; const FV = {};
const M = p => ({ m: p });
const cell = c => c && typeof c === 'object' ? fm(c.m) : E(c == null ? '' : c), cellp = c => c && typeof c === 'object' ? fm(c.m).replace('GH₵', 'GHS') : String(c == null ? '' : c);
function grp(a, k) { const m = {}; a.forEach(x => { const key = k(x); (m[key] = m[key] || []).push(x); }); return Object.keys(m).sort().map(key => [key, m[key]]); }
function wk(d) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - (t.getUTCDay() + 6) % 7); return t.toISOString().slice(0, 10); }
const rpays = (a, b) => all(() => sb.from('payments').select('*').gte('occurred_at', a + 'T00:00:00Z').lte('occurred_at', b + 'T23:59:59Z').order('occurred_at'));
const feesAll = () => all(() => sb.from('fee_balances').select('*'));
async function rfees() { let F = await feesAll(); const y = val('rp_y'), c = $('rp_c') ? $('rp_c').value : ''; if (y) F = F.filter(f => f.academic_year === y); if (c) F = F.filter(f => stu(f.student_id).class_name === c); return F; }
const t3 = F => [M(sum(F, f => f.amount_minor)), M(sum(F, f => f.paid_minor)), M(sum(F, f => f.balance_minor))], byKey = (F, k) => grp(F, k).map(([n, l]) => [n].concat(t3(l)));
const C3 = ['Expected', 'Collected', 'Outstanding'], CFN = 'Fees carried forward to a later year show zero outstanding here; the balance appears in the new year.';
const REP = {
  col: { n: 'Collections (daily / weekly / monthly)', f: 'rg', run: async (a, b) => { const P = await rpays(a, b), g = $('rp_g').value, k = x => { const d = x.occurred_at.slice(0, 10); return g === 'd' ? d : g === 'w' ? 'Week of ' + wk(d) : d.slice(0, 7); }; return { cols: ['Period', 'Receipts', 'Net collected'], rows: grp(P, k).map(([p, l]) => [p, l.filter(x => x.amount_minor > 0).length, M(sum(l, x => x.amount_minor))]), tot: ['Total', '', M(sum(P, x => x.amount_minor))] }; } },
  yr: { n: 'Academic-year collection', f: 'c', run: async () => { const F = await rfees(); return { cols: ['Academic year'].concat(C3), rows: byKey(F, f => f.academic_year), tot: ['Total'].concat(t3(F)), note: CFN }; } },
  out: { n: 'Outstanding fees', f: 'cy', run: async () => { const F = (await rfees()).filter(f => f.balance_minor > 0).sort((x, y) => (stu(x.student_id).class_name + stu(x.student_id).full_name).localeCompare(stu(y.student_id).class_name + stu(y.student_id).full_name)); return { cols: ['Student', 'Class', 'Fee', 'Year', 'Outstanding'], rows: F.map(f => [stu(f.student_id).full_name, stu(f.student_id).class_name, f.category, f.academic_year, M(f.balance_minor)]), tot: ['Total', '', '', '', M(sum(F, f => f.balance_minor))] }; } },
  cls: { n: 'Class financial report', f: 'cy', run: async () => { const F = await rfees(); return { cols: ['Class'].concat(C3), rows: byKey(F, f => stu(f.student_id).class_name || '?'), tot: ['Total'].concat(t3(F)), note: CFN }; } },
  cat: { n: 'Fee category report', f: 'cy', run: async () => { const F = await rfees(); return { cols: ['Fee category'].concat(C3), rows: byKey(F, f => f.category), tot: ['Total'].concat(t3(F)), note: CFN }; } },
  stu: { n: 'Student financial statement', f: 's', run: async () => { const id = FV.rp_s; if (!id) throw new Error('Choose a student.'); const F = (await feesAll()).filter(f => f.student_id === id), P = await all(() => sb.from('payments').select('*').eq('student_id', id).order('occurred_at')), nm = {}; F.forEach(f => nm[f.fee_item_id] = f.category); return { cols: ['When', 'Description', 'Charge', 'Payment'], rows: F.map(f => [f.academic_year, f.category + (f.carried_to ? ' (carried to ' + f.carried_to + ')' : ''), M(f.amount_minor), '']).concat(P.map(p => [p.occurred_at.slice(0, 10), (p.receipt_no || 'Reversal') + ' - ' + (nm[p.fee_item_id] || '') + ' (' + p.method + ')', '', M(p.amount_minor)])), tot: ['Balance', '', M(sum(F, f => f.balance_minor)), ''], sub: ' · ' + (stu(id).full_name || '') }; } },
  exp: { n: 'Expense report', f: 'r', run: async (a, b) => { const X = await all(() => sb.from('expenses').select('*').eq('status', 'approved').gte('paid_on', a).lte('paid_on', b).order('paid_on')); return { cols: ['Date', 'Category', 'Description', 'Recipient', 'Amount'], rows: X.map(x => [x.paid_on, x.category, x.description, x.recipient || '', M(x.amount_minor)]), tot: ['Total', '', '', '', M(sum(X, x => x.amount_minor))] }; } },
  cb: { n: 'Cashbook report', f: 'ra', run: async (a, b) => { const id = $('rp_a').value; if (!id) throw new Error('Choose an account.'); const C = await all(() => sb.from('cashbook').select('*').eq('account_id', id).gte('entry_date', a).lte('entry_date', b).order('entry_ts')); return { cols: ['Date', 'Description', 'Income', 'Expense', 'Balance'], rows: C.map(x => [x.entry_date, x.description, M(x.income_minor), M(x.expense_minor), M(x.balance_minor)]), tot: ['Period total', '', M(sum(C, x => x.income_minor)), M(sum(C, x => x.expense_minor)), ''], sub: ' · ' + accN(id) }; } },
  ie: { n: 'Income and expenditure (cash basis)', f: 'r', run: async (a, b) => { const [P, F, X, S] = await Promise.all([rpays(a, b), feesAll(), all(() => sb.from('expenses').select('*').eq('status', 'approved').gte('paid_on', a).lte('paid_on', b)), all(() => sb.from('supplier_txns').select('*').eq('kind', 'payment').gte('paid_on', a).lte('paid_on', b))]), cat = {}; F.forEach(f => cat[f.fee_item_id] = f.category);
      const I = grp(P, p => cat[p.fee_item_id] || 'Other').map(([k, l]) => [k, M(sum(l, x => x.amount_minor))]), X2 = grp(X, x => x.category).map(([k, l]) => [k, M(sum(l, x => x.amount_minor))]), si = sum(P, x => x.amount_minor), se = sum(X, x => x.amount_minor) + sum(S, x => x.amount_minor); if (S.length) X2.push(['Supplier payments', M(sum(S, x => x.amount_minor))]);
      return { cols: ['Item', 'Amount'], rows: [['INCOME', '']].concat(I, [['Total income', M(si)], ['EXPENDITURE', '']], X2, [['Total expenditure', M(se)]]), tot: ['Surplus / (deficit)', M(si - se)], note: 'Cash-basis operational statement. Not a certified accounting statement.' }; } },
  pm: { n: 'Payment method report', f: 'r', run: async (a, b) => { const P = await rpays(a, b); return { cols: ['Method', 'Receipts', 'Net collected'], rows: grp(P, p => p.method).map(([k, l]) => [k, l.filter(x => x.amount_minor > 0).length, M(sum(l, x => x.amount_minor))]), tot: ['Total', '', M(sum(P, x => x.amount_minor))] }; } },
  sup: { n: 'Supplier balances', f: '', run: async () => { const S = await all(() => sb.from('supplier_balances').select('*').order('name')); return { cols: ['Supplier', 'Owed'], rows: S.map(s => [s.name, M(s.balance_minor)]), tot: ['Total owed', M(sum(S, s => s.balance_minor))] }; } },
  stf: { n: 'Staff transaction activity', f: 'r', run: async (a, b) => { const P = await rpays(a, b), em = {}; (D.staff || []).forEach(s => em[s.user_id] = s.email); return { cols: ['Staff', 'Transactions', 'Net recorded'], rows: grp(P, p => p.recorded_by).map(([k, l]) => [em[k] || String(k).slice(0, 8), l.length, M(sum(l, x => x.amount_minor))]), tot: ['Total', P.length, M(sum(P, x => x.amount_minor))] }; } },
  sms: { n: 'SMS expenditure', f: '', run: async () => { const U2 = await all(() => sb.from('sms_usage').select('*').order('month')); return { cols: ['Month', 'Messages sent', 'Spent'], rows: U2.map(u => [String(u.month).slice(0, 7), u.sent_count, M(u.cost_minor)]), tot: ['Total', sum(U2, u => u.sent_count), M(sum(U2, u => u.cost_minor))] }; } }
};
function rpSet(k, v) { FV[k] = v; }
function rpPick(v) { RP = v; RES = null; draw(true); }
PAGES.reports = function () {
  const td = new Date().toISOString().slice(0, 10); FV.rp_a1 = FV.rp_a1 || td.slice(0, 8) + '01'; FV.rp_b1 = FV.rp_b1 || td;
  const f = REP[RP].f, mk = (k, x) => 'value="' + E(FV[k] || '') + '" oninput="rpSet(\'' + k + '\',this.value)" ' + (x || '');
  window.__after = () => { showRes(); };
  const keys = Object.keys(REP).filter(k => k !== 'sms' || canFee());
  return '<h2 class="ph">Reports</h2><div class="sub">Pick a report, set the filters and generate. Export to Excel or PDF, or print.</div>' +
    '<div class="card"><label class="l" for="rp_k">Report</label><select class="in" id="rp_k" onchange="rpPick(this.value)">' + opts(keys.map(k => [k, REP[k].n]), RP) + '</select>' +
    (f.includes('r') ? '<div class="grid2"><div><label class="l" for="rp_a1">From</label><input class="in" type="date" id="rp_a1" ' + mk('rp_a1') + '></div><div><label class="l" for="rp_b1">To</label><input class="in" type="date" id="rp_b1" ' + mk('rp_b1') + '></div></div>' : '') +
    (f.includes('g') ? '<label class="l" for="rp_g">Group by</label><select class="in" id="rp_g"><option value="d">Daily</option><option value="w">Weekly</option><option value="m" selected>Monthly</option></select>' : '') +
    (f.includes('c') ? '<label class="l" for="rp_c">Class</label><select class="in" id="rp_c"><option value="">All classes</option>' + opts(classes().map(c => [c, c])) + '</select>' : '') +
    (f.includes('y') ? '<label class="l" for="rp_y">Academic year (optional)</label><input class="in" id="rp_y" placeholder="e.g. 2026/2027" ' + mk('rp_y') + '>' : '') +
    (f.includes('s') ? '<label class="l">Student</label>' + combo('rp_s', matchStudents, x => { FV.rp_s = x.id; }, 'Start typing a name or ID…', stu(FV.rp_s).full_name || '') : '') +
    (f.includes('a') ? '<label class="l" for="rp_a">Account</label><select class="in" id="rp_a">' + opts(accO()) + '</select>' : '') +
    '<div class="btns"><button class="btn blk" onclick="runRep()">Generate report</button></div></div><div id="rr"></div>';
};
function showRes() {
  const o = $('rr'); if (!o) return; if (!RES) { o.innerHTML = ''; return; }
  const R = RES.rows.concat(RES.tot ? [RES.tot] : []);
  o.innerHTML = '<div class="card" id="rprint"><h3>' + E(RES.title) + '</h3><div class="m">' + E(D.school.name) + E(RES.sub || '') + '</div><div style="overflow-x:auto;margin-top:8px"><table class="t"><tr>' + RES.cols.map((c, i) => '<th class="' + (i && /^(Amount|Expected|Collected|Outstanding|Net|Income|Expense|Balance|Charge|Payment|Owed|Spent|Receipts|Messages|Transactions)/.test(c) ? 'num' : '') + '">' + E(c) + '</th>').join('') + '</tr>' + R.map((r, i) => '<tr class="' + (RES.tot && i === R.length - 1 ? 'tot' : '') + '">' + r.map(c => '<td class="' + (c && typeof c === 'object' ? 'num' : '') + '">' + cell(c) + '</td>').join('') + '</tr>').join('') + '</table></div>' + (RES.rows.length ? '' : '<div class="m" style="margin-top:8px">No records for these filters.</div>') + '<div class="m" style="margin-top:10px">' + E(RES.note) + '</div></div>' +
    '<div class="btns np"><button class="btn" onclick="xl()">' + ico('down', 18) + ' Excel</button><button class="btn sec" onclick="pdf()">' + ico('down', 18) + ' PDF</button><button class="btn sec" onclick="window.print()">' + ico('print', 18) + ' Print</button></div>';
}
async function runRep() {
  if (!need()) return; const rr = $('rr'); rr.innerHTML = '<div class="card m">Generating…</div>';
  try { const a = FV.rp_a1 || '', b = FV.rp_b1 || ''; RES = await REP[RP].run(a, b); RES.title = REP[RP].n; RES.sub = (REP[RP].f.includes('r') ? ' · ' + a + ' to ' + b : '') + (RES.sub || ''); RES.note = RES.note || 'Prepared from FeePilot records. Cash-basis operational report, not audited accounts.'; sb.rpc('log_report', { p_school: sid(), p_name: REP[RP].n }); showRes(); }
  catch (e) { RES = null; rr.innerHTML = '<div class="card"><div class="err">' + E(friendly(e)) + '</div></div>'; }
}
async function xl() { try { await lj(XLSX_URLS); } catch (e) { return toast(e.message, 'bad'); } const ws = XLSX.utils.aoa_to_sheet([RES.cols].concat(RES.rows, RES.tot ? [RES.tot] : []).map(r => r.map(c => c && typeof c === 'object' ? mn(c.m) : c))), wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Report'); XLSX.writeFile(wb, 'feepilot-' + RP + '.xlsx'); }
async function pdf() {
  try { await lj(['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js']); await lj(['https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js']); } catch (e) { return toast(e.message, 'bad'); }
  const d = new window.jspdf.jsPDF(); d.setFontSize(14); d.text(String(D.school.name), 14, 14); d.setFontSize(10); d.text((RES.title + ' ' + (RES.sub || '')).replace(/[^\x20-\x7E]/g, '-'), 14, 21);
  d.autoTable({ startY: 26, head: [RES.cols], body: RES.rows.concat(RES.tot ? [RES.tot] : []).map(r => r.map(cellp)), styles: { fontSize: 8 } }); d.setFontSize(8); d.text(RES.note, 14, d.lastAutoTable.finalY + 8); d.save('feepilot-' + RP + '.pdf');
}
window.afterSync = function () { if (SH) return; };


/* ---------- Platform admin (only for the platform owner; shown in More) ---------- */
const PA = { S: [], PL: [], B: [], tab: 's', EP: null, note: '', loaded: false, busy: false };
async function paLoad() {
  if (PA.busy || !online()) return; PA.busy = true;
  try {
    const q = await Promise.all([sb.rpc('platform_schools'), sb.from('plans').select('*').order('created_at'), sb.rpc('platform_billing')]);
    PA.S = q[0].data || []; PA.PL = q[1].data || []; PA.B = q[2].data || []; PA.loaded = true;
    if (q[0].error) PA.note = 'Failed: ' + friendly(q[0].error);
  } catch (e) { PA.note = 'Failed: ' + friendly(e); }
  PA.busy = false; draw();
}
async function paRun(r, msg) { PA.note = r.error ? 'Failed: ' + friendly(r.error) : msg; if (!r.error) toast(msg, 'ok'); PA.loaded = false; PA.busy = false; await paLoad(); }
function paTab(t) { PA.tab = t; PA.EP = null; PA.note = ''; draw(); }
function paStatus(id, st) { if (confirm('Set this school to ' + st + '?')) sb.rpc('platform_set_status', { p_school: id, p_status: st }).then(r => paRun(r, 'Status updated.')); }
function paSub() { sb.rpc('platform_set_subscription', { p_school: $('pa_s').value, p_plan: $('pa_p').value || null, p_status: $('pa_x').value, p_trial_ends: $('pa_t').value ? new Date($('pa_t').value).toISOString() : null, p_renews: $('pa_r').value || null }).then(r => paRun(r, 'Subscription updated.')); }
function paPay() {
  const a = toP(val('pb_a')); if (!a || a <= 0) { PA.note = 'Failed: enter a valid amount.'; return draw(); }
  sb.rpc('platform_record_payment', { p_school: $('pb_s').value, p_amount: a, p_ref: val('pb_r') || null, p_from: $('pb_f').value || null, p_to: $('pb_t').value || null, p_note: val('pb_n') || null }).then(r => paRun(r, 'Payment recorded. The school is active until the new renewal date.'));
}
function paQuick(id, k) {
  const x = PA.S.find(z => z.id === id); if (!x) return;
  const lbl = { t: 'start a 14-day free trial', m: 'record 1 month (GH₵ 250)', q: 'record 1 term (GH₵ 700)' }[k];
  if (!confirm(x.name + ': ' + lbl + '?')) return;
  if (k === 't') { const d = new Date(Date.now() + 14 * 864e5).toISOString(); return sb.rpc('platform_set_subscription', { p_school: id, p_plan: ((PA.PL.find(z => z.is_default) || {}).id) || null, p_status: 'trial', p_trial_ends: d, p_renews: null }).then(r => paRun(r, 'Trial started: 14 days.')); }
  const iso = d => d.toISOString().slice(0, 10), today = new Date(iso(new Date()));
  const cur = x.renews_on ? new Date(x.renews_on) : today, from = cur > today ? cur : today, to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + (k === 'q' ? 4 : 1));
  sb.rpc('platform_record_payment', { p_school: id, p_amount: k === 'q' ? 70000 : 25000, p_ref: null, p_from: iso(from), p_to: iso(to), p_note: k === 'q' ? '1 term' : '1 month' }).then(r => paRun(r, 'Paid. Active until ' + iso(to) + '.'));
}
function paEdit(id) { PA.EP = PA.PL.find(p => p.id === id) || null; draw(); }
function paPlan() {
  const pr = toP($('pl_p').value || '0'); if (!val('pl_n') || pr === null) { PA.note = 'Failed: enter a name and a valid price.'; return draw(); }
  const n = x => $(x).value ? +$(x).value : null;
  sb.rpc('platform_upsert_plan', { p_id: PA.EP ? PA.EP.id : null, p_name: val('pl_n'), p_price: pr, p_interval: $('pl_i').value, p_trial: n('pl_t') ?? 0, p_max_students: n('pl_m'), p_max_staff: n('pl_f'), p_sms: $('pl_sm').checked, p_active: $('pl_a').checked, p_default: $('pl_d').checked }).then(r => { PA.EP = null; paRun(r, 'Plan saved.'); });
}
PAGES.platform = function () {
  if (!PA.loaded && !PA.busy) paLoad();
  const op = a => a.map(o => '<option value="' + E(o[0]) + '">' + E(o[1]) + '</option>').join('');
  const so = PA.S.map(x => [x.id, x.name]), po = [['', 'No plan']].concat(PA.PL.map(x => [x.id, x.name]));
  const days = d => d ? Math.ceil((new Date(d) - Date.now()) / 864e5) : null;
  let h = '<h2 class="ph">Platform admin</h2><div class="sub">You only. Shows school names, plans and head-counts. It cannot open any school\'s students or money.</div>' +
    '<div class="chips">' + [['s', 'Schools'], ['p', 'Plans'], ['b', 'Billing']].map(t => '<button class="chip' + (PA.tab === t[0] ? ' on' : '') + '" onclick="paTab(\'' + t[0] + '\')">' + t[1] + '</button>').join('') + '</div>';
  if (PA.note) h += '<div class="card" style="' + (PA.note.startsWith('Failed') ? 'border-color:#f3b4b4;color:#b42318' : 'border-color:#b7e4c7;color:#15803d') + '">' + E(PA.note) + '</div>';
  if (!PA.loaded) return h + '<div class="card"><div class="m">' + (online() ? 'Loading…' : 'Connect to the internet to use the platform admin.') + '</div></div>';
  if (PA.tab === 's') {
    const pend = PA.S.filter(x => x.sub_status === 'pending').length; PA.S.sort((a, b) => (b.sub_status === 'pending') - (a.sub_status === 'pending'));
    h += '<div class="card"><h3>Schools (' + PA.S.length + ')' + (pend ? ' · <span style="color:#b45309">' + pend + ' waiting for approval</span>' : '') + '</h3>' + (PA.S.map(x => {
      const ends = x.sub_status === 'trial' ? x.trial_ends_at : x.renews_on, dl = days(ends);
      const wait = x.sub_status === 'pending' ? ' <span class="badge" style="background:#fff3cd;color:#8a6d00;margin:0 6px">waiting for approval</span>' : ''; const warn = x.sub_status === 'pending' ? wait : x.sub_status !== 'suspended' && x.status !== 'suspended' && dl !== null && dl < 0 ? ' <span class="badge" style="background:#fde8e8;color:#b42318;margin:0 6px">read-only</span>' : (dl !== null && dl <= 7 ? ' <span class="badge" style="background:#fff3cd;color:#8a6d00;margin:0 6px">' + dl + ' days left</span>' : '');
      return '<div class="row" style="flex-wrap:wrap"><div class="t"><b>' + E(x.name) + '</b> <span class="m">' + E(x.code || '') + '</span>' + warn + '<span class="m">' + E(x.plan_name || 'no plan') + ' · ' + E(x.sub_status || '') + (x.trial_ends_at && x.sub_status === 'trial' ? ' · trial ends ' + E(x.trial_ends_at.slice(0, 10)) : '') + (x.renews_on ? ' · renews ' + E(x.renews_on) : '') + ' · ' + x.students + ' students · ' + x.staff + ' staff</span></div>' +
        '<div style="width:100%;display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button class="chip" onclick="paQuick(\'' + x.id + '\',\'t\')">Free trial 14 days</button><button class="chip" onclick="paQuick(\'' + x.id + '\',\'m\')">Paid: 1 month · 250</button><button class="chip" onclick="paQuick(\'' + x.id + '\',\'q\')">Paid: 1 term · 700</button></div><span class="badge ' + (x.status === 'suspended' ? 'b' : '') + '">' + E(x.status) + '</span><button class="chip" onclick="paStatus(\'' + x.id + '\',\'' + (x.status === 'suspended' ? 'active' : 'suspended') + '\')">' + (x.status === 'suspended' ? 'Reactivate' : 'Suspend') + '</button></div>';
    }).join('') || '<div class="m">No schools yet.</div>') + '</div>';
    if (PA.S.length) h += '<details class="card"><summary><b>Advanced: set dates by hand</b></summary><label class="l">School</label><select class="in" id="pa_s">' + op(so) + '</select><label class="l">Plan</label><select class="in" id="pa_p">' + op(po) + '</select><label class="l">Status</label><select class="in" id="pa_x">' + ['trial', 'active', 'past_due', 'suspended', 'cancelled'].map(x => '<option>' + x + '</option>').join('') + '</select><label class="l">Trial ends</label><input class="in" id="pa_t" type="datetime-local"><label class="l">Renews on</label><input class="in" id="pa_r" type="date"><button class="btn" style="margin-top:14px" onclick="paSub()">Save</button></details>';
  }
  if (PA.tab === 'p') {
    const p = PA.EP || {};
    h += '<div class="card"><h3>' + (PA.EP ? 'Edit plan' : 'New plan') + '</h3><label class="l">Plan name</label><input class="in" id="pl_n" value="' + E(p.name || '') + '"><label class="l">Price (GH₵)</label><input class="in" id="pl_p" inputmode="decimal" value="' + (p.price_minor != null ? Math.floor(p.price_minor / 100) + '.' + String(p.price_minor % 100).padStart(2, '0') : '') + '"><label class="l">Billing interval</label><select class="in" id="pl_i">' + ['month', 'term', 'year'].map(x => '<option' + (p.billing_interval === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select><label class="l">Trial days</label><input class="in" id="pl_t" inputmode="numeric" value="' + (p.trial_days ?? 14) + '"><label class="l">Max active students (blank = unlimited)</label><input class="in" id="pl_m" inputmode="numeric" value="' + (p.max_students ?? '') + '"><label class="l">Max staff (blank = unlimited)</label><input class="in" id="pl_f" inputmode="numeric" value="' + (p.max_staff ?? '') + '">' +
      '<label class="l"><input type="checkbox" id="pl_sm"' + (p.sms_enabled === false ? '' : ' checked') + '> SMS included</label><label class="l"><input type="checkbox" id="pl_a"' + (p.active === false ? '' : ' checked') + '> Active</label><label class="l"><input type="checkbox" id="pl_d"' + (p.is_default ? ' checked' : '') + '> Default plan for new schools</label><button class="btn" style="margin-top:14px" onclick="paPlan()">Save plan</button></div>' +
      '<div class="card"><h3>Plans</h3>' + (PA.PL.map(x => '<div class="row"><div class="t"><b>' + E(x.name) + '</b>' + (x.is_default ? ' <span class="badge">default</span>' : '') + (x.active === false ? ' <span class="badge b">off</span>' : '') + '<span class="m">' + (x.max_students || 'unlimited') + ' students · ' + (x.max_staff || 'unlimited') + ' staff · trial ' + (x.trial_days || 0) + ' days · SMS ' + (x.sms_enabled ? 'yes' : 'no') + '</span></div><b>' + fm(x.price_minor) + '/' + E(x.billing_interval) + '</b><button class="chip" onclick="paEdit(\'' + x.id + '\')">Edit</button></div>').join('') || '<div class="m">No plans yet.</div>') + '</div>';
  }
  if (PA.tab === 'b') {
    h += (PA.S.length ? '<div class="card"><h3>Record subscription payment</h3><div class="m">Leave the dates blank to extend the school by one plan period from today (or from its current renewal date).</div><label class="l">School</label><select class="in" id="pb_s">' + op(so) + '</select><label class="l">Amount (GH₵)</label><input class="in" id="pb_a" inputmode="decimal"><label class="l">Reference (MoMo / cash receipt)</label><input class="in" id="pb_r"><label class="l">Period from</label><input class="in" id="pb_f" type="date"><label class="l">Period to</label><input class="in" id="pb_t" type="date"><label class="l">Note</label><input class="in" id="pb_n"><button class="btn" style="margin-top:14px" onclick="paPay()">Save subscription payment</button></div>' : '') +
      '<div class="card"><h3>Billing history</h3>' + (PA.B.map(x => '<div class="row"><div class="t"><b>' + E(x.school) + '</b><span class="m">' + E((x.created_at || '').slice(0, 10)) + ' · ' + E(x.reference || '') + ' · ' + E(x.period_start || '') + ' to ' + E(x.period_end || '') + '</span></div><b>' + fm(x.amount_minor) + '</b></div>').join('') || '<div class="m">No payments yet.</div>') + '</div>';
  }
  return h;
};

/* Show/hide password eye on every password box */
(function () {
  function eyes() {
    document.querySelectorAll('input[type=password]:not([data-eye])').forEach(i => {
      i.setAttribute('data-eye', '1');
      const w = document.createElement('span'); w.className = 'pw';
      i.parentNode.insertBefore(w, i); w.appendChild(i);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'eye'; b.setAttribute('aria-label', 'Show password'); b.textContent = '👁';
      b.onclick = () => { const s = i.type === 'password'; i.type = s ? 'text' : 'password'; b.textContent = s ? '🙈' : '👁'; b.setAttribute('aria-label', s ? 'Hide password' : 'Show password'); };
      w.appendChild(b);
    });
  }
  try { new MutationObserver(eyes).observe(document.body, { childList: true, subtree: true }); eyes(); } catch (e) { }
})();

boot();
if('serviceWorker' in navigator&&location.protocol.startsWith('http')){addEventListener('load',function(){navigator.serviceWorker.register('sw.js',{scope:'./'}).catch(function(){})})}
