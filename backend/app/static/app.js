'use strict';
// Never print the word "null": drop empty slots whenever a view is drawn with replaceChildren.
{ const rc = Element.prototype.replaceChildren; Element.prototype.replaceChildren = function (...c) { return rc.apply(this, c.flat().filter(x => x != null && x !== false)); }; }
const root = document.getElementById('root');
const h = (t, a = {}, ...c) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (v == null || v === false) continue; k.startsWith('on') ? e.addEventListener(k.slice(2), v) : k === 'class' ? e.className = v : e.setAttribute(k, v); } e.append(...c.flat().filter(x => x != null && x !== false)); return e; };
async function api(p, o = {}) {
  const r = await fetch('/api' + p, { credentials: 'same-origin', method: o.method || 'GET', body: o.json ? JSON.stringify(o.json) : o.body,
    headers: { 'X-Requested-With': 'nditc', ...(o.json ? { 'Content-Type': 'application/json' } : {}) } });
  if (!r.ok) { let m = 'Something went wrong'; try { const d = (await r.json()).detail; m = typeof d === 'string' ? d : Array.isArray(d) ? d.map(x => String(x.msg || '').replace(/^Value error, /, '')).join('; ') : 'Please check the form fields'; } catch {} throw new Error(m); }
  return r.json();
}
const fmt = d => d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
const safe = u => /^https?:\/\//.test(u || '');
const EVAUD = { public: 'Public: on the website, anyone can register', students: 'Students only: portal, approved students', assigned: 'Selected students only (invite)' }, EVSHORT = { public: 'Public', students: 'Students only', assigned: 'Invite only' };
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
/* ---------- shared: question renderer (quizzes, forms, event registration) ---------- */
function qForm(qs) {
  const get = {};
  const el = h('div', { class: 'qs' }, qs.map((q, i) => {
    let inp;
    if (q.type === 'short') { inp = h('input', { maxlength: 500 }); get[q.id] = () => inp.value.trim(); }
    else if (q.type === 'long') { inp = h('textarea', { maxlength: 5000 }); get[q.id] = () => inp.value.trim(); }
    else if (q.type === 'number') { inp = h('input', { type: 'number', step: 'any', inputmode: 'decimal' }); get[q.id] = () => inp.value === '' ? null : Number(inp.value); }
    else if (q.type === 'rating') { let v = null; const bs = [1, 2, 3, 4, 5].map(n => h('button', { type: 'button', 'aria-label': n + ' of 5', onclick: () => { v = n; bs.forEach((x, j) => x.classList.toggle('on', j < n)); } }, '★')); inp = h('div', { class: 'stars' }, bs); get[q.id] = () => v; }
    else { const multi = q.type === 'multi', boxes = q.options.map((o, j) => h('label', { class: 'opt' }, h('input', { type: multi ? 'checkbox' : 'radio', name: 'q' + q.id, value: j }), o));
      inp = h('div', { class: 'opts' }, boxes); get[q.id] = () => { const c = boxes.map(l => l.firstChild).filter(x => x.checked).map(x => +x.value); return multi ? (c.length ? c : null) : (c.length ? c[0] : null); }; }
    return h('div', { class: 'qn' }, h('p', { class: 'qt' }, `${i + 1}. ${q.text}`, q.required ? h('span', { class: 'er' }, ' *') : null, q.points ? h('span', { class: 'mt' }, ` (${q.points} pt${q.points > 1 ? 's' : ''})`) : null), inp);
  }));
  return { el, collect: () => Object.fromEntries(qs.map(q => [String(q.id), get[q.id]()]).filter(([, v]) => v !== null && v !== '')) };
}
const popup = (...c) => { const bg = h('div', { class: 'modal' }); bg.append(h('div', { class: 'dlg' }, ...c, h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => bg.remove() }, 'Close')))); document.body.append(bg); return bg; };

/* ---------- student portal ---------- */
function portal() {
  const main = h('div', { class: 'wrap' }), tabs = h('div', { class: 'tabs' }); let tab = 'Events', feed = null;
  const NAMES = ['Events', 'Quizzes & forms', 'Sessions', 'Recordings', 'Resources', 'Notices'];
  const card = e => h('article', { class: 'card' }, h('h3', {}, e.title), e.date && h('p', { class: 'mt' }, fmt(e.date)), e.body && h('p', {}, e.body),
    safe(e.link) && h('p', {}, h('a', { href: e.link, target: '_blank', rel: 'noopener noreferrer' }, 'Open link')),
    e.files.length ? h('ul', {}, e.files.map(f => h('li', {}, h('a', { href: '/api/files/' + f.id }, f.name)))) : null);
  const T = { Sessions: e => e.kind === 'session' && e.date && new Date(e.date) >= new Date(), Recordings: e => e.kind === 'session' && !(e.date && new Date(e.date) >= new Date()), Resources: e => e.kind === 'resource', Notices: e => e.kind === 'notice' };
  const draw = async () => {
    tabs.replaceChildren(...NAMES.map(t => h('button', { class: t === tab ? 'on' : '', onclick: () => { tab = t; draw(); } }, t)));
    main.replaceChildren(h('p', { class: 'mt' }, 'Loading…'));
    try {
      if (tab === 'Events') return events(main, draw);
      if (tab === 'Quizzes & forms') return formsTab(main, draw);
      if (!feed) feed = await api('/student/feed');
      let rows = feed.filter(T[tab]); if (tab === 'Sessions') rows.reverse();
      main.replaceChildren(...(rows.length ? rows.map(card) : [h('p', { class: 'mt' }, 'Nothing here yet.')]));
    } catch (x) { fail(main, x); }
  };
  draw();
  return h('div', {}, h('div', { class: 'top' }, h('b', {}, 'NDITC · ' + ME.name), h('span', {}, h('button', { onclick: () => { cur = 'account'; main.replaceChildren(h('div', {}, changePw(false))); } }, 'Change password'), ' ', h('button', { onclick: out }, 'Sign out'))), tabs, main);
}

async function events(main, redraw) {
  const list = await api('/student/events');
  const join = async e => {
    if (!e.form) { try { await api(`/student/events/${e.id}/register`, { method: 'POST', json: { answers: {} } }); redraw(); } catch (x) { alert(x.message); } return; }
    const qf = qForm(e.form.questions), er = h('p', { class: 'er' });
    const bg = popup(h('h2', {}, 'Register: ' + e.title), e.form.description && h('p', { class: 'mt' }, e.form.description), qf.el,
      h('div', { class: 'row' }, h('button', { class: 'pri', onclick: async () => { try { await api(`/student/events/${e.id}/register`, { method: 'POST', json: { answers: qf.collect() } }); bg.remove(); redraw(); } catch (x) { er.textContent = x.message; } } }, e.full ? 'Join waitlist' : 'Submit and register')), er);
  };
  const leave = async e => { if (confirm('Cancel your registration for "' + e.title + '"?')) { await api(`/student/events/${e.id}/register`, { method: 'DELETE' }); redraw(); } };
  const cardE = e => {
    const m = e.mine, seats = e.capacity ? `${Math.min(e.taken, e.capacity)} of ${e.capacity} seats taken` : `${e.taken} registered`;
    const act = m ? h('button', { class: 'dn', onclick: () => leave(e) }, m.status === 'waitlist' ? 'Leave waitlist' : 'Cancel registration')
      : (e.closed_reason || e.over) ? h('p', { class: 'mt' }, e.closed_reason || 'This event has ended')
      : h('button', { class: 'pri', onclick: () => join(e) }, e.full ? 'Join waitlist' : 'Register');
    return h('article', { class: 'card' }, e.image && h('img', { src: e.image, alt: '' }), h('h3', {}, e.title), h('span', { class: 'chip' }, e.audience === 'public' ? 'Public event' : e.audience === 'students' ? 'Students only' : 'Invite only'),
      h('p', { class: 'mt' }, (e.date ? fmt(e.date) + (e.end_date ? ' → ' + fmt(e.end_date) : '') : 'Date to be announced') + (e.location ? ' · ' + e.location : '')),
      e.body && h('p', {}, e.body), h('p', { class: 'mt' }, seats + (e.reg_deadline && e.reg_open ? ' · register by ' + fmt(e.reg_deadline) : '')),
      m && h('p', { class: 'chip ok' }, m.status === 'registered' ? "You're registered ✓" + (m.attended ? ' (attended)' : '') : 'Waitlist, position #' + m.position),
      safe(e.link) && h('p', {}, h('a', { href: e.link, target: '_blank', rel: 'noopener noreferrer' }, 'More info')), act);
  };
  const up = list.filter(e => !e.over), past = list.filter(e => e.over);
  main.replaceChildren(...(up.length ? up.map(cardE) : [h('p', { class: 'mt' }, 'No upcoming events right now. Check back soon.')]), ...(past.length ? [h('h3', { class: 'mt2' }, 'Past events'), ...past.map(cardE)] : []));
}

async function formsTab(main, redraw) {
  const list = await api('/student/forms');
  const badge = f => f.done ? h('span', { class: 'chip ok' }, 'Done ✓') : f.state === 'open' ? h('span', { class: 'chip' }, 'Open') : f.state === 'upcoming' ? h('span', { class: 'chip' }, 'Opens ' + fmt(f.opens_at)) : h('span', { class: 'chip' }, 'Closed');
  main.replaceChildren(...(list.length ? list.map(f => h('article', { class: 'card' }, h('h3', {}, f.title), h('p', { class: 'mt' }, (f.kind === 'quiz' ? 'Quiz' : 'Form') + ` · ${f.questions} question${f.questions === 1 ? '' : 's'}` + (f.time_limit ? ` · ${f.time_limit} min limit` : '') + (f.closes_at ? ' · closes ' + fmt(f.closes_at) : '')),
    f.description && h('p', {}, f.description), badge(f), f.score != null ? h('p', { class: 'chip ok' }, `Score: ${f.score} / ${f.max}`) : null,
    f.done ? h('p', {}, h('button', { onclick: () => result(main, f, redraw) }, 'View result')) : f.state === 'open' ? h('p', {}, h('button', { class: 'pri', onclick: () => takeForm(main, f, redraw) }, f.kind === 'quiz' ? 'Start quiz' : 'Fill in'),
      f.one_response && f.kind === 'quiz' ? h('span', { class: 'mt' }, ' one attempt only') : null) : null)) : [h('p', { class: 'mt' }, 'No quizzes or forms yet.')]));
}

async function takeForm(main, f, redraw) {
  let r; try { r = await api(`/student/forms/${f.id}/start`, { method: 'POST' }); } catch (x) { alert(x.message); return redraw(); }
  const qf = qForm(r.questions), er = h('p', { class: 'er' }), timer = h('b', { class: 'timer' }); let tick = 0, sent = false;
  const send = async partial => {
    if (sent) return; er.textContent = '';
    try { const res = await api(`/student/forms/${f.id}/submit`, { method: 'POST', json: { answers: qf.collect(), partial: !!partial } }); sent = true; clearInterval(tick); result(main, f, redraw, res); }
    catch (x) { er.textContent = x.message; scrollTo(0, document.body.scrollHeight); }
  };
  if (r.deadline) { const end = new Date(r.deadline).getTime(), upd = () => { const s = Math.max(0, Math.round((end - Date.now()) / 1000)); timer.textContent = `⏱ ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; timer.classList.toggle('low', s < 60); if (s <= 0) { clearInterval(tick); send(true); } }; upd(); tick = setInterval(upd, 1000); }
  main.replaceChildren(h('article', { class: 'card' }, h('div', { class: 'bar' }, h('h3', {}, f.title), timer), f.description && h('p', { class: 'mt' }, f.description), qf.el,
    h('div', { class: 'row' }, h('button', { class: 'pri', onclick: () => send(false) }, 'Submit'), h('button', { onclick: () => { clearInterval(tick); redraw(); } }, 'Leave (you can come back until time runs out)')), er));
}

async function result(main, f, redraw) {
  const r = await api(`/student/forms/${f.id}/result`);
  main.replaceChildren(h('article', { class: 'card' }, h('h3', {}, f.title), h('p', { class: 'chip ok' }, 'Submitted ✓' + (r.late ? ' (after the time limit)' : '')),
    r.score != null ? h('p', { class: 'big2' }, `${r.score} / ${r.max}`) : h('p', { class: 'mt' }, 'Your answers were recorded.'),
    r.review ? h('div', {}, r.review.map(x => h('div', { class: 'qn' }, h('p', { class: 'qt' }, x.q), h('p', { class: x.right === false ? 'er' : 'mt' }, 'Your answer: ' + (x.yours || '(blank)') + (x.right === true ? ' ✓' : x.right === false ? ' ✗' : '')),
      x.right === false && x.correct ? h('p', { class: 'mt' }, 'Correct: ' + x.correct) : null, x.explanation ? h('p', { class: 'mt' }, x.explanation) : null))) : null,
    h('p', {}, h('button', { onclick: redraw }, '← Back'))));
}

const SEC = [['Students', 'users'], ['Approvals', 'approvals'], ['Sessions & recordings', 'session'], ['Resources', 'resource'], ['Notices', 'notice'], ['Events', 'event'], ['Forms & quizzes', 'forms'], ['Departments', 'department'],
  ['Activities', 'activity'], ['Why join', 'why'], ['Projects', 'project'], ['Executives', 'executive'], ['Publications', 'publication'], ['Blog', 'blog'],
  ['Timeline', 'timeline'], ['Numbers', 'stat'], ['Page text', 'page'], ['My account', 'account'], ['Admins', 'admins', 1], ['Activity log', 'audit', 1]];
function admin() {
  const main = h('main');
  const side = h('nav', { class: 'side' }, h('b', {}, 'NDITC Admin'),
    SEC.filter(s => !s[2] || ME.role === 'super').map(s => h('button', { 'data-k': s[1], class: s[1] === cur ? 'on' : '', onclick: () => { cur = s[1]; PAGE = 0; Q = ''; render(); } }, s[0])),
    h('button', { onclick: out }, 'Sign out'));
  api('/admin/pending').then(r => { const b = side.querySelector('[data-k=approvals]'); if (b && r.count) b.textContent = `Approvals (${r.count})`; }).catch(() => {});
  (cur === 'users' || cur === 'admins' ? people(main, cur === 'users' ? 'student' : 'admin') : cur === 'approvals' ? approvals(main) : cur === 'forms' ? formsList(main) : cur === 'formedit' ? formEditor(main) : cur === 'formresp' ? formResp(main) : cur === 'eventregs' ? regsView(main) : cur === 'audit' ? logView(main) : cur === 'account' ? account(main) : entries(main, cur)).catch(e => fail(main, e));
  return h('div', { class: 'shell' }, side, main);
}
const title = k => SEC.find(s => s[1] === k)[0];

let PAGE = 0, Q = '', FLASH = '';  // FLASH carries a one-time password message across the re-render
async function entries(m, kind) {
  const L = 50, r = await api(`/admin/entries?kind=${kind}&q=${encodeURIComponent(Q)}&limit=${L}&offset=${PAGE * L}`);
  const srch = h('input', { class: 'srch', placeholder: 'Search title…', value: Q, onkeydown: e => { if (e.key === 'Enter') { Q = e.target.value; PAGE = 0; render(); } } });
  m.replaceChildren(h('div', { class: 'bar' }, h('h2', {}, title(kind)), h('button', { class: 'pri', onclick: () => form(kind) }, '+ Add new')), srch,
    h('table', {}, h('tr', {}, (kind === 'event' ? ['Title', 'Date', 'Who can join', 'Registered', 'Live', ''] : ['Title', 'Date', 'Shown to', 'Live', '']).map(x => h('th', {}, x))),
      r.items.map(e => h('tr', {}, h('td', {}, e.title), h('td', {}, fmt(e.date)), ...(kind === 'event' ? [h('td', {}, EVSHORT[e.audience]), h('td', {}, e.capacity ? `${e.regs} / ${e.capacity}` : String(e.regs || 0))] : [h('td', {}, AUD[e.audience])]), h('td', {}, e.published ? 'Yes' : 'Hidden'),
        h('td', {}, kind === 'event' ? h('button', { onclick: () => { REGEV = e; cur = 'eventregs'; render(); } }, 'Registrations') : null, h('button', { onclick: () => form(kind, e) }, 'Edit'),
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
  const FRM = kind === 'event' ? await api('/admin/forms') : [];
  const loc = e.date ? new Date(new Date(e.date).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
  const f = {
    title: h('input', { value: e.title, required: '', maxlength: 300 }), body: h('textarea', { maxlength: 20000 }, e.body),
    link: h('input', { value: e.link, placeholder: 'https://…  (video recording, meeting, website)' }), date: h('input', { type: 'datetime-local', value: loc }),
    aud: h('select', {}, Object.entries(kind === 'event' ? EVAUD : AUD).filter(([k]) => !(STUDENT_ONLY.includes(kind) && k === 'public')).map(([k, v]) => h('option', { value: k, ...(k === e.audience ? { selected: '' } : {}) }, v))),
    pub: h('input', { type: 'checkbox', ...(e.published ? { checked: '' } : {}) }), pos: h('input', { type: 'number', value: e.position }),
    img: h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' }), files: h('input', { type: 'file', multiple: '' })
  };
  f.body.value = e.body;
  const lt = d => d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
  const evf = kind === 'event' ? { loc: h('input', { value: e.location || '', maxlength: 200, placeholder: 'Room, hall or online link' }), end: h('input', { type: 'datetime-local', value: lt(e.end_date) }), cap: h('input', { type: 'number', min: 1, value: e.capacity || '', placeholder: 'empty = unlimited' }),
    ro: h('input', { type: 'checkbox', ...(e.reg_open ? { checked: '' } : {}) }), rd: h('input', { type: 'datetime-local', value: lt(e.reg_deadline) }),
    fm: h('select', {}, h('option', { value: '' }, 'No form (one-click registration)'), FRM.map(x => h('option', { value: x.id, ...(x.id === e.form_id ? { selected: '' } : {}) }, x.title + (x.kind === 'quiz' ? ' (quiz)' : '')))) } : null;
  const evUI = evf ? [h('label', {}, 'Ends (optional)'), evf.end, h('label', {}, 'Location'), evf.loc, h('label', { class: 'chk' }, evf.ro, 'Students can register'), h('label', {}, 'Seats (leave empty for unlimited; extra students go on a waitlist)'), evf.cap, h('label', {}, 'Registration deadline (optional)'), evf.rd, h('label', {}, 'Registration form (optional)'), evf.fm] : [];
  const pick = h('div', { class: 'picker' }, STUDENTS.map(s => h('label', {}, h('input', { type: 'checkbox', value: s.id, ...(e.user_ids.includes(s.id) ? { checked: '' } : {}) }), s.name + ' (' + s.email + ')')));
  const pw = h('div', {}, h('label', {}, 'Choose students'), pick); const sync = () => pw.style.display = f.aud.value === 'assigned' ? '' : 'none'; f.aud.onchange = sync; sync();
  const er = h('p', { class: 'er' }), bg = h('div', { class: 'modal' });
  const up = async (file, id, pub) => { const fd = new FormData(); fd.append('file', file); return api(`/admin/upload?${id ? 'entry_id=' + id + '&' : ''}public=${pub}`, { method: 'POST', body: fd }); };
  const form = h('form', { onsubmit: async ev => {
    ev.preventDefault(); er.textContent = 'Saving…';
    try {
      const body = { kind, title: f.title.value, body: f.body.value, link: f.link.value, date: f.date.value ? new Date(f.date.value).toISOString() : null, audience: f.aud.value, published: f.pub.checked, position: +f.pos.value || 0, image: e.image,
        ...(evf ? { location: evf.loc.value, end_date: evf.end.value ? new Date(evf.end.value).toISOString() : null, capacity: evf.cap.value ? +evf.cap.value : null, reg_open: evf.ro.checked, reg_deadline: evf.rd.value ? new Date(evf.rd.value).toISOString() : null, form_id: evf.fm.value ? +evf.fm.value : null } : {}) };
      const s = await api(isNew ? '/admin/entries' : '/admin/entries/' + e.id, { method: isNew ? 'POST' : 'PUT', json: body });
      if (f.img.files[0]) { const u = await up(f.img.files[0], null, true); await api('/admin/entries/' + s.id, { method: 'PUT', json: { ...body, image: u.url } }); }
      for (const file of f.files.files) await up(file, s.id, false);
      if (f.aud.value === 'assigned') await api(`/admin/entries/${s.id}/assign`, { method: 'PUT', json: { user_ids: [...pick.querySelectorAll('input:checked')].map(i => +i.value) } });
      bg.remove(); render();
    } catch (x) { er.textContent = x.message; }
  } },
    h('h2', {}, (isNew ? 'Add to ' : 'Edit ') + title(kind)),
    h('label', {}, 'Title'), f.title, h('label', {}, 'Text'), f.body, h('label', {}, 'Link'), f.link, h('label', {}, 'Date and time'), f.date, ...evUI,
    h('label', {}, kind === 'event' ? 'Who can see and join this event' : 'Who can see it'), f.aud, pw, h('label', { class: 'chk' }, f.pub, 'Visible on the site'), h('label', {}, 'Order (small numbers first)'), f.pos,
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

/* ---------- admin: event registrations ---------- */
let REGEV = null, EDITF = null, RESPF = null;
async function regsView(m) {
  const d = await api(`/admin/events/${REGEV.id}/registrations`), c = d.counts;
  m.replaceChildren(h('div', { class: 'bar' }, h('h2', {}, 'Registrations: ' + d.event.title), h('button', { onclick: () => { cur = 'event'; render(); } }, '← Events')),
    h('p', { class: 'mt' }, `${c.registered} registered${d.event.capacity ? ' of ' + d.event.capacity + ' seats' : ''} · ${c.waitlist} on waitlist · ${c.attended} attended`),
    h('div', { class: 'row' }, h('a', { class: 'btn', href: `/api/admin/events/${d.event.id}/registrations.csv` }, 'Download CSV (opens in Excel)')),
    d.items.length ? h('table', {}, h('tr', {}, ['Name', 'Email', 'Phone', 'Class / roll / school', 'Status', 'Attended', ''].map(x => h('th', {}, x))), d.items.map(i => h('tr', {},
      h('td', {}, i.name, ' ', h('span', { class: 'chip' }, i.type === 'guest' ? 'Guest' : 'Student'), i.answers.length ? h('details', {}, h('summary', { class: 'mt' }, 'Answers'), i.answers.map(a => h('div', { class: 'mt' }, a.q + ': ' + a.a))) : null), h('td', {}, i.email), h('td', {}, i.phone || ''), h('td', {}, i.info), h('td', {}, i.status),
      h('td', {}, h('input', { type: 'checkbox', class: 'ck', ...(i.attended ? { checked: '' } : {}), onchange: e => api('/admin/registrations/' + i.id, { method: 'PUT', json: { attended: e.target.checked } }).catch(x => alert(x.message)) })),
      h('td', {}, i.status === 'cancelled' ? null : h('button', { class: 'dn', onclick: async () => { if (confirm('Remove ' + i.name + ' from this event?')) { await api('/admin/registrations/' + i.id, { method: 'PUT', json: { status: 'cancelled' } }); render(); } } }, 'Remove'))))) : h('p', { class: 'mt' }, 'Nobody has registered yet.'));
}

/* ---------- admin: forms & quizzes ---------- */
async function formsList(m) {
  const rows = await api('/admin/forms');
  const st = f => !f.published ? 'Draft' : f.state === 'open' ? 'Live' : f.state === 'upcoming' ? 'Scheduled' : 'Closed';
  m.replaceChildren(h('div', { class: 'bar' }, h('h2', {}, 'Forms & quizzes'), h('span', {}, h('button', { class: 'pri', onclick: () => { EDITF = { kind: 'form' }; cur = 'formedit'; render(); } }, '+ New form'), ' ', h('button', { class: 'pri', onclick: () => { EDITF = { kind: 'quiz' }; cur = 'formedit'; render(); } }, '+ New quiz'))),
    h('p', { class: 'mt' }, 'Build surveys, sign-up forms and graded quizzes without any code. Attach a form to an event under Events → Edit.'),
    rows.length ? h('table', {}, h('tr', {}, ['Title', 'Type', 'Status', 'Questions', 'Responses', ''].map(x => h('th', {}, x))), rows.map(f => h('tr', {}, h('td', {}, f.title), h('td', {}, f.kind === 'quiz' ? 'Quiz' : 'Form'), h('td', {}, st(f)), h('td', {}, String(f.questions)), h('td', {}, String(f.responses)),
      h('td', {}, h('button', { onclick: () => { EDITF = { id: f.id }; cur = 'formedit'; render(); } }, 'Edit'), h('button', { onclick: () => { RESPF = f; cur = 'formresp'; render(); } }, 'Responses'),
        h('button', { class: 'dn', onclick: async () => { if (confirm('Delete "' + f.title + '" and all its responses?')) { await api('/admin/forms/' + f.id, { method: 'DELETE' }); render(); } } }, 'Delete'))))) : h('p', { class: 'mt' }, 'Nothing yet. Create your first form or quiz.'));
}

const QTYPES = [['short', 'Short answer'], ['long', 'Paragraph'], ['single', 'Multiple choice (one answer)'], ['multi', 'Checkboxes (several answers)'], ['rating', 'Rating 1-5'], ['number', 'Number']];
async function formEditor(m) {
  let F = EDITF;
  if (F && F.id && !F.questions) F = await api('/admin/forms/' + F.id);
  F = { title: '', description: '', kind: 'form', audience: 'students', published: false, opens_at: null, closes_at: null, time_limit: null, show_results: 'score', one_response: true, questions: [], user_ids: [], ...F };
  if (!STUDENTS.length) STUDENTS = (await api('/admin/users?role=student&limit=200')).items;
  const lt = d => d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '', choice = t => t === 'single' || t === 'multi', er = h('p', { class: 'er' });
  const qBox = h('div', { class: 'qlist' }), setBox = h('div');
  const mv = (i, d) => { const j = i + d; if (j < 0 || j >= F.questions.length) return; [F.questions[i], F.questions[j]] = [F.questions[j], F.questions[i]]; drawQs(); };
  const qCard = (q, i) => {
    const quiz = F.kind === 'quiz', graded = quiz && q.type !== 'long' && q.type !== 'rating';
    const opts = choice(q.type) ? h('div', {}, q.options.map((o, j) => h('div', { class: 'orow' },
      quiz ? h('input', { type: q.type === 'single' ? 'radio' : 'checkbox', name: 'c' + i, class: 'ck', title: 'Correct answer', ...(q.correct.includes(j) ? { checked: '' } : {}), onchange: e => { q.correct = q.type === 'single' ? [j] : (e.target.checked ? [...q.correct, j] : q.correct.filter(x => x !== j)); } }) : null,
      h('input', { value: o, placeholder: 'Option ' + (j + 1), maxlength: 200, oninput: e => q.options[j] = e.target.value }),
      h('button', { type: 'button', class: 'dn', title: 'Remove option', onclick: () => { q.options.splice(j, 1); q.correct = q.correct.filter(x => x !== j).map(x => x > j ? x - 1 : x); drawQs(); } }, '✕'))),
      h('button', { type: 'button', onclick: () => { q.options.push(''); drawQs(); } }, '+ Add option'), quiz ? h('p', { class: 'mt' }, 'Tick the correct answer(s).') : null) : null;
    const acc = graded && !choice(q.type) ? h('div', {}, h('label', {}, 'Accepted answers (one per line, not case-sensitive)'), h('textarea', { oninput: e => q.correct = e.target.value.split('\n').map(x => x.trim()).filter(Boolean) }, (q.correct || []).join('\n'))) : null;
    if (acc) acc.querySelector('textarea').value = (q.correct || []).join('\n');
    return h('div', { class: 'qcard' }, h('div', { class: 'row' }, h('select', { onchange: e => { q.type = e.target.value; q.correct = []; q.options = choice(q.type) ? (q.options.length >= 2 ? q.options : ['', '']) : []; drawQs(); } }, QTYPES.map(([v, l]) => h('option', { value: v, ...(v === q.type ? { selected: '' } : {}) }, l))),
      h('span', {}, h('button', { type: 'button', onclick: () => mv(i, -1) }, '↑'), h('button', { type: 'button', onclick: () => mv(i, 1) }, '↓'), h('button', { type: 'button', class: 'dn', onclick: () => { F.questions.splice(i, 1); drawQs(); } }, 'Delete'))),
      h('input', { value: q.text, placeholder: `Question ${i + 1}`, maxlength: 500, oninput: e => q.text = e.target.value }), opts, acc,
      h('div', { class: 'row' }, h('label', { class: 'chk' }, h('input', { type: 'checkbox', ...(q.required ? { checked: '' } : {}), onchange: e => q.required = e.target.checked }), 'Required'),
        graded ? h('label', {}, 'Points ', h('input', { type: 'number', min: 0, max: 100, value: q.points, class: 'sm', oninput: e => q.points = +e.target.value || 0 })) : null),
      quiz ? h('input', { value: q.explanation || '', placeholder: 'Explanation shown after submitting (optional)', maxlength: 500, oninput: e => q.explanation = e.target.value }) : null);
  };
  const drawQs = () => { qBox.replaceChildren(...F.questions.map(qCard), h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => { F.questions.push({ type: 'short', text: '', required: false, options: [], correct: [], points: F.kind === 'quiz' ? 1 : 0, explanation: '' }); drawQs(); } }, '+ Add question'))); };
  const drawSet = () => {
    const quiz = F.kind === 'quiz', pick = h('div', { class: 'picker' }, STUDENTS.map(s => h('label', {}, h('input', { type: 'checkbox', value: s.id, ...(F.user_ids.includes(s.id) ? { checked: '' } : {}), onchange: e => { F.user_ids = e.target.checked ? [...F.user_ids, s.id] : F.user_ids.filter(x => x !== s.id); } }), s.name + ' (' + s.email + ')')));
    setBox.replaceChildren(
      h('label', {}, 'Title'), h('input', { value: F.title, maxlength: 200, oninput: e => F.title = e.target.value }), h('label', {}, 'Description / instructions'), h('textarea', { oninput: e => F.description = e.target.value }, F.description),
      h('label', {}, 'Type'), h('select', { onchange: e => { F.kind = e.target.value; if (F.kind === 'quiz') F.questions.forEach(q => { if (!q.points && q.type !== 'long' && q.type !== 'rating') q.points = 1; }); drawSet(); drawQs(); } }, [['form', 'Form (survey / sign-up, no grading)'], ['quiz', 'Quiz (auto-graded)']].map(([v, l]) => h('option', { value: v, ...(v === F.kind ? { selected: '' } : {}) }, l))),
      h('label', {}, 'Who can fill it in'), h('select', { onchange: e => { F.audience = e.target.value; drawSet(); } }, [['students', 'All approved students'], ['assigned', 'Selected students only']].map(([v, l]) => h('option', { value: v, ...(v === F.audience ? { selected: '' } : {}) }, l))), F.audience === 'assigned' ? pick : null,
      h('label', {}, 'Opens (optional)'), h('input', { type: 'datetime-local', value: lt(F.opens_at), onchange: e => F.opens_at = e.target.value ? new Date(e.target.value).toISOString() : null }),
      h('label', {}, 'Closes (optional)'), h('input', { type: 'datetime-local', value: lt(F.closes_at), onchange: e => F.closes_at = e.target.value ? new Date(e.target.value).toISOString() : null }),
      quiz ? h('div', {}, h('label', {}, 'Time limit in minutes (optional)'), h('input', { type: 'number', min: 1, max: 600, value: F.time_limit || '', oninput: e => F.time_limit = e.target.value ? +e.target.value : null }),
        h('label', {}, 'After submitting, students see'), h('select', { onchange: e => F.show_results = e.target.value }, [['none', 'Nothing (just "submitted")'], ['score', 'Their score'], ['answers', 'Score + correct answers']].map(([v, l]) => h('option', { value: v, ...(v === F.show_results ? { selected: '' } : {}) }, l)))) : null,
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', ...(F.one_response ? { checked: '' } : {}), onchange: e => F.one_response = e.target.checked }), 'One response per student'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', ...(F.published ? { checked: '' } : {}), onchange: e => F.published = e.target.checked }), 'Published (students can see it)'));
  };
  const save = async () => {
    er.textContent = 'Saving…';
    try {
      const body = { title: F.title, description: F.description, kind: F.kind, audience: F.audience, published: F.published, opens_at: F.opens_at, closes_at: F.closes_at, time_limit: F.kind === 'quiz' ? F.time_limit : null, show_results: F.show_results, one_response: F.one_response,
        questions: F.questions.map(q => ({ id: q.id || null, type: q.type, text: q.text, required: !!q.required, options: q.options || [], correct: q.correct || [], points: +q.points || 0, explanation: q.explanation || '' })) };
      const s = await api(F.id ? '/admin/forms/' + F.id : '/admin/forms', { method: F.id ? 'PUT' : 'POST', json: body });
      if (F.audience === 'assigned') await api(`/admin/forms/${s.id}/assign`, { method: 'PUT', json: { user_ids: F.user_ids } });
      EDITF = null; cur = 'forms'; render();
    } catch (x) { er.textContent = x.message; }
  };
  drawSet(); drawQs();
  m.replaceChildren(h('div', { class: 'bar' }, h('h2', {}, (F.id ? 'Edit ' : 'New ') + (F.kind === 'quiz' ? 'quiz' : 'form')), h('button', { onclick: () => { EDITF = null; cur = 'forms'; render(); } }, '← Cancel')),
    F.id ? h('p', { class: 'mt' }, 'Changing questions after students have answered keeps their old answers, but results may no longer match.') : null, setBox, h('h3', { class: 'mt2' }, 'Questions'), qBox,
    h('div', { class: 'row' }, h('button', { class: 'pri', onclick: save }, 'Save')), er);
}

async function formResp(m) {
  const d = await api(`/admin/forms/${RESPF.id}/responses`);
  m.replaceChildren(h('div', { class: 'bar' }, h('h2', {}, 'Responses: ' + d.form.title), h('button', { onclick: () => { cur = 'forms'; render(); } }, '← Forms & quizzes')),
    h('p', { class: 'mt' }, `${d.count} response${d.count === 1 ? '' : 's'}` + (d.avg_score != null ? ` · average score ${d.avg_score}` : '')), h('div', { class: 'row' }, h('a', { class: 'btn', href: `/api/admin/forms/${d.form.id}/responses.csv` }, 'Download CSV (opens in Excel)')),
    d.count ? h('div', {}, d.questions.map(q => h('div', { class: 'qcard' }, h('p', { class: 'qt' }, q.text), h('p', { class: 'mt' }, `${q.answered} answered` + (q.avg != null ? ` · average ${q.avg}` : '') + (q.correct_rate != null ? ` · ${q.correct_rate}% correct` : '')),
      q.counts ? q.options.map((o, j) => h('div', { class: 'bar2' }, h('span', {}, o), h('i', { style: `width:${q.answered ? Math.round(q.counts[j] / q.answered * 100) : 0}%` }), h('b', {}, String(q.counts[j])))) : null))) : null,
    d.count ? h('table', {}, h('tr', {}, ['Name', 'Class / roll', 'Submitted', 'Score', ''].map(x => h('th', {}, x))), d.items.map(i => h('tr', {}, h('td', {}, i.name, h('div', { class: 'mt' }, i.email)), h('td', {}, i.info), h('td', {}, fmt(i.at), i.late ? h('span', { class: 'er' }, ' late') : null),
      h('td', {}, i.score != null ? `${i.score} / ${i.max}` : '–'), h('td', {}, h('details', {}, h('summary', { class: 'mt' }, 'Answers'), i.answers.map(a => h('div', { class: 'mt' }, a.q + ': ' + a.a))))))) : h('p', { class: 'mt' }, 'No responses yet.'));
}

api('/auth/me').then(u => ME = u).catch(() => ME = null).finally(render);
