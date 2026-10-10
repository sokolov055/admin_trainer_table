// Картинки публичного сайта (public/site/img): настоящие экраны демо-сборки
// в рамках iPhone и Apple Watch из генератора карточек App Store.
// Исходники лежат в основном репозитории: ../store-screenshots/cards/assets.
//
//   node scripts/build-site-images.mjs
//
// Рамку и экран сводит Chromium на canvas и отдаёт webp, без sharp.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const assets = resolve(root, '..', 'store-screenshots', 'cards', 'assets');
const output = resolve(root, 'public', 'site', 'img');

const PHONES = ['c-workout-after', 'c-home', 'c-summary-muscles', 'c-awards', 'c-weight',
  'n-ration-1', 't-home', 't-schedule'];
const WATCHES = ['01', '02', '04'];

const dataUrl = (path) => `data:image/png;base64,${readFileSync(path).toString('base64')}`;

mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();

async function compose({ frame, screen, frameW, frameH, x, y, w, h, radius, outW }) {
  const webp = await page.evaluate(async (o) => {
    const load = (src) => new Promise((ok, fail) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = fail;
      img.src = src;
    });
    const [frameImg, screenImg] = await Promise.all([load(o.frame), load(o.screen)]);
    const k = o.outW / o.frameW;
    const canvas = document.createElement('canvas');
    canvas.width = o.outW;
    canvas.height = Math.round(o.frameH * k);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(o.x * k, o.y * k, o.w * k, o.h * k, o.radius * k);
    ctx.clip();
    ctx.drawImage(screenImg, o.x * k, o.y * k, o.w * k, o.h * k);
    ctx.restore();
    ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.86);
  }, { frame, screen, frameW, frameH, x, y, w, h, radius, outW });
  return Buffer.from(webp.split(',')[1], 'base64');
}

const phoneFrame = dataUrl(resolve(assets, 'iphone-portrait.png'));
for (const name of PHONES) {
  const file = resolve(output, `${name}.webp`);
  writeFileSync(file, await compose({
    frame: phoneFrame, screen: dataUrl(resolve(assets, 'screens', `${name}.png`)),
    frameW: 1470, frameH: 3000, x: 75, y: 66, w: 1320, h: 2868, radius: 190, outW: 760,
  }));
  console.log(file);
}

const watchFrame = dataUrl(resolve(assets, 'watch.png'));
for (const name of WATCHES) {
  const file = resolve(output, `watch-${name}.webp`);
  writeFileSync(file, await compose({
    frame: watchFrame, screen: dataUrl(resolve(assets, 'watch', `${name}.png`)),
    frameW: 600, frameH: 960, x: 88, y: 222, w: 423, h: 515, radius: 64, outW: 420,
  }));
  console.log(file);
}

await browser.close();
