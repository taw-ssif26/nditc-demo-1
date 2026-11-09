const puppeteer = require('puppeteer-core'); const chromium = require('@sparticuz/chromium');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const C = chromium.default || chromium;
(async () => {
  const ex = await C.executablePath();
  const shot = async (name, path, o = {}) => {
    const b = await puppeteer.launch({ args: [...C.args, '--no-sandbox'], executablePath: ex, headless: 'shell' });
    try {
      const p = await b.newPage(); const m = !!o.m;
      await p.setViewport(m ? { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
      p.on('pageerror', e => console.log('PAGEERROR', name, e.message.slice(0, 120)));
      await p.goto('http://127.0.0.1:8000' + path, { waitUntil: 'domcontentloaded' }); await sleep(2800);
      if (o.click) { await p.evaluate(q => document.querySelector(q).click(), o.click); await sleep(1500); }
      if (o.scroll) { await p.evaluate(y => scrollTo(0, y), o.scroll); await sleep(1800); }
      if (o.full) await p.evaluate(() => document.querySelectorAll('.rv').forEach(e => e.classList.add('in')));
      await sleep(500); await p.screenshot({ path: `/tmp/shots/${name}.png` });
      if (o.metrics) console.log(name, await p.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: innerWidth, h: document.documentElement.scrollHeight })));
    } catch (e) { console.log('SHOTFAIL', name, e.message.slice(0, 100)); } finally { await b.close(); }
  };
  const which = (process.env.ONLY || '').split(',').filter(Boolean);
  const all = [['map', '/', { click: '#core' }], ['about', '/about', { scroll: 1400 }], ['m_home', '/', { m: 1, metrics: 1 }], ['m_home2', '/', { m: 1, scroll: 900, full: 1 }], ['m_map', '/', { m: 1, click: '#core' }], ['m_about', '/about', { m: 1, scroll: 1500, full: 1, metrics: 1 }], ['m_exec', '/executives', { m: 1 }]];
  for (const a of all) if (!which.length || which.includes(a[0])) await shot(...a);
  console.log('done');
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
