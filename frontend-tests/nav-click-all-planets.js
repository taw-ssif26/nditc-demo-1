const puppeteer = require('puppeteer-core'); const chromium = require('@sparticuz/chromium'); const C = chromium.default || chromium;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EXPECT = { home: '/', about: '/about', activities: '/activities', portal: '/portal', projects: '/projects', executives: '/executives', publication: '/publication', blog: '/blog', contact: '/contact', developers: '/developers', policy: '/policy', app: '/mobile-app' };
(async () => {
  const ex = await C.executablePath();
  for (const M of [false, true]) {
    let good = 0; const bad = [];
    for (const [name, path] of Object.entries(EXPECT)) {
      const b = await puppeteer.launch({ args: [...C.args, '--no-sandbox'], executablePath: ex, headless: 'shell' });
      try {
        const p = await b.newPage(); await p.setViewport(M ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
        await p.goto('http://127.0.0.1:8000' + (name === 'home' ? '/about' : '/'), { waitUntil: 'domcontentloaded' });
        await p.waitForFunction(() => document.getElementById('ld').classList.contains('off'), { timeout: 20000 }); await sleep(800);
        const press = async sel => { const [x, y] = await p.evaluate(q => { const r = document.querySelector(q).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel); if (M) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
        await press('#core'); await p.waitForFunction(() => document.getElementById('wr').classList.contains('on'), { timeout: 8000 }); await sleep(1000);
        await press(`#wr .mi[data-w="${name}"] i`);
        let at = ''; for (let i = 0; i < 24; i++) { await sleep(250); at = await p.evaluate(() => location.pathname); if (at === path && (name === 'home' ? at === '/' : true)) break; }
        if (at === path) good++; else bad.push(`${name}: ended on ${at}`);
      } catch (e) { bad.push(name + ': ' + e.message.slice(0, 70)); } finally { await b.close(); }
    }
    console.log(`${M ? 'PHONE TAP  ' : 'DESKTOP CLICK'}: ${good}/12 planets lead to the right page` + (bad.length ? ' | PROBLEMS: ' + bad.join('; ') : ''));
  }
  console.log('finished');
})();
