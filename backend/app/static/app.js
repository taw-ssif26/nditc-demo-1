'use strict';
const root = document.getElementById('root');
const h = (t, a = {}, ...c) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (v == null || v === false) continue; k.startsWith('on') ? e.addEventListener(k.slice(2), v) : k === 'class' ? e.className = v : e.setAttribute(k, v); } e.append(...c.flat().filter(x => x != null && x !== false)); return e; };
async function api(p, o = {}) {
  const r = await fetch('/api' + p, { credentials: 'same-origin', method: o.method || 'GET', body: o.json ? JSON.stringify(o.json) : o.body,
    headers: { 'X-Requested-With': 'nditc', ...(o.json ? { 'Content-Type': 'application/json' } : {}) } });
  if (!r.ok) { let m = 'Something went wrong'; try { const d = (await r.json()).detail; m = typeof d === 'string' ? d : 'Please check the form fields'; } catch {} throw new Error(m); }
  return r.json();
}
const fmt = d => d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
const safe = u => /^https?:\/\//.test(u || '');
const AUD = { public: 'Everyone (public site)', students: 'All students', assigned: 'Selected students only' };
const STUDENT_ONLY = ['session', 'resource', 'notice'];
let ME = null, cur = 'users', STUDENTS = [];
const fail = (el, e) => el.replaceChildren(h('p', { class: 'er' }, e.message));
const render = () => root.replaceChildren(!ME ? (location.hash === '#register' ? register() : login()) : ME.must_change ? changePw(true) : ME.need_2fa ? twofa(true) : ME.role === 'student' ? portal() : admin());
const out = async () => { await api('/auth/logout', { method: 'POST' }); ME = null; render(); };

function login() {
  const em = h('input', { type: 'email', placeholder: 'Email', required: '', autocomplete: 'username' });
  const pw = h('input', { type: 'password', placeholder: 'Password', required: '', autocomplete: 'current-password' });
  const code = h('input', { placeholder: '6-digit code from your authenticator app', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 8, style: 'display:none' });
  const er = h('p', { class: 'er' });
  return h('form', { class: 'login', onsubmit: async e => { e.preventDefault(); try { await api('/auth/login', { method: 'POST', json: { email: em.value, password: pw.value, code: code.value || null } }); ME = await api('/auth/me'); render(); }
    catch (x) { er.textContent = x.message; if (x.message === '2FA code required') { code.style.display = ''; code.focus(); er.textContent = ''; } } } },
    h('h1', {}, 'NDITC'), h('p', { class: 'mt' }, 'Sign in to the portal'), em, pw, code, h('button', { class: 'pri' }, 'Enter'), er,
    h('button', { type: 'button', class: 'lnk', onclick: () => root.replaceChildren(register()) }, 'New student? Create an account'));
}

function register() {
  const F = (ph, type = 'text', extra = {}) => h('input', { placeholder: ph, type, required: '', ...extra });
  const name = F('Full name', 'text', { maxlength: 120, autocomplete: 'name' }), em = F('Email', 'email', { autocomplete: 'email' }), info = F('Class / roll / section (so admins can verify you)', 'text', { maxlength: 200 });
  const pw = F('Choose a password (10+ characters)', 'password', { minlength: 10, autocomplete: 'new-password' }), pw2 = F('Repeat the password', 'password', { minlength: 10, autocomplete: 'new-password' });
  const trap = h('input', { name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }), er = h('p', { class: 'er' });
  return h('form', { class: 'login', onsubmit: async e => { e.preventDefault(); if (pw.value !== pw2.value) { er.textContent = 'The two passwords do not match.'; return; }
    try { const r = await api('/auth/register', { method: 'POST', json: { name: name.value, email: em.value, info: info.value, password: pw.value, website: trap.value } });
      root.replaceChildren(h('div', { class: 'login' }, h('h1', {}, 'Thanks'), h('p', {}, r.message), h('button', { class: 'pri', onclick: () => { location.hash = ''; render(); } }, 'Back to sign in'))); }
    catch (x) { er.textContent = x.message; } } },
    h('h1', {}, 'NDITC'), h('p', { class: 'mt' }, 'Create your student account. An admin approves it before you can sign in.'), name, em, info, pw, pw2,
    h('div', { style: 'position:absolute;left:-9999px' }, trap), h('button', { class: 'pri' }, 'Request access'), er,
    h('button', { type: 'button', class: 'lnk', onclick: () => { location.hash = ''; render(); } }, 'I already have an account'));
}

function changePw(forced) {
  const cur = h('input', { type: 'password', placeholder: 'Current password', required: '', autocomplete: 'current-password' });
  const nw = h('input', { type: 'password', placeholder: 'New password (10+ characters)', required: '', minlength: 10, autocomplete: 'new-password' });
  const er = h('p', { class: 'er' });
  return h('form', { class: forced ? 'gate' : 'sec', onsubmit: async e => { e.preventDefault(); try { await api('/auth/password', { method: 'POST', json: { current: cur.value, new: nw.value } }); ME = await api('/auth/me'); forced ? render() : (er.className = 'mt', er.textContent = 'Password changed.'); } catch (x) { er.textContent = x.message; } } },
    h('h2', {}, forced ? 'Choose your own password' : 'Change password'), forced && h('p', { class: 'mt' }, 'You are using a temporary password. Set a new one to continue.'), cur, nw, h('button', { class: 'pri' }, 'Save password'), er);
}

function twofa(forced) {
  const box = h('div'), code = h('input', { placeholder: '6-digit code', inputmode: 'numeric', maxlength: 8 }), er = h('p', { class: 'er' });
  const el = h('div', { class: forced ? 'gate' : 'sec' }, h('h2', {}, 'Two-factor authentication'), box);
  if (ME.totp_on) { box.append(h('p', { class: 'mt' }, 'Two-factor authentication is ON for your account.')); return el; }
  box.append(h('p', { class: 'mt' }, forced ? 'Admins must use an authenticator app (Google Authenticator, Authy, Aegis…).' : 'Add an extra login step.'),
    h('button', { class: 'pri', onclick: async () => { try { const r = await api('/auth/2fa/setup', { method: 'POST' });
      box.replaceChildren(h('p', {}, 'In your authenticator app choose “Enter a setup key” and type this key:'), h('div', { class: 'box' }, r.secret), h('p', { class: 'mt' }, 'Account: ' + ME.email + ' · Type: time-based'),
        code, h('button', { class: 'pri', onclick: async () => { try { await api('/auth/2fa/enable', { method: 'POST', json: { code: code.value } }); ME = await api('/auth/me'); render(); } catch (x) { er.textContent = x.message; } } }, 'Turn on'), er);
    } catch (x) { er.textContent = x.message; } } }, 'Start setup'), er);
  return el;
}

/* ---------- student portal ---------- */
function portal() {
  const main = h('div', { class: 'wrap' }); let tab = 'Upcoming', data = [];
  const card = e => h('article', { class: 'card' }, h('h3', {}, e.title), e.date && h('p', { class: 'mt' }, fmt(e.date)), e.body && h('p', {}, e.body),
    safe(e.link) && h('p', {}, h('a', { href: e.link, target: '_blank', rel: 'noopener noreferrer' }, 'Open link')),
    e.files.length ? h('ul', {}, e.files.map(f => h('li', {}, h('a', { href: '/api/files/' + f.id }, f.name)))) : null);
  const T = { Upcoming: e => ['session', 'event'].includes(e.kind) && e.date && new Date(e.date) >= new Date(), Recordings: e => e.kind === 'session' && !(e.date && new Date(e.date) >= new Date()),
    Resources: e => e.kind === 'resource', Notices: e => e.kind === 'notice' };
  const tabs = h('div', { class: 'tabs' });
  const draw = () => {
    tabs.replaceChildren(...Object.keys(T).map(t => h('button', { class: t === tab ? 'on' : '', onclick: () => { tab = t; draw(); } }, t)));
    let rows = data.filter(T[tab]); if (tab === 'Upcoming') rows.reverse();
    main.replaceChildren(...(rows.length ? rows.map(card) : [h('p', { class: 'mt' }, 'Nothing here yet.')]));
  };
  api('/student/feed').then(d => { data = d; draw(); }).catch(e => fail(main, e));
  return h('div', {}, h('div', { class: 'top' }, h('b', {}, 'NDITC · ' + ME.name), h('span', {}, h('button', { onclick: () => { cur = 'account'; main.replaceChildren(h('div', {}, changePw(false))); } }, 'Change password'), ' ', h('button', { onclick: out }, 'Sign out'))), tabs, main);
}

/* ---------- admin ---------- */
const SEC = [['Students', 'users'], ['Approvals', 'approvals'], ['Sessions & recordings', 'session'], ['Resources', 'resource'], ['Notices', 'notice'], ['Events', 'event'], ['Departments', 'department'],
  ['Activities', 'activity'], ['Why join', 'why'], ['Projects', 'project'], ['Executives', 'executive'], ['Publications', 'publication'], ['Blog', 'blog'],
  ['Timeline', 'timeline'], ['Numbers', 'stat'], ['Page text', 'page'], ['My account', 'account'], ['Admins', 'admins', 1], ['Activity log', 'audit', 1]];
function admin() {
  const main = h('main');
  const side = h('nav', { class: 'side' }, h('b', {}, 'NDITC Admin'),
    SEC.filter(s => !s[2] || ME.role === 'super').map(s => h('button', { 'data-k': s[1], class: s[1] === cur ? 'on' : '', onclick: () => { cur = s[1]; PAGE = 0; Q = ''; render(); } }, s[0])),
    h('button', { onclick: out }, 'Sign out'));
  api('/admin/pending').then(r => { const b = side.querySelector('[data-k=approvals]'); if (b && r.count) b.textContent = `Approvals (${r.count})`; }).catch(() => {});
  (cur === 'users' || cur === 'admins' ? people(main, cur === 'users' ? 'student' : 'admin') : cur === 'approvals' ? approvals(main) : cur === 'audit' ? logView(main) : cur === 'account' ? account(main) : entries(main, cur)).catch(e => fail(main, e));
  return h('div', { class: 'shell' }, side, main);
}
const title = k => SEC.find(s => s[1] === k)[0];

let PAGE = 0, Q = '', FLASH = '';  // FLASH carries a one-time password message across the re-render
async function entries(m, kind) {
  const L = 50, r = await api(`/admin/entries?kind=${kind}&q=${encodeURIComponent(Q)}&limit=${L}&offset=${PAGE * L}`);
  const srch = h('input', { class: 'srch', placeholder: 'Search title…', value: Q, onkeydown: e => { if (e.key === 'Enter') { Q = e.target.value; PAGE = 0; render(); } } });
  m.replaceChildren(h('div', { class: 'bar' }, h('h2', {}, title(kind)), h('button', { class: 'pri', onclick: () => form(kind) }, '+ Add new')), srch,
    h('table', {}, h('tr', {}, ['Title', 'Date', 'Shown to', 'Live', ''].map(x => h('th', {}, x))),
      r.items.map(e => h('tr', {}, h('td', {}, e.title), h('td', {}, fmt(e.date)), h('td', {}, AUD[e.audience]), h('td', {}, e.published ? 'Yes' : 'Hidden'),
        h('td', {}, h('button', { onclick: () => form(kind, e) }, 'Edit'),
          h('button', { class: 'dn', onclick: async () => { if (confirm('Delete "' + e.title + '"?')) { await api('/admin/entries/' + e.id, { method: 'DELETE' }); render(); } } }, 'Delete'))))),
    pager(r.total, L));
}
const pager = (total, L) => h('div', { class: 'pg' }, h('button', { disabled: PAGE ? null : '', onclick: () => { PAGE--; render(); } }, '← Prev'), h('span', { class: 'mt' }, `${total ? PAGE * L + 1 : 0}–${Math.min(total, PAGE * L + L)} of ${total}`),
  h('button', { disabled: (PAGE + 1) * L < total ? null : '', onclick: () => { PAGE++; render(); } }, 'Next →'));
const account = async m => { m.replaceChildren(h('h2', {}, 'My account'), changePw(false), twofa(false)); };

async function form(kind, e) {
  const isNew = !e;
  e = e || { title: '', body: '', link: '', date: null, audience: STUDENT_ONLY.includes(kind) ? 'students' : 'public', published: true, position: 0, image: '', files: [], user_ids: [] };
  if (!STUDENTS.length) STUDENTS = (await api('/admin/users?role=student&limit=200')).items;
  const loc = e.date ? new Date(new Date(e.date).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
  const f = {
    title: h('input', { value: e.title, required: '', maxlength: 300 }), body: h('textarea', { maxlength: 20000 }, e.body),
    link: h('input', { value: e.link, placeholder: 'https://…  (video recording, meeting, website)' }), date: h('input', { type: 'datetime-local', value: loc }),
    aud: h('select', {}, Object.entries(AUD).filter(([k]) => !(STUDENT_ONLY.includes(kind) && k === 'public')).map(([k, v]) => h('option', { value: k, ...(k === e.audience ? { selected: '' } : {}) }, v))),
    pub: h('input', { type: 'checkbox', ...(e.published ? { checked: '' } : {}) }), pos: h('input', { type: 'number', value: e.position }),
    img: h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' }), files: h('input', { type: 'file', multiple: '' })
  };
  f.body.value = e.body;
  const pick = h('div', { class: 'picker' }, STUDENTS.map(s => h('label', {}, h('input', { type: 'checkbox', value: s.id, ...(e.user_ids.includes(s.id) ? { checked: '' } : {}) }), s.name + ' (' + s.email + ')')));
  const pw = h('div', {}, h('label', {}, 'Choose students'), pick); const sync = () => pw.style.display = f.aud.value === 'assigned' ? '' : 'none'; f.aud.onchange = sync; sync();
  const er = h('p', { class: 'er' }), bg = h('div', { class: 'modal' });
  const up = async (file, id, pub) => { const fd = new FormData(); fd.append('file', file); return api(`/admin/upload?${id ? 'entry_id=' + id + '&' : ''}public=${pub}`, { method: 'POST', body: fd }); };
  const form = h('form', { onsubmit: async ev => {
    ev.preventDefault(); er.textContent = 'Saving…';
    try {
      const body = { kind, title: f.title.value, body: f.body.value, link: f.link.value, date: f.date.value ? new Date(f.date.value).toISOString() : null, audience: f.aud.value, published: f.pub.checked, position: +f.pos.value || 0, image: e.image };
      const s = await api(isNew ? '/admin/entries' : '/admin/entries/' + e.id, { method: isNew ? 'POST' : 'PUT', json: body });
      if (f.img.files[0]) { const u = await up(f.img.files[0], null, true); await api('/admin/entries/' + s.id, { method: 'PUT', json: { ...body, image: u.url } }); }
      for (const file of f.files.files) await up(file, s.id, false);
      if (f.aud.value === 'assigned') await api(`/admin/entries/${s.id}/assign`, { method: 'PUT', json: { user_ids: [...pick.querySelectorAll('input:checked')].map(i => +i.value) } });
      bg.remove(); render();
    } catch (x) { er.textContent = x.message; }
  } },
    h('h2', {}, (isNew ? 'Add to ' : 'Edit ') + title(kind)),
    h('label', {}, 'Title'), f.title, h('label', {}, 'Text'), f.body, h('label', {}, 'Link'), f.link, h('label', {}, 'Date and time'), f.date,
    h('label', {}, 'Who can see it'), f.aud, pw, h('label', { class: 'chk' }, f.pub, 'Visible on the site'), h('label', {}, 'Order (small numbers first)'), f.pos,
    h('label', {}, 'Image' + (e.image ? ' (current one is kept unless you pick a new one)' : '')), f.img,
    h('label', {}, 'Attach files (PDF, Word, Excel, PowerPoint, images, text; 20 MB each)'), f.files,
    e.files.length ? h('ul', {}, e.files.map(x => h('li', {}, x.name + ' ', h('button', { type: 'button', class: 'dn', onclick: async ev => { await api('/admin/files/' + x.id, { method: 'DELETE' }); ev.target.parentElement.remove(); } }, 'Remove')))) : null,
    h('div', { class: 'row' }, h('button', { class: 'pri' }, 'Save'), h('button', { type: 'button', onclick: () => bg.remove() }, 'Cancel')), er);
  bg.append(form); document.body.append(bg);
}

async function people(m, role) {
  const r = await api(`/admin/users?role=${role}&q=${encodeURIComponent(Q)}&limit=50&offset=${PAGE * 50}`), rows = r.items, box = h('div');
  const show = t => box.replaceChildren(h('div', { class: 'box' }, t + '\n\nCopy the passwords now. They are not shown again.'));
  const nm = h('input', { placeholder: 'Full name' }), em = h('input', { type: 'email', placeholder: 'Email' }), csv = h('input', { type: 'file', accept: '.csv' });
  const add = async () => { try { const u = await api('/admin/users', { method: 'POST', json: { name: nm.value, email: em.value, role } }); FLASH = `${u.email}  →  ${u.password}`; render(); } catch (x) { fail(box, x); } };
  const imp = async () => { if (!csv.files[0]) return; const fd = new FormData(); fd.append('file', csv.files[0]); try { const r = await api('/admin/users/import', { method: 'POST', body: fd }); FLASH = r.length + ' students added\n' + r.map(u => `${u.email}  →  ${u.password}`).join('\n'); render(); } catch (x) { fail(box, x); } };
  m.replaceChildren(h('h2', {}, role === 'student' ? 'Students' : 'Admins'),
    h('div', { class: 'row' }, nm, em, h('button', { class: 'pri', onclick: add }, 'Add')),
    h('input', { class: 'srch', placeholder: 'Search name or email…', value: Q, onkeydown: e => { if (e.key === 'Enter') { Q = e.target.value; PAGE = 0; render(); } } }),
    role === 'student' ? h('div', { class: 'row' }, h('div', {}, h('label', {}, 'Bulk add: CSV file with columns name,email'), csv), h('button', { onclick: imp }, 'Import')) : null, box,
    h('table', {}, h('tr', {}, ['Name', 'Email', 'Status', ''].map(x => h('th', {}, x))), rows.map(u => h('tr', {}, h('td', {}, u.name), h('td', {}, u.email), h('td', {}, u.active ? 'Active' : 'Disabled'),
      h('td', {}, h('button', { onclick: async () => { const r = await api('/admin/users/' + u.id, { method: 'PUT', json: { reset: true } }); show(`${u.email}  →  ${r.password}`); } }, 'New password'),
        h('button', { onclick: async () => { await api('/admin/users/' + u.id, { method: 'PUT', json: { active: !u.active } }); render(); } }, u.active ? 'Disable' : 'Enable'),
        h('button', { class: 'dn', onclick: async () => { if (confirm('Delete ' + u.name + '?')) { await api('/admin/users/' + u.id, { method: 'DELETE' }); render(); } } }, 'Delete'), ME.role === 'super' && role === 'admin' ? h('button', { onclick: async () => { await api('/admin/users/' + u.id, { method: 'PUT', json: { reset2fa: true } }); alert('2FA reset. They must set it up again at next login.'); } }, 'Reset 2FA') : null)))), pager(r.total, 50));
  if (FLASH) { show(FLASH); FLASH = ''; }
}

let AP = 'pending';
async function approvals(m) {
  const r = await api(`/admin/users?role=student&status=${AP}&limit=100`);
  const act = async (ids, action) => { await api('/admin/users/review', { method: 'POST', json: { ids, action } }); render(); };
  const tab = (k, l) => h('button', { class: k === AP ? 'on' : '', onclick: () => { AP = k; render(); } }, l);
  m.replaceChildren(h('h2', {}, 'Student approvals'), h('p', { class: 'mt' }, 'Students register themselves. Check the name and class/roll, then approve.'),
    h('div', { class: 'tabs' }, tab('pending', 'Pending'), tab('rejected', 'Rejected')),
    r.items.length ? h('table', {}, h('tr', {}, ['', 'Name', 'Email', 'Class / roll', 'Requested', ''].map(x => h('th', {}, x))),
      r.items.map(u => h('tr', {}, h('td', {}, h('input', { type: 'checkbox', class: 'ck', value: u.id })), h('td', {}, u.name), h('td', {}, u.email), h('td', {}, u.info), h('td', {}, fmt(u.created)),
        h('td', {}, h('button', { class: 'pri', onclick: () => act([u.id], 'approve') }, 'Approve'),
          AP === 'pending' ? h('button', { class: 'dn', onclick: () => act([u.id], 'reject') }, 'Reject')
            : h('button', { class: 'dn', onclick: async () => { if (confirm('Delete ' + u.name + '?')) { await api('/admin/users/' + u.id, { method: 'DELETE' }); render(); } } }, 'Delete'))))) : h('p', { class: 'mt' }, 'Nothing here.'),
    r.items.length && AP === 'pending' ? h('div', { class: 'row' }, h('button', { class: 'pri', onclick: () => { const ids = [...m.querySelectorAll('.ck:checked')].map(i => +i.value); if (ids.length) act(ids, 'approve'); } }, 'Approve selected'),
      h('button', { onclick: () => m.querySelectorAll('.ck').forEach(c => c.checked = true) }, 'Select all')) : null);
}

async function logView(m) {
  const rows = await api('/admin/audit');
  m.replaceChildren(h('h2', {}, 'Activity log'), h('table', {}, h('tr', {}, ['When', 'Who', 'What'].map(x => h('th', {}, x))), rows.map(r => h('tr', {}, h('td', {}, fmt(r.at)), h('td', {}, r.who), h('td', {}, r.action)))));
}

api('/auth/me').then(u => ME = u).catch(() => ME = null).finally(render);
