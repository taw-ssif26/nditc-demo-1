const puppeteer = require('puppeteer-core'); const chromium = require('@sparticuz/chromium'); const C = chromium.default || chromium;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ex = await C.executablePath(); let bad = 0;
  for (const [path, w] of [['/', 390], ['/about', 390], ['/activities', 390], ['/projects', 390], ['/executives', 390], ['/publication', 390], ['/blog', 390], ['/contact', 390], ['/developers', 390], ['/policy', 390], ['/mobile-app', 390], ['/', 320], ['/executives', 320], ['/about', 320]]) {
    const b = await puppeteer.launch({ args: [...C.args, '--no-sandbox'], executablePath: ex, headless: 'shell' });
    try { const p = await b.newPage(); await p.setViewport({ width: w, height: 800, isMobile: true, hasTouch: true });
      const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 80)));
      await p.goto('http://127.0.0.1:8000' + path, { waitUntil: 'domcontentloaded' }); await sleep(2300);
      const m = await p.evaluate(() => { const h = document.querySelector('#view h1'); const r = h && h.getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, iw: innerWidth, h1right: r ? Math.round(r.right) : 0, h1w: h ? h.scrollWidth : 0, h1cw: h ? h.clientWidth : 0 }; });
      const ok = m.sw <= m.iw && m.h1w <= m.h1cw + 2 && !errs.length; if (!ok) bad++;
      console.log(ok ? 'ok  ' : 'BAD ', path, w, JSON.stringify(m), errs.join('|'));
    } catch (e) { console.log('FAIL', path, e.message.slice(0, 80)); bad++; } finally { await b.close(); }
  }
  console.log(bad ? bad + ' problems' : 'all pages fit'); 
})();
