const puppeteer = require('puppeteer-core'); const chromium = require('@sparticuz/chromium'); const C = chromium.default || chromium;
const sleep = ms => new Promise(r => setTimeout(r, ms)); const M = !!process.env.M;
(async () => {
  const b = await puppeteer.launch({ args: [...C.args, '--no-sandbox'], executablePath: await C.executablePath(), headless: 'shell' });
  const p = await b.newPage(); await p.setViewport(M ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  await p.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' }); await sleep(2500);
  await p.evaluate(() => document.getElementById('core').click()); await sleep(1200);
  const r = await p.evaluate(() => { const worst = {}; let samples = 0, blockedSamples = 0;
    for (let t = 0; t < 240000; t += 4000) {
      document.querySelectorAll('#wr .orb, #wr .pi').forEach(el => el.getAnimations().forEach(a => { a.pause(); a.currentTime = t; }));
      samples++; let any = false;
      document.querySelectorAll('#wr .mi').forEach(a => { const s = a.querySelector('i').getBoundingClientRect(), x = s.x + s.width / 2, y = s.y + s.height / 2;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return; const hit = document.elementFromPoint(x, y);
        if (!(hit && hit.closest('.mi') === a)) { any = true; const w = a.dataset.w; worst[w] = (worst[w] || 0) + 1; } });
      if (any) blockedSamples++;
    } return { samples, blockedSamples, worst }; });
  console.log(`${M ? 'phone' : 'desktop'}: planet centres blocked in ${r.blockedSamples} of ${r.samples} orbit positions`, JSON.stringify(r.worst));
  await b.close();
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
