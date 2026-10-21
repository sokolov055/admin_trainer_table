// «Блины»: замер кадров на всех картах (FT-700, 22.10.2026, по скиллу game-developer).
// Запуск: npm run profile:blini [-- замедление процессора, например 4].
// Цель — 60 кадров в секунду: медиана и 95-й процентиль около 16,7 мс без замедления.
// Headless Chromium рисует без видеокарты — цифры хуже, чем на телефоне.
const { createServer } = await import('vite');
const { chromium } = await import('playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen(); const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'ru-RU' });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem('ft.blini.v1', JSON.stringify({ unlocked: 11 })));
await page.goto(origin + '/scripts/fixtures/blini-game.html');
await page.getByRole('button', { name: 'Играть', exact: true }).waitFor();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.argv[2]) || 1 });
await cdp.send('Performance.enable');
for (const level of [0, 1, 2, 3]) {
  await page.evaluate(l => { localStorage.setItem('ft.blini.v1', JSON.stringify({ unlocked: 11 })); showBlini({ identity: 'p' + l }); }, level);
  await page.getByRole('button', { name: 'Играть', exact: true }).waitFor();
  await page.evaluate(l => bliniFixture.choose(l), level);
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  await page.waitForTimeout(3000);
  const before = (await cdp.send('Performance.getMetrics')).metrics.reduce((m, x) => (m[x.name] = x.value, m), {});
  const frames = await page.evaluate(() => new Promise(resolve => {
    const out = []; let last = performance.now(); const end = last + 8000;
    const tick = t => { out.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else resolve(out); };
    requestAnimationFrame(tick);
  }));
  const after = (await cdp.send('Performance.getMetrics')).metrics.reduce((m, x) => (m[x.name] = x.value, m), {});
  frames.sort((a, b) => a - b);
  const q = p => frames[Math.floor(frames.length * p)].toFixed(1);
  const q2 = await page.evaluate(() => document.querySelector('.blini-canvas--play').dataset.quality); console.log(`q${q2} map ${level}: frames ${frames.length} p50 ${q(.5)}ms p95 ${q(.95)}ms max ${frames.at(-1).toFixed(0)}ms | script ${((after.ScriptDuration - before.ScriptDuration) * 1000).toFixed(0)}ms/8s | heap ${(after.JSHeapUsedSize / 1e6).toFixed(1)}MB | jank>33ms ${frames.filter(f => f > 33).length}`);
}
await browser.close(); await server.close();
