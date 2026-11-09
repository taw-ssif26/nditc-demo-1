const puppeteer = require('puppeteer-core'); const chromium = require('@sparticuz/chromium'); const C = chromium.default || chromium;
const sleep = ms => new Promise(r => setTimeout(r, ms)); const B = 'http://127.0.0.1:8000';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'nditc' };
async function api(jar, method, path, body) { const r = await fetch(B + '/api' + path, { method, headers: { ...H, cookie: jar.c || '' }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) jar.c = sc.map(x => x.split(';')[0]).join('; '); return r.json(); }
(async () => {
  const boss = {}; await api(boss, 'POST', '/auth/login', { email: 'boss@x.org', password: 'supersecret-123' });
  const when = new Date(Date.now() + 4 * 864e5).toISOString();
  const f = await api(boss, 'POST', '/admin/forms', { title: 'Sign-up details', kind: 'form', published: true, questions: [{ type: 'short', text: 'Team name', required: true }, { type: 'single', text: 'T-shirt size', options: ['S', 'M', 'L', 'XL'] }] });
  await api(boss, 'POST', '/admin/entries', { kind: 'event', title: 'Inter-College Hackathon 2026', body: 'A 24-hour build marathon. Bring a laptop and a team of up to four.', date: when, end_date: new Date(Date.now() + 5 * 864e5).toISOString(), location: 'Notre Dame College, Lab 2', capacity: 40, reg_open: true, audience: 'students', form_id: f.id });
  await api(boss, 'POST', '/admin/forms', { title: 'Python basics quiz', kind: 'quiz', published: true, time_limit: 15, show_results: 'answers', description: 'Answer all questions. One attempt.', questions: [
    { type: 'single', text: 'Which keyword defines a function in Python?', options: ['func', 'def', 'function', 'lambda'], correct: [1], points: 2, required: true },
    { type: 'multi', text: 'Which of these are mutable types?', options: ['list', 'tuple', 'dict', 'str'], correct: [0, 2], points: 3 },
    { type: 'short', text: 'What does len([1,2,3]) return?', correct: ['3'], points: 1 }, { type: 'rating', text: 'How difficult was this quiz?' }] });
  await fetch(B + '/api/auth/register', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Rahim Uddin', email: 'rahim@x.org', info: 'Class 11, Roll 7', password: 'student-pass-123' }) });
  const pend = await api(boss, 'GET', '/admin/users?role=student&status=pending'); await api(boss, 'POST', '/admin/users/review', { ids: pend.items.map(u => u.id), action: 'approve' });
  const ex = await C.executablePath();
  const run = async (name, fn, w = 390) => {
    const b = await puppeteer.launch({ args: [...C.args, '--no-sandbox'], executablePath: ex, headless: 'shell' });
    try { const p = await b.newPage(); await p.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true }); p.on('pageerror', e => console.log('PAGEERROR', name, e.message.slice(0, 100)));
      await fn(p); await sleep(500); await p.screenshot({ path: `/tmp/shots/${name}.png`, fullPage: false });
      console.log(name, JSON.stringify(await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth })))); } catch (e) { console.log('FAIL', name, e.message.slice(0, 120)); } finally { await b.close(); }
  };
  const login = async (p, email, pw, path) => { await p.goto(B + path, { waitUntil: 'domcontentloaded' }); await sleep(900); await p.type('input[type=email]', email); await p.type('input[type=password]', pw); await p.click('form.login button.pri'); await sleep(1400); };
  const clickText = async (p, sel, t) => p.evaluate((s, t) => [...document.querySelectorAll(s)].find(e => e.textContent.trim() === t).click(), sel, t);
  await run('p_events', async p => { await login(p, 'rahim@x.org', 'student-pass-123', '/portal'); });
  await run('p_quiz', async p => { await login(p, 'rahim@x.org', 'student-pass-123', '/portal'); await clickText(p, '.tabs button', 'Quizzes & forms'); await sleep(800); await clickText(p, 'button', 'Start quiz'); await sleep(900); });
  await run('a_builder', async p => { await login(p, 'boss@x.org', 'supersecret-123', '/admin'); await clickText(p, '.side button', 'Forms & quizzes'); await sleep(800); await clickText(p, 'button', 'Edit'); await sleep(1200); await p.evaluate(() => scrollTo(0, 700)); await sleep(400); });
  await run('a_regs', async p => { await login(p, 'boss@x.org', 'supersecret-123', '/admin'); await clickText(p, '.side button', 'Events'); await sleep(800); });
  console.log('done');
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
