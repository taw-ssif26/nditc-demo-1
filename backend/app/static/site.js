const C = JSON.parse(document.getElementById('c').textContent);
const N = { home: 'Command Deck', about: 'Origin Vault', activities: 'Launch Bay', projects: 'Reactor Lab', executives: 'Crew Manifest', publication: 'Archive Stacks', blog: 'Signal Logs', contact: 'Comms Relay', developers: 'Dev Forge', policy: 'Protocol Hall', app: 'Pocket Node' };
const TG = { home: 'mission control', about: 'our story', activities: 'events', projects: 'research', executives: 'the crew', publication: 'recursion', blog: 'transmissions', contact: 'say hello', developers: 'the builders', policy: 'ground rules', app: 'in your pocket' };
const PC = { home: '#22e5ff', about: '#ffb020', activities: '#ff6a2b', projects: '#4d7cff', executives: '#39ff88', publication: '#ff3b5c', blog: '#5cc8ff', contact: '#2ef2d0', developers: '#c9b6ff', policy: '#8fa3ff', app: '#ff3df2' };
const R = Object.keys(N), $ = s => document.querySelector(s), z = i => String(i + 1).padStart(2, '0');
const P = r => r === 'home' ? '/' : r === 'app' ? '/mobile-app' : '/' + r;
const route = () => { const p = location.pathname.replace(/\/+$/, '') || '/'; return R.find(r => P(r) === p) || 'home'; };
const nav = r => { if (P(r) !== location.pathname) { history.pushState({}, '', P(r)); go(); } };
const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RM = matchMedia('(prefers-reduced-motion:reduce)').matches, safe = u => /^https?:\/\//.test(u || '');
document.addEventListener('click', e => { const a = e.target.closest('a[href^="/"]'); if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey) return; const r = R.find(x => P(x) === a.getAttribute('href')); if (r) { e.preventDefault(); $('#wr').classList.remove('on'); document.body.classList.remove('mapopen'); nav(r); } });

/* ---------- views ---------- */
const img = (s, t) => s ? `<img src="${E(s)}" alt="${E(t || '')}" loading="lazy">` : '';
const gc = (t, d, k, i, extra = '') => `<article class="gc rv">${img(i, t)}${k ? `<span class="nb">${k}</span>` : ''}<h3>${E(t)}</h3>${d ? `<p>${E(d)}</p>` : ''}${extra}</article>`;
const sec = (t, b, cls = '') => `<section class="sx"><h2 class="rv">${E(t)}</h2><div class="${cls}">${b}</div></section>`;
const hd = (t, m, x) => `<header class="hero"><div class="halo" aria-hidden="true"><i style="--k:1"></i><i style="--k:2"></i><i style="--k:3"></i></div><p class="mt">${m}</p><h1>${t}</h1>${x || ''}</header>`;
const pend = n => hd(E(N[n]), 'No signal yet') + sec('Signal lost', `<div class="gc rv pend wide"><p>This world has no content yet. Add it from the admin dashboard.</p></div>`);
const foot = () => `<footer>${E(C.copy)} · <a href="mailto:${E(C.email)}">${E(C.email)}</a> · ${E(C.address)} · <a href="/portal">Student portal</a></footer>`;
const acts = () => C.activities.map((a, i) => gc(a.t, a.d, z(i), a.img)).join('');
const lk = e => safe(e.link) ? `<p><a class="bt" href="${E(e.link)}" target="_blank" rel="noopener noreferrer">Open</a></p>` : '';
const cards = (a, ex) => (a || []).map((e, i) => gc(e.t, e.d, z(i), e.img, lk(e))).join('');
const list = (n, m, k, title) => () => (C[k] || []).length ? hd(E(N[n]), m) + sec(title, cards(C[k]), 'gr') + foot() : pend(n) + foot();
const dbadge = e => { if (!e.iso) return ''; const d = new Date(e.iso); return `<span class="dbadge"><b>${d.getDate()}</b>${d.toLocaleString('en', { month: 'short' })}</span>`; };
const evc = e => `<article class="gc rv evc">${img(e.img, e.t)}<div class="eh">${dbadge(e)}<div><h3>${E(e.t)}</h3><span class="tag">Open to everyone</span>${e.loc ? `<p class="mt">${E(e.loc)}</p>` : ''}</div></div>${e.d ? `<p>${E(e.d)}</p>` : ''}${lk(e)}${e.reg && e.up ? `<p><button class="bt alt" type="button" data-reg="${e.id}">Register</button> <a class="mt" href="/portal#events">Student? Use the portal</a></p>` : ''}</article>`;
const evUp = () => (C.events || []).filter(e => e.up), evPast = () => (C.events || []).filter(e => !e.up);
const evSecs = () => (evUp().length ? sec('Upcoming events', evUp().map(evc).join(''), 'gr') : '') + (evPast().length ? sec('Past events', evPast().map(evc).join(''), 'gr') : '');
const reactor = (t, d, href) => `<div class="reactor rv"><div><p class="bp">${E(t)}</p><p>${E(d)}</p><a class="bt" href="${href}">${E(C.cta)}</a></div><div class="rx" aria-hidden="true"><i style="--k:1"></i><i style="--k:2"></i><i style="--k:3"></i><i style="--k:4"></i><b></b></div></div>`;
const V = {
  home: () => hd('NDITC', E(C.badge), `<p class="lead" data-ty="${E(C.lead)}"></p><div class="cta"><a class="bt alt" href="/about">${E(C.cta)}</a><a class="bt" href="/portal#register">Join as a student</a></div>`)
    + `<div class="mq" aria-hidden="true"><div>${[...C.departments, ...C.departments].map(d => `<span>${E(d)}</span>`).join('')}</div></div>`
    + sec('Departments', C.departments.map((d, i) => gc(d, '', z(i))).join(''), 'bento')
    + sec('Featured project', reactor(C.project.name, C.project.desc, '/projects'))
    + sec('Our activities include', acts(), 'rail')
    + (evUp().length ? sec('Upcoming events', evUp().slice(0, 6).map(evc).join(''), 'rail') : '')
    + sec('Why you should join NDITC?', C.why.map((w, i) => `<article class="gc rv"><span class="big">${z(i)}</span><h3>${E(w.t)}</h3><p>${E(w.d)}</p></article>`).join(''), 'tri')
    + sec(C.news.t, `<div class="gc rv wide"><p>${E(C.news.d)}</p><p><input id="em" type="email" placeholder="you@domain.com" aria-label="email"><button class="bt" id="sub">Subscribe</button></p><p id="sm" class="mt"></p></div>`)
    + sec('Official NDITC Mobile Application', `<div class="reactor rv"><div><p>${E(C.app)}</p><a class="bt" href="/mobile-app">Get the app</a></div><div class="phone" aria-hidden="true"><b></b><i></i><i></i><i></i></div></div>`) + foot(),
  about: () => { const mx = Math.max(1, ...C.stats.map(s => s[1]));
    return hd('About', 'Est. 2018', `<p class="bp rv">“${E(C.motto)}”</p>`)
    + sec('History', `<div class="two"><article class="gc rv"><p>${E(C.history)}</p></article><article class="gc rv"><h3>Objectives</h3><p>${E(C.objectives)}</p></article></div>`)
    + sec('In numbers', C.stats.map(s => `<div class="gg rv" style="--p:${Math.max(.14, s[1] / mx).toFixed(2)}"><svg viewBox="0 0 100 100"><circle class="tr" cx="50" cy="50" r="42"/><circle class="pr" cx="50" cy="50" r="42"/></svg><span class="num" data-n="${s[1]}" data-s="${E(s[2])}">0</span><p>${E(s[0])}</p></div>`).join(''), 'gauges')
    + sec('Timeline of achievements', C.timeline.map(t => `<div class="te rv"><b>${E(t[0])}</b><p>${t[1] ? E(t[1]) : 'Entry pending.'}</p></div>`).join(''), 'tl2') + foot(); },
  activities: () => hd('Activities', 'What we do') + sec('Our activities include', acts(), 'gr') + evSecs() + foot(),
  projects: () => hd('Projects', 'R&D') + sec('Featured', cards(C.projects || [{ t: C.project.name, d: C.project.desc }]), 'gr') + foot(),
  publication: () => hd('Publication', 'Annual') + sec('Recursion', cards([{ t: 'RECURSION', d: (C.activities[3] || {}).d || '' }, ...(C.publications || [])]), 'gr') + foot(),
  contact: () => hd('Contact', 'Open a channel') + sec('Reach us', `<div class="two"><article class="gc rv"><span class="nb">@</span><h3>Email</h3><p><a class="bp" href="mailto:${E(C.email)}" style="font-size:1.4rem">${E(C.email)}</a></p></article><article class="gc rv"><span class="nb">⌖</span><h3>Address</h3><p>${E(C.address)}</p></article></div>`) + foot(),
  app: () => hd('Mobile App', 'Pocket Node', `<p class="lead">${E(C.app)}</p>`) + sec('Get the app', `<div class="gc rv pend wide"><p>APK / store link goes here.</p></div>`) + foot(),
  executives: () => (C.executives || []).length ? hd('Executives', 'Crew manifest') + sec('The team', C.executives.map(e => `<article class="gc rv ex"><div class="av">${e.img ? img(e.img, e.t) : `<span>${E(e.t.split(/\s+/).slice(0, 2).map(w => w[0]).join(''))}</span>`}</div><h3>${E(e.t)}</h3><p>${E(e.d)}</p></article>`).join(''), 'gr') + foot() : pend('executives') + foot(),
  blog: list('blog', 'Signal logs', 'blog', 'Posts')
};
['developers', 'policy'].forEach(n => V[n] = () => (C.pg && C.pg[n]) ? hd(E(N[n]), '') + sec(N[n], `<div class="gc rv wide"><p class="pre">${E(C.pg[n])}</p></div>`) + foot() : pend(n) + foot());

/* ---------- register for a public event (no account needed) ---------- */
function pq(qs) {
  const get = {}, el = document.createElement('div');
  qs.forEach((q, i) => {
    const w = document.createElement('div'), t = document.createElement('p'); w.className = 'pqn'; t.className = 'qt'; t.textContent = `${i + 1}. ${q.text}${q.required ? ' *' : ''}`; w.append(t); let inp;
    if (q.type === 'short' || q.type === 'number') { inp = document.createElement('input'); inp.type = q.type === 'number' ? 'number' : 'text'; inp.step = 'any'; get[q.id] = () => inp.value === '' ? null : (q.type === 'number' ? Number(inp.value) : inp.value.trim()); }
    else if (q.type === 'long') { inp = document.createElement('textarea'); get[q.id] = () => inp.value.trim(); }
    else if (q.type === 'rating') { let v = null; inp = document.createElement('div'); inp.className = 'stars2'; const bs = [1, 2, 3, 4, 5].map(n => { const b = document.createElement('button'); b.type = 'button'; b.textContent = '★'; b.onclick = () => { v = n; bs.forEach((x, j) => x.classList.toggle('on', j < n)); }; inp.append(b); return b; }); get[q.id] = () => v; }
    else { const multi = q.type === 'multi'; inp = document.createElement('div'); const bx = q.options.map((o, j) => { const l = document.createElement('label'), c = document.createElement('input'); l.className = 'po'; c.type = multi ? 'checkbox' : 'radio'; c.name = 'pq' + q.id; c.value = j; l.append(c, o); inp.append(l); return c; });
      get[q.id] = () => { const c = bx.filter(x => x.checked).map(x => +x.value); return multi ? (c.length ? c : null) : (c.length ? c[0] : null); }; }
    w.append(inp); el.append(w);
  });
  return { el, collect: () => Object.fromEntries(qs.map(q => [String(q.id), get[q.id]()]).filter(([, v]) => v !== null && v !== '')) };
}
async function regEvent(id) {
  const m = document.createElement('div'); m.className = 'pm'; m.innerHTML = '<div class="pd" role="dialog" aria-modal="true"><p class="mt">Loading…</p></div>'; document.body.append(m);
  const d = m.firstChild, close = () => m.remove(), only = html => { d.innerHTML = html + '<p><button class="bt" type="button">Close</button></p>'; d.querySelector('button').onclick = close; };
  m.addEventListener('click', e => { if (e.target === m) close(); });
  let info; try { const r = await fetch('/api/public/events/' + id + '/reg'); if (!r.ok) throw 0; info = await r.json(); } catch (e) { return only('<p>Sorry, registration could not be loaded. Please try again later.</p>'); }
  if (!info.open) return only(`<h3>${E(info.title)}</h3><p>${E(info.reason || 'Registration is closed')}</p>`);
  const seats = info.capacity ? (info.full ? 'All seats are taken. You can join the waitlist.' : `${info.capacity - info.taken} of ${info.capacity} seats left`) : '';
  d.innerHTML = `<h3>${E(info.title)}</h3><p class="mt">${E(info.date ? new Date(info.date).toLocaleString() : '')}${info.location ? ' · ' + E(info.location) : ''}</p>${seats ? `<p class="mt">${E(seats)}</p>` : ''}<div class="pf"></div><p class="er"></p><p><button class="bt alt" type="button" id="pgo">${info.full ? 'Join waitlist' : 'Register'}</button> <button class="bt" type="button" id="pno">Cancel</button></p>`;
  const f = d.querySelector('.pf'), er = d.querySelector('.er');
  const fld = (lab, type, ex = {}) => { const w = document.createElement('label'), i = document.createElement('input'); w.textContent = lab; i.type = type; Object.assign(i, ex); w.append(i); f.append(w); return i; };
  const name = fld('Full name', 'text', { maxLength: 120, autocomplete: 'name' }), email = fld('Email', 'email', { autocomplete: 'email' }), phone = fld('Phone (optional)', 'tel', { maxLength: 40 }), org = fld('School / college / class (optional)', 'text', { maxLength: 160 });
  const trap = document.createElement('input'); trap.tabIndex = -1; trap.autocomplete = 'off'; trap.className = 'hp'; trap.setAttribute('aria-hidden', 'true'); f.append(trap);
  const qs = info.form ? pq(info.form.questions) : null;
  if (qs) { if (info.form.description) { const p = document.createElement('p'); p.className = 'mt'; p.textContent = info.form.description; f.append(p); } f.append(qs.el); }
  d.querySelector('#pno').onclick = close;
  d.querySelector('#pgo').onclick = async () => {
    er.textContent = '';
    try {
      const r = await fetch(`/api/public/events/${id}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'nditc' }, body: JSON.stringify({ name: name.value, email: email.value, phone: phone.value, org: org.value, website: trap.value, answers: qs ? qs.collect() : {} }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(typeof j.detail === 'string' ? j.detail : Array.isArray(j.detail) ? j.detail.map(x => String(x.msg || '').replace(/^Value error, /, '')).join('; ') : 'Something went wrong. Please try again.');
      only(`<h3>${j.status === 'waitlist' ? 'You are on the waitlist' : 'You are registered ✓'}</h3><p>Thank you, ${E(name.value.trim())}. ${j.status === 'waitlist' ? 'We will contact you if a seat opens up.' : 'See you at ' + E(info.title) + '.'}</p>`);
    } catch (x) { er.textContent = x.message; }
  };
  name.focus();
}
document.addEventListener('click', e => { const b = e.target.closest('[data-reg]'); if (b) regEvent(+b.dataset.reg); });

/* ---------- particles: every world has its own ---------- */
const cv = $('#bg'), x = cv.getContext('2d'), SP = {};
let W, H, DPR = 1, mx = -999, my = -999, P2 = [], RP = [], mode = 'net', cols = ['#22e5ff', '#ff3df2', '#8b5cff'], oc = [0, 0], raf = 0;
const MODE = { home: 'net', about: 'ember', activities: 'spark', projects: 'orbit', executives: 'rain', publication: 'petal', blog: 'bokeh', contact: 'pulse', developers: 'rain', policy: 'net', app: 'bubble' };
const CH = '01アイウエオカキクケコ{}<>/=+*#NDITC'.split('');
function spr(c) { if (c in SP) return SP[c]; try { const o = document.createElement('canvas'); o.width = o.height = 64; const g = o.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, '#fff'); r.addColorStop(.2, c); r.addColorStop(.5, c + '55'); r.addColorStop(1, c + '00'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return SP[c] = o; } catch (e) { return SP[c] = null; } }
const dot = (p, r, ci, a) => { const s = spr(cols[ci]); if (s) { x.globalAlpha = a; x.drawImage(s, p.x - r * 3, p.y - r * 3, r * 6, r * 6); } };
function seed() {
  const rain = mode === 'rain', n = rain ? Math.ceil(W / 18) : Math.round(Math.min(120, W * H / 9000));
  P2 = Array.from({ length: n }, (_, i) => ({ x: rain ? i * 18 : Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .5, vy: (Math.random() - .5) * .5, r: Math.random() * 2 + .8, c: Math.floor(Math.random() * 3), a: Math.random() * 6.28, s: Math.random() }));
}
function rs() { W = innerWidth; H = innerHeight; DPR = Math.min(devicePixelRatio || 1, matchMedia('(pointer:coarse)').matches ? 1.25 : 2); cv.width = W * DPR; cv.height = H * DPR; x.setTransform(DPR, 0, 0, DPR, 0, 0); seed(); if (RM) frame(0); }
const DRAW = {
  net() { for (const p of P2) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; const dx = p.x - mx, dy = p.y - my, d = Math.hypot(dx, dy); if (d < 150 && d > 0) { p.x += dx / d * 1.4; p.y += dy / d * 1.4; } dot(p, p.r * 1.7, p.c, .95); }
    x.lineWidth = 1; for (let i = 0; i < P2.length; i++) for (let j = i + 1; j < P2.length; j++) { const a = P2[i], b = P2[j], d = Math.hypot(a.x - b.x, a.y - b.y); if (d < 125) { x.globalAlpha = (1 - d / 125) * .55; x.strokeStyle = cols[a.c]; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); } } },
  ember(t) { for (const p of P2) { p.y -= .3 + p.s * .9; p.x += Math.sin(t / 900 + p.a) * .45; if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; } dot(p, p.r * 2.3, p.c % 2, .55 + .4 * Math.sin(t / 400 + p.a)); } },
  spark() { for (const p of P2) { p.x += 1.6 + p.s * 4.5; if (p.x > W + 30) { p.x = -30; p.y = Math.random() * H; } x.globalAlpha = .8; x.strokeStyle = cols[p.c]; x.lineWidth = p.r; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x - 16 - p.s * 24, p.y); x.stroke(); dot(p, p.r * 1.8, p.c, 1); } },
  orbit() { const tx = mx > 0 ? mx : W / 2, ty = my > 0 ? my : H / 2; oc[0] += (tx - oc[0]) * .04; oc[1] += (ty - oc[1]) * .04; for (const p of P2) { p.a += .002 + p.s * .006; const r = 60 + p.s * Math.min(W, H) * .5; p.x = oc[0] + Math.cos(p.a) * r; p.y = oc[1] + Math.sin(p.a) * r * .6; dot(p, p.r * 1.9, p.c, .9); } },
  rain() { x.font = '15px JetBrains Mono, monospace'; for (const p of P2) { x.globalAlpha = .95; x.fillStyle = cols[p.c % 2]; x.fillText(CH[(Math.random() * CH.length) | 0], p.x, p.y); p.y += 2 + p.s * 4; if (p.y > H && Math.random() > .975) p.y = -20; } },
  petal(t) { for (const p of P2) { p.y += .4 + p.s * .8; p.x += Math.sin(t / 1200 + p.a) * .6; p.a += .012; if (p.y > H + 12) { p.y = -12; p.x = Math.random() * W; } x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.globalAlpha = .75; x.fillStyle = cols[p.c % 2]; x.beginPath(); x.ellipse(0, 0, p.r * 3.4, p.r * 1.5, 0, 0, 6.28); x.fill(); x.restore(); } },
  bokeh() { for (const p of P2) { p.x += p.vx * .5; p.y += p.vy * .5; if (p.x < -50) p.x = W + 50; if (p.x > W + 50) p.x = -50; if (p.y < -50) p.y = H + 50; if (p.y > H + 50) p.y = -50; const s = spr(cols[p.c]); if (s) { x.globalAlpha = .22; x.drawImage(s, p.x - p.r * 14, p.y - p.r * 14, p.r * 28, p.r * 28); } } },
  pulse() { if (Math.random() < .015 || (mx > 0 && Math.random() < .004)) RP.push({ x: mx > 0 && Math.random() < .5 ? mx : Math.random() * W, y: my > 0 && Math.random() < .5 ? my : Math.random() * H, r: 0, c: Math.floor(Math.random() * 3) });
    RP = RP.filter(q => q.r < 260); for (const q of RP) { q.r += 1.8; x.globalAlpha = (1 - q.r / 260) * .8; x.strokeStyle = cols[q.c]; x.lineWidth = 2; x.beginPath(); x.arc(q.x, q.y, q.r, 0, 6.28); x.stroke(); }
    for (const p of P2) { p.x += p.vx * .4; p.y += p.vy * .4; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; dot(p, p.r * 1.6, p.c, .8); } },
  bubble(t) { for (const p of P2) { p.y -= .5 + p.s * 1.1; p.x += Math.sin(t / 800 + p.a) * .5; if (p.y < -30) { p.y = H + 30; p.x = Math.random() * W; } x.globalAlpha = .75; x.strokeStyle = cols[p.c]; x.lineWidth = 1.4; x.beginPath(); x.arc(p.x, p.y, p.r * 4.5, 0, 6.28); x.stroke(); dot(p, p.r * 3.5, p.c, .3); } }
};
function frame(t) {
  if (!document.hidden) {
    if (mode === 'rain' || mode === 'spark') { x.globalCompositeOperation = 'destination-out'; x.fillStyle = 'rgba(0,0,0,.14)'; x.fillRect(0, 0, W, H); } else x.clearRect(0, 0, W, H);
    x.globalCompositeOperation = 'lighter'; DRAW[mode](t); x.globalAlpha = 1;
  }
  if (!RM) raf = requestAnimationFrame(frame);
}
addEventListener('resize', rs);
addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; const s = document.documentElement.style; s.setProperty('--mx', mx + 'px'); s.setProperty('--my', my + 'px'); });
const gl = document.createElement('div'); gl.id = 'gl'; document.body.append(gl);

/* ---------- routing + per-world loader ---------- */
let busy = 0, cur = 'home';
function go() {
  const r = route(); if (busy) return; busy = 1; cur = r;
  const ld = $('#ld'), lb = $('#lb');
  document.body.dataset.w = r;
  $('#lt').innerHTML = `<small>${z(R.indexOf(r))} / ${R.length} · ${E(TG[r])}</small><b>${E(N[r])}</b>`;
  $('#core span').textContent = N[r];
  ld.classList.remove('off'); lb.style.transition = 'none'; lb.style.transform = 'scaleX(0)';
  requestAnimationFrame(() => { lb.style.transition = `transform ${RM ? 0 : .8}s cubic-bezier(.7,0,.2,1)`; lb.style.transform = 'scaleX(1)'; });
  setTimeout(() => {
    $('#view').innerHTML = V[r](); scrollTo(0, 0);
    document.title = (r === 'home' ? '' : N[r] + ' — ') + 'NDITC — Notre Dame Information Technology Club';
    const cs = getComputedStyle(document.body); cols = ['--ac', '--ac2', '--ac3'].map(k => { const v = cs.getPropertyValue(k).trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v : '#22e5ff'; });
    mode = MODE[r]; RP = []; seed(); if (RM) frame(0);
    hydrate(); fit(); ld.classList.add('off'); busy = 0;
  }, RM ? 60 : 950);
}
function fit() {  // shrink a title only when its longest word would overflow the screen
  document.querySelectorAll('.hero h1').forEach(h => { h.style.fontSize = ''; const max = parseFloat(getComputedStyle(h).fontSize), L = Math.max(...h.textContent.split(/\s+/).map(w => w.length)), room = h.parentElement.clientWidth;
    if (max * L * .68 > room) h.style.fontSize = Math.floor(room / (L * .68)) + 'px'; });
}
addEventListener('resize', fit);
function hydrate() {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); e.target.querySelectorAll('.num').forEach(cnt); } }), { threshold: .12 });
  document.querySelectorAll('.rv').forEach(e => io.observe(e));
  const t = $('[data-ty]'); if (t) { const s = t.dataset.ty; let i = 0; const k = () => { t.textContent = s.slice(0, i++); if (i <= s.length) setTimeout(k, RM ? 0 : 16); }; k(); }
  if (matchMedia('(hover:hover)').matches && !RM) document.querySelectorAll('.gc').forEach(c => { c.onpointermove = e => { const b = c.getBoundingClientRect(); c.style.transform = `perspective(800px) rotateY(${((e.clientX - b.left) / b.width - .5) * 9}deg) rotateX(${-((e.clientY - b.top) / b.height - .5) * 9}deg) translateY(-6px)`; }; c.onpointerleave = () => c.style.transform = ''; });
  const sb = $('#sub'); if (sb) sb.onclick = () => { const v = $('#em').value.trim(); $('#sm').textContent = /^\S+@\S+\.\S+$/.test(v) ? 'Queued. (Demo: connect the API to store it.)' : 'Invalid address.'; };
}
function cnt(n) { const to = +n.dataset.n, s = n.dataset.s || ''; let v = 0; const st = () => { v += Math.ceil(to / 40); if (v >= to) v = to; n.textContent = v + s; if (v < to && !RM) requestAnimationFrame(st); }; st(); }
addEventListener('popstate', go);

/* ---------- navigation: the orb opens a galaxy of worlds ---------- */
const wr = $('#wr'), core = $('#core');
core.innerHTML = '<i class="sph"></i><span></span>'; core.setAttribute('aria-label', 'Open the map of worlds');
const RINGS = [{ r: 'min(40vmin,310px)', m: '37vmin', t: 110, names: ['home', 'about', 'activities', 'portal'] }, { r: 'min(66vmin,520px)', m: '59vmin', t: 170, rev: 1, names: ['projects', 'executives', 'publication', 'blog'] }, { r: 'min(92vmin,730px)', m: '80vmin', t: 240, names: ['contact', 'developers', 'policy', 'app'] }];
wr.insertAdjacentHTML('beforeend', '<button class="x" aria-label="Close map">✕</button><div class="cr"><b>NDITC</b><small></small></div>');
wr.querySelectorAll('.ct').forEach(e => e.remove());
RINGS.forEach((g, ri) => {
  const o = document.createElement('div'); o.className = 'orb' + (g.rev ? ' rev' : ''); o.style.cssText = `--r:${g.r};--rm:${g.m};--t:${g.t}s`;
  o.innerHTML = g.names.map((n, i) => { const a = Math.round(i / g.names.length * 360 + ri * 33), portal = n === 'portal', sz = [54, 44, 48, 38][(i + ri) % 4];
    return `<div class="pl" style="--a:${a}deg"><div class="pi"><a class="mi${(i + ri) % 3 === 0 ? ' rg' : ''}" href="${portal ? '/portal' : P(n)}" data-w="${n}" style="--pc:${portal ? '#ffffff' : PC[n]};--s:${sz}px"><i></i><span>${portal ? 'Student portal' : N[n]}</span><small>${portal ? 'sign in / join' : TG[n]}</small></a></div></div>`; }).join('');
  wr.append(o);
});
wr.insertAdjacentHTML('beforeend', `<div class="ct">${matchMedia('(hover:none)').matches ? 'TAP A WORLD' : 'PICK A WORLD · ESC TO CLOSE'}</div>`);
const openMap = on => { wr.classList.toggle('on', on); document.body.classList.toggle('mapopen', on); if (on) { wr.querySelector('.cr small').textContent = 'you are in ' + N[cur]; wr.querySelectorAll('.mi').forEach(a => a.classList.toggle('here', a.dataset.w === cur)); } };
addEventListener('scroll', () => core.classList.toggle('s', scrollY > 160), { passive: true });
core.onclick = () => openMap(!wr.classList.contains('on')); wr.querySelector('.x').onclick = () => openMap(false);

/* ---------- terminal ---------- */
const tm = $('#tm'), to = $('#to'), ti = $('#ti'), H2 = []; let hi = 0;
const out = s => { to.textContent += s + '\n'; to.scrollTop = 1e9; };
const find = q => { q = q.toLowerCase(); return C.departments.find((d, i) => d.toLowerCase().includes(q) || String(i + 1) === q); };
const CM = {
  help: () => 'commands: help about motto stats ls cat <name|n> events projects goto <world> join contact worlds whoami clear sudo',
  about: () => C.history, motto: () => `"${C.motto}"`,
  stats: () => C.stats.map(s => `${s[0].padEnd(18)} ${s[1]}${s[2]}`).join('\n'),
  ls: () => C.departments.map((d, i) => `${i + 1}. ${d}`).join('\n'),
  cat: a => /quantum/i.test(a) ? `${C.project.name}: ${C.project.desc}` : (find(a) || 'cat: not found. try: cat quantum | cat 1'),
  events: () => C.activities[0].d, projects: () => `${C.project.name}\nHashTech\nEvya AI`,
  worlds: () => R.join(' '), join: () => { location.href = '/portal#register'; return 'opening registration...'; },
  contact: () => `${C.email}\n${C.address}`,
  goto: a => R.includes(a) ? (nav(a), 'warping to ' + N[a] + '...') : 'goto: unknown world. try: worlds',
  whoami: () => 'guest@nditc, clearance: public', sudo: () => 'nice try. this incident will be reported (to nobody).',
  clear: () => { to.textContent = ''; return ''; }
};
function run(l) { out('$ ' + l); const [c, ...a] = l.trim().split(/\s+/); if (!c) return; const f = CM[c.toLowerCase()]; const r = f ? f(a.join(' ')) : `${c}: command not found. type help`; if (r) out(r); }
ti.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = ti.value; H2.push(v); hi = H2.length; ti.value = ''; run(v); } else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); ti.value = H2[hi] || ''; } else if (e.key === 'ArrowDown') { hi = Math.min(H2.length, hi + 1); ti.value = H2[hi] || ''; } });
const tg = () => { tm.classList.toggle('on'); if (tm.classList.contains('on')) { if (!to.textContent) out('NDITC lab terminal v1.0, type "help"'); ti.focus(); } };
$('#tb').onclick = tg;
addEventListener('keydown', e => { if (e.key === 'Escape') { openMap(false); tm.classList.remove('on'); } else if (e.key === '`' && document.activeElement !== ti) { e.preventDefault(); tg(); } else if ((e.key === 'm' || e.key === 'M') && document.activeElement !== ti && !e.metaKey && !e.ctrlKey) openMap(!wr.classList.contains('on')); });
rs(); if (!RM) raf = requestAnimationFrame(frame);
go();
