const { JSDOM, VirtualConsole } = require('jsdom');
const BASE = 'http://127.0.0.1:8000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL:', m)); };
async function open(path, jar = {}) {
  const errs = [], vc = new VirtualConsole();
  vc.on('jsdomError', e => { const m = String(e.message); if (!/stylesheet|Could not load|CSS/i.test(m)) errs.push(m.slice(0, 160)); });
  vc.on('error', e => errs.push(String(e).slice(0, 160)));
  const dom = await JSDOM.fromURL(BASE + path, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    const nop = new Proxy(function () {}, { get: (t, k) => k === 'then' ? undefined : nop, apply: () => nop, set: () => true }); w.HTMLCanvasElement.prototype.getContext = () => nop;
    w.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(e) { this.cb([{ isIntersecting: true, target: e }]); } unobserve() {} disconnect() {} };
    w.matchMedia = () => ({ matches: false, addEventListener() {} }); w.scrollTo = () => {}; w.confirm = () => true; w.alert = () => {};
    w.fetch = async (u, o = {}) => { const h = { ...(o.headers || {}) }; if (Object.keys(jar).length) h.cookie = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
      const r = await fetch(new URL(u, w.location.href), { ...o, headers: h, redirect: 'manual' });
      for (const c of (r.headers.getSetCookie ? r.headers.getSetCookie() : [])) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); /max-age=0/i.test(c) || v === '' || v === '""' ? delete jar[k] : jar[k] = v; }
      return r; };
  } });
  return { w: dom.window, d: dom.window.document, errs, jar };
}
const byText = (d, sel, t) => [...d.querySelectorAll(sel)].find(e => e.textContent.trim() === t);
const type = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const submit = (w, f) => f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));

(async () => {
  // 1. every public page renders, in its own world, with no script errors
  const pages = { '/': 'home', '/about': 'about', '/activities': 'activities', '/projects': 'projects', '/executives': 'executives', '/publication': 'publication', '/blog': 'blog', '/contact': 'contact', '/developers': 'developers', '/policy': 'policy', '/mobile-app': 'app' };
  await Promise.all(Object.entries(pages).map(async ([p, world]) => {
    const { w, d, errs } = await open(p); for (let i = 0; i < 40 && !d.getElementById('ld').classList.contains('off'); i++) await sleep(250);
    ok(d.body.dataset.w === world, `${p} world=${d.body.dataset.w}`);
    ok((d.querySelector('#view h1') || {}).textContent, `${p} has h1`);
    ok(!/\{\{|undefined|NaN/.test(d.querySelector('#view').textContent), `${p} no placeholder/undefined text`);
    ok(d.getElementById('ld').classList.contains('off'), `${p} loader finished`);
    ok(errs.length === 0, `${p} script errors: ${errs.join(' | ')}`);
    w.close();
  }));
  // 2. navigation via the index overlay + terminal
  { const { w, d, errs } = await open('/'); await sleep(2000);
    d.getElementById('core').click(); ok(d.getElementById('wr').classList.contains('on'), 'index opens');
    d.querySelector('a.mi[href="/about"]').click(); await sleep(2000);
    ok(w.location.pathname === '/about' && d.body.dataset.w === 'about', 'index navigates to /about');
    ok(/History/.test(d.getElementById('view').textContent) && /700/.test(d.getElementById('view').textContent), 'about shows content from API');
    d.getElementById('tb').click(); const ti = d.getElementById('ti');
    for (const cmd of ['stats', 'ls', 'cat quantum', 'goto contact']) { ti.value = cmd; ti.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(50); }
    const out = d.getElementById('to').textContent;
    ok(/Total Members/.test(out) && /Artificial Intelligence/.test(out) && /Quantum Computer/.test(out), 'terminal commands answer');
    await sleep(2000); ok(w.location.pathname === '/contact', 'terminal goto navigates');
    ok(errs.length === 0, 'nav errors: ' + errs.join(' | ')); w.close(); }
  // 3. admin flow
  const jar = {};
  { const { w, d, errs } = await open('/admin', jar); await sleep(700);
    const f = d.querySelector('form.login'); ok(f, 'login form shown');
    type(w, f.querySelector('input[type=email]'), 'boss@x.org'); type(w, f.querySelector('input[type=password]'), 'supersecret-123'); submit(w, f); await sleep(900);
    ok(d.querySelector('.shell'), 'admin shell after login');
    byText(d, '.side button', 'Sessions & recordings').click(); await sleep(500);
    byText(d, 'button', '+ Add new').click(); await sleep(200);
    const m = d.querySelector('.modal form'); ok(m, 'entry form opens');
    type(w, m.querySelector('input[required]'), 'Intro to Python'); type(w, m.querySelector('textarea'), 'Week 1 recording'); type(w, m.querySelectorAll('input')[1], 'https://example.com/rec');
    submit(w, m); await sleep(900);
    ok(/Intro to Python/.test(d.querySelector('main').textContent), 'new session listed');
    byText(d, '.side button', 'Students').click(); await sleep(500);
    const ins = d.querySelectorAll('main .row input'); type(w, ins[0], 'Rahim Uddin'); type(w, ins[1], 'rahim@x.org'); byText(d, 'button', 'Add').click(); await sleep(900);
    const box = d.querySelector('.box'); ok(box && /rahim@x.org/.test(box.textContent), 'student created with temp password');
    const pw = box.textContent.split('→')[1].trim().split(/\s/)[0];
    byText(d, 'button', 'Sign out').click(); await sleep(500); ok(d.querySelector('form.login'), 'signed out');
    ok(errs.length === 0, 'admin errors: ' + errs.join(' | ')); w.close();
    // 4. student flow
    const sj = {}; const s = await open('/portal', sj); await sleep(700);
    const sf = s.d.querySelector('form.login'); type(s.w, sf.querySelector('input[type=email]'), 'rahim@x.org'); type(s.w, sf.querySelector('input[type=password]'), pw); submit(s.w, sf); await sleep(900);
    ok(/Choose your own password/.test(s.d.body.textContent), 'forced password change screen');
    const pf = s.d.querySelector('form.gate'); const pi = pf.querySelectorAll('input'); type(s.w, pi[0], pw); type(s.w, pi[1], 'student-pass-123'); submit(s.w, pf); await sleep(1200);
    ok(/NDITC · Rahim Uddin/.test(s.d.body.textContent), 'portal opens after password change');
    byText(s.d, '.tabs button', 'Recordings').click(); await sleep(200);
    ok(/Intro to Python/.test(s.d.body.textContent) && /Open link/.test(s.d.body.textContent), 'student sees the recording with its link');
    byText(s.d, '.tabs button', 'Resources').click(); ok(/Nothing here yet/.test(s.d.body.textContent), 'empty resources handled');
    // 5. self-registration -> admin approval -> student signs in with her own password
    const rj = {}; const g = await open('/portal', rj); await sleep(700);
    byText(g.d, 'button', 'New student? Create an account').click(); await sleep(100);
    const rf = g.d.querySelector('form.login'); const ri = rf.querySelectorAll('input');
    type(g.w, ri[0], 'Sara Khan'); type(g.w, ri[1], 'sara@x.org'); type(g.w, ri[2], 'Class 11, Roll 42'); type(g.w, ri[3], 'my-own-password-9'); type(g.w, ri[4], 'my-own-password-9');
    ok(rf.querySelector('input[name=website]'), 'honeypot field present'); submit(g.w, rf); await sleep(1000);
    ok(/admin will review/.test(g.d.body.textContent), 'registration confirmation shown');
    type(g.w, g.d.createElement('input'), ''); g.w.close();
    const l2 = await open('/portal', {}); await sleep(600); const lf = l2.d.querySelector('form.login');
    type(l2.w, lf.querySelector('input[type=email]'), 'sara@x.org'); type(l2.w, lf.querySelector('input[type=password]'), 'my-own-password-9'); submit(l2.w, lf); await sleep(800);
    ok(/waiting for admin approval/.test(l2.d.body.textContent), 'pending student sees the waiting message'); l2.w.close();
    const a = await open('/admin', {}); await sleep(700); const af = a.d.querySelector('form.login');
    type(a.w, af.querySelector('input[type=email]'), 'boss@x.org'); type(a.w, af.querySelector('input[type=password]'), 'supersecret-123'); submit(a.w, af); await sleep(1100);
    ok(/Approvals \(1\)/.test(a.d.querySelector('.side').textContent), 'approvals badge shows 1 pending');
    byText(a.d, '.side button', 'Approvals (1)').click(); await sleep(500);
    ok(/Sara Khan/.test(a.d.querySelector('main').textContent) && /Class 11, Roll 42/.test(a.d.querySelector('main').textContent), 'pending request listed with class/roll');
    byText(a.d, 'button', 'Approve').click(); await sleep(800);
    ok(/Nothing here/.test(a.d.querySelector('main').textContent), 'request leaves the pending list after approval'); a.w.close();
    const s2 = await open('/portal', {}); await sleep(600); const f2 = s2.d.querySelector('form.login');
    type(s2.w, f2.querySelector('input[type=email]'), 'sara@x.org'); type(s2.w, f2.querySelector('input[type=password]'), 'my-own-password-9'); submit(s2.w, f2); await sleep(1000);
    ok(/NDITC · Sara Khan/.test(s2.d.body.textContent) && !/Choose your own password/.test(s2.d.body.textContent), 'approved student is in the portal with no forced password change'); s2.w.close();
    // 6. events + quizzes: admin builds a quiz in the UI, student registers for an event and takes the quiz
    const A = await open('/admin', {}); await sleep(700); const af2 = A.d.querySelector('form.login');
    type(A.w, af2.querySelector('input[type=email]'), 'boss@x.org'); type(A.w, af2.querySelector('input[type=password]'), 'supersecret-123'); submit(A.w, af2); await sleep(1100);
    const when = new Date(Date.now() + 3 * 864e5).toISOString();
    const ap = async (path, body) => (await A.w.fetch('/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'nditc' }, body: JSON.stringify(body) })).json();
    await ap('/admin/entries', { kind: 'event', title: 'Robotics Cup', body: 'Build and battle', date: when, location: 'Lab 3', capacity: 2, reg_open: true, audience: 'public' });
    byText(A.d, '.side button', 'Forms & quizzes').click(); await sleep(500);
    byText(A.d, 'button', '+ New quiz').click(); await sleep(600);
    const mm = A.d.querySelector('main'); type(A.w, mm.querySelector('input'), 'Weekly Quiz');
    byText(A.d, 'button', '+ Add question').click(); await sleep(100);
    const qc = A.d.querySelector('.qcard'); const sel = qc.querySelector('select'); sel.value = 'single'; sel.dispatchEvent(new A.w.Event('change', { bubbles: true })); await sleep(100);
    const qc2 = A.d.querySelector('.qcard'); type(A.w, qc2.querySelector('input[placeholder^="Question"]'), 'What is 2 + 2?');
    const os = qc2.querySelectorAll('.orow'); type(A.w, os[0].querySelector('input:not(.ck)'), '3'); type(A.w, os[1].querySelector('input:not(.ck)'), '4');
    os[1].querySelector('input.ck').checked = true; os[1].querySelector('input.ck').dispatchEvent(new A.w.Event('change', { bubbles: true }));
    const pub = [...A.d.querySelectorAll('label.chk')].find(l => /Published/.test(l.textContent)).querySelector('input'); pub.checked = true; pub.dispatchEvent(new A.w.Event('change', { bubbles: true }));
    byText(A.d, 'button', 'Save').click(); await sleep(1200);
    ok(/Weekly Quiz/.test(A.d.querySelector('main').textContent) && /Live/.test(A.d.querySelector('main').textContent), 'quiz built in the UI appears as Live');
    byText(A.d, '.side button', 'Events').click(); await sleep(600);
    ok(/Robotics Cup/.test(A.d.querySelector('main').textContent) && /0 \/ 2/.test(A.d.querySelector('main').textContent), 'event listed with seat count'); A.w.close();
    const P2 = await open('/portal', {}); await sleep(600); const pf2 = P2.d.querySelector('form.login');
    type(P2.w, pf2.querySelector('input[type=email]'), 'sara@x.org'); type(P2.w, pf2.querySelector('input[type=password]'), 'my-own-password-9'); submit(P2.w, pf2); await sleep(1300);
    ok(/Robotics Cup/.test(P2.d.body.textContent) && /Lab 3/.test(P2.d.body.textContent) && /0 of 2 seats/.test(P2.d.body.textContent), 'portal Events tab lists the event with location and seats');
    byText(P2.d, 'button', 'Register').click(); await sleep(900);
    ok(/You're registered/.test(P2.d.body.textContent) && /1 of 2 seats/.test(P2.d.body.textContent), 'student registers and the seat count updates');
    byText(P2.d, '.tabs button', 'Quizzes & forms').click(); await sleep(700);
    ok(/Weekly Quiz/.test(P2.d.body.textContent), 'quiz is listed for the student'); byText(P2.d, 'button', 'Start quiz').click(); await sleep(800);
    const opts = P2.d.querySelectorAll('.opt input'); ok(opts.length === 2, 'quiz options render'); opts[1].checked = true;
    byText(P2.d, 'button', 'Submit').click(); await sleep(900);
    ok(/Submitted/.test(P2.d.body.textContent) && /1 \/ 1/.test(P2.d.body.textContent), 'quiz is graded and the score shown');
    byText(P2.d, 'button', '← Back').click(); await sleep(700); ok(/Done/.test(P2.d.body.textContent), 'quiz shows as done');
    ok(P2.errs.length === 0, 'portal errors: ' + P2.errs.join(' | ')); P2.w.close();
    const pubp = await open('/activities', {}); for (let i = 0; i < 40 && !pubp.d.getElementById('ld').classList.contains('off'); i++) await sleep(250);
    ok(/Robotics Cup/.test(pubp.d.getElementById('view').textContent) && /Upcoming events/.test(pubp.d.getElementById('view').textContent) && /Lab 3/.test(pubp.d.getElementById('view').textContent), 'public Activities page lists the dynamic event');
    // 7. a visitor with no account registers for the public event
    const rb = pubp.d.querySelector('[data-reg]'); ok(rb, 'public event has a Register button'); rb.click(); await sleep(900);
    const dlg = pubp.d.querySelector('.pd'); ok(dlg && /Lab 3/.test(dlg.textContent) && /1 of 2 seats left/.test(dlg.textContent), 'public sign-up form shows live seats');
    const fi = dlg.querySelectorAll('.pf input'); type(pubp.w, fi[0], 'Nadia Rahman'); type(pubp.w, fi[1], 'nadia@school.org'); type(pubp.w, fi[2], '01700000000'); type(pubp.w, fi[3], 'Holy Cross College');
    pubp.d.querySelector('#pgo').click(); await sleep(1000);
    ok(/You are registered/.test(pubp.d.querySelector('.pd').textContent), 'visitor is registered without an account'); pubp.d.querySelector('.pd button').click();
    ok(!pubp.d.querySelector('.pm'), 'dialog closes'); ok(pubp.errs.length === 0, 'public page errors: ' + pubp.errs.join(' | ')); pubp.w.close();
    // 8. calm mode: one switch turns lights and animation off for the whole site, and it is remembered
    const fxp = await open('/', {}); for (let i = 0; i < 40 && !fxp.d.getElementById('ld').classList.contains('off'); i++) await sleep(250);
    const html = fxp.d.documentElement, fx = fxp.d.getElementById('fx');
    ok(html.dataset.fx === 'on' && /Effects on/.test(fx.textContent) && fx.getAttribute('aria-pressed') === 'true', 'effects are on by default');
    fx.click(); ok(html.dataset.fx === 'off' && /Effects off/.test(fx.textContent) && fx.getAttribute('aria-pressed') === 'false' && fxp.w.localStorage.getItem('nditc_fx') === 'off', 'switch turns effects off and remembers it');
    fxp.d.querySelector('a[href="/about"]').click(); for (let i = 0; i < 60 && fxp.w.location.pathname !== '/about'; i++) await sleep(100); await sleep(600);
    ok(html.dataset.fx === 'off' && fxp.w.location.pathname === '/about' && /History/.test(fxp.d.getElementById('view').textContent), 'calm mode stays on and every page still works');
    ok(/^700\+$/.test((fxp.d.querySelector('.num[data-n="700"]') || {}).textContent || ''), 'numbers show their final value immediately in calm mode');
    fxp.d.getElementById('core').click(); ok(fxp.d.getElementById('wr').classList.contains('on') && fxp.d.querySelectorAll('#wr a.mi').length === 12, 'navigation map still opens with all 12 planets'); fxp.d.getElementById('core').click();
    fxp.d.getElementById('fx').click(); ok(html.dataset.fx === 'on' && fxp.w.localStorage.getItem('nditc_fx') === 'on', 'switch turns effects back on');
    ok(fxp.errs.length === 0, 'effects-switch errors: ' + fxp.errs.join(' | ')); fxp.w.close();

    ok(s.errs.length === 0, 'student errors: ' + s.errs.join(' | ')); s.w.close(); }
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(2); });
