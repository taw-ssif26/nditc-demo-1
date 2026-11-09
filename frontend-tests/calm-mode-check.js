const puppeteer = require('puppeteer-core'); const chromium = require('@sparticuz/chromium'); const C = chromium.default || chromium;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const probe = () => ({ fx: document.documentElement.dataset.fx, running: document.getAnimations().filter(a => a.playState === 'running').length,
  canvas: getComputedStyle(document.getElementById('bg')).display, glow: getComputedStyle(document.getElementById('gl')).display, loader: getComputedStyle(document.getElementById('ld')).display, btn: (document.getElementById('fx') || {}).textContent });
(async () => {
  const ex = await C.executablePath();
  const run = async (label, setup, o = {}) => { const b = await puppeteer.launch({ args: [...C.args, '--no-sandbox'], executablePath: ex, headless: 'shell' });
    try { const p = await b.newPage(); await p.setViewport(o.m ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1440, height: 900 }); p.on('pageerror', e => console.log('PAGEERROR', label, e.message.slice(0, 90)));
      await setup(p); await p.goto('http://127.0.0.1:8000' + (o.path || '/'), { waitUntil: 'domcontentloaded' }); await sleep(3000);
      if (o.click) { await p.evaluate(q => document.querySelector(q).click(), o.click); await sleep(1200); }
      if (o.reveal) await p.evaluate(() => document.querySelectorAll('.rv').forEach(e => e.classList.add('in')));
      if (o.scroll) { await p.evaluate(y => scrollTo(0, y), o.scroll); await sleep(500); }
      const r = await p.evaluate(probe); console.log(label.padEnd(34), JSON.stringify(r));
      if (o.shot) await p.screenshot({ path: `/tmp/shots/${o.shot}.png` });
      if (o.reach) console.log('   planets reachable in calm map:', await p.evaluate(() => [...document.querySelectorAll('#wr .mi')].filter(a => { const s = a.querySelector('i').getBoundingClientRect(), h = document.elementFromPoint(s.x + s.width / 2, s.y + s.height / 2); return h && h.closest('.mi') === a; }).length + '/12'));
    } catch (e) { console.log(label, 'ERR', e.message.slice(0, 90)); } finally { await b.close(); } };
  await run('default (no device preference)', async () => {});
  await run('device asks for reduced motion', p => p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]));
  await run('reduced motion BUT user chose ON', async p => { await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await p.evaluateOnNewDocument(() => localStorage.setItem('nditc_fx', 'on')); });
  const off = p => p.evaluateOnNewDocument(() => localStorage.setItem('nditc_fx', 'off'));
  await run('user chose OFF, desktop home', off, { shot: 'calm_home' });
  await run('user chose OFF, phone home', off, { m: 1, shot: 'calm_m_home' });
  await run('user chose OFF, phone map', off, { m: 1, click: '#core', shot: 'calm_m_map', reach: 1 });
  await run('user chose OFF, desktop about', off, { path: '/about', reveal: 1, scroll: 700, shot: 'calm_about' });
  console.log('done');
})();
