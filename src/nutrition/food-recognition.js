import { gtinFromCode, parseLabel, labelScore } from './label-model.js';
import { localContrast } from './label-image.js';
export async function preparePhoto(file, rotation = 0) {
  if (!file || file.size > 20 * 1024 * 1024) throw new Error('Фото слишком большое. Выберите изображение до 20 МБ.');
  // Некоторые файловые менеджеры Android отдают файл без типа — тогда судит decode() ниже.
  if (file.type && !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) throw new Error('Выберите фото JPEG, PNG, WebP или HEIC.');
  const url = URL.createObjectURL(file), image = new Image();
  try {
    image.src = url; await image.decode();
    const w = image.naturalWidth, h = image.naturalHeight;
    if (!w || !h || w * h > 50_000_000) throw new Error('Уменьшите размер фотографии и попробуйте ещё раз.');
    const scale = Math.min(1, 2000 / Math.max(w, h)), sideways = rotation % 180 !== 0;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((sideways ? h : w) * scale); canvas.height = Math.round((sideways ? w : h) * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(image, -w * scale / 2, -h * scale / 2, w * scale, h * scale);
    return canvas;
  } catch (e) {
    if (e.message?.startsWith('Уменьшите')) throw e;
    throw new Error('Не удалось открыть фото. Переснимите этикетку или выберите JPEG.');
  } finally { URL.revokeObjectURL(url); }
}
export async function decodeBarcode(canvas) {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  let code;
  try { code = new BrowserMultiFormatReader().decodeFromCanvas(canvas).getText(); }
  catch { throw new Error('Штрихкод не прочитан. Снимите его ближе без бликов или впишите цифры.'); }
  const gtin = gtinFromCode(code);
  if (!gtin) throw new Error('Прочитан неподдерживаемый код. Нужен штрихкод EAN/UPC или квадратный код «Честного знака», а не QR-ссылка.');
  return gtin;
}
export function createRecognition({ progress = () => {}, base = document.baseURI, useBlobWorker = !/^https?:$/.test(new URL(base).protocol) } = {}) {
  let worker, stopped = false;
  const controller = new AbortController(), blobs = [];
  const stop = () => { stopped = true; controller.abort(); if (worker) { void worker.terminate(); worker = null; } for (const url of blobs.splice(0)) URL.revokeObjectURL(url); };
  const open = async () => {
    const { createWorker } = await import('tesseract.js');
    if (stopped) throw new Error('Распознавание отменено.');
    const root = new URL('./ocr/', base).href;
    const langs = 'rus+eng'; let workerPath = root + 'worker.min.js', corePath = root;
    // WKWebView использует capacitor://localhost: worker не должен сам
    // читать ресурсы нестандартной схемы. Загружаем комплект в главном окне,
    // передаём языки байтами и запускаем доверенный код сборки через Blob.
    if (useBlobWorker) {
      const fetchAsset = async (name, binary = false) => {
        const response = await fetch(root + name, { signal: controller.signal });
        if (!response.ok) throw new Error('Не удалось загрузить распознаватель из приложения. Повторите или заполните поля вручную.');
        return binary ? new Uint8Array(await response.arrayBuffer()) : response.text();
      };
      const [workerCode, coreCode, rus, eng] = await Promise.all([
        fetchAsset('worker.min.js'), fetchAsset('tesseract-core-lstm.wasm.js'), fetchAsset('rus.traineddata.gz', true), fetchAsset('eng.traineddata.gz', true),
      ]);
      if (stopped) throw new Error('Распознавание отменено.');
      const blobUrl = (source, type = 'text/javascript') => { const url = URL.createObjectURL(new Blob([source], { type })); blobs.push(url); return url; };
      const models = { [root + 'rus.traineddata.gz']: blobUrl(rus, 'application/octet-stream'), [root + 'eng.traineddata.gz']: blobUrl(eng, 'application/octet-stream') };
      // В worker доступны только Blob-копии локальных моделей, а не схема
      // WKWebView. У Tesseract 7 объектные языки некорректно инициализируются,
      // поэтому оставляем штатные имена rus+eng и подменяем адреса загрузки.
      const localFetch = `const localModels=${JSON.stringify(models)};const originalFetch=self.fetch.bind(self);self.fetch=(url,options)=>originalFetch(localModels[String(url)]||url,options);\n`;
      workerPath = blobUrl(localFetch + workerCode); corePath = blobUrl(coreCode) + '#core.js';
    }
    let pending;
    try { pending = await createWorker(langs, 1, { workerPath, corePath, langPath: root, workerBlobURL: false, cacheMethod: 'none', gzip: true, errorHandler: () => {}, logger: event => { if (!stopped) progress(event); } }); }
    catch (e) { stop(); throw e; }
    worker = pending;
    if (stopped) { await pending.terminate(); worker = null; throw new Error('Распознавание отменено.'); }
    return pending;
  };
  return { stop,
    async recognize(canvas) {
      const ocr = await open();
      try { const result = await ocr.recognize(canvas); return result.data.text; }
      finally { stop(); }
    },
    // Этикетка: до трёх прочтений одного фото, пока не найдены база и все четыре цифры.
    // 1) контраст по соседям, текст одним блоком; 2) он же, разрозненные строки (банка,
    // изгиб, наклон); 3) исходное фото разрозненными строками. parseLabel сводит прочтения
    // и берёт поле, только когда они не спорят.
    // Фото боком (FT-701: холодец снят поперёк) Tesseract читает мусором без «на 100 г».
    // Тогда первое прочтение повторяем на фото, повёрнутом на 90° и 270°, и дальше читаем
    // ту сторону, где база нашлась; onRotate получает угол и повёрнутое фото для превью.
    async readLabel(canvas, onPass = () => {}, onRotate = () => {}) {
      const ocr = await open();
      const read = async (image, mode) => {
        if (stopped) throw new Error('Распознавание отменено.');
        await ocr.setParameters({ tessedit_pageseg_mode: mode });
        return (await ocr.recognize(image)).data.text;
      };
      try {
        let photo = canvas, contrast = contrastCanvas(canvas);
        onPass(1, 3);
        let texts = [await read(contrast, '6')];
        if (!labelScore(parseLabel(texts))) {
          for (const angle of [90, 270]) {
            onPass(0, 0, angle);
            const turned = rotateCanvas(contrast, angle), text = await read(turned, '6');
            if (!labelScore(parseLabel(text))) continue;
            photo = rotateCanvas(canvas, angle); contrast = turned; texts = [text];
            onRotate(angle, photo);
            break;
          }
        }
        const passes = [[contrast, '11'], [photo, '11']];
        for (let i = 0; i < passes.length && labelScore(parseLabel(texts)) < 5; i++) {
          onPass(i + 2, 3);
          texts.push(await read(...passes[i]));
        }
        return texts;
      } finally { stop(); }
    },
  };
}
// Поворот по часовой стрелке на 90°/180°/270°
function rotateCanvas(canvas, angle) {
  const out = document.createElement('canvas'), sideways = angle % 180 !== 0;
  out.width = sideways ? canvas.height : canvas.width; out.height = sideways ? canvas.width : canvas.height;
  const ctx = out.getContext('2d');
  ctx.translate(out.width / 2, out.height / 2); ctx.rotate(angle * Math.PI / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}
// Серый снимок «тёмный текст на белом» той же величины (label-image.js)
function contrastCanvas(canvas) {
  const { width, height } = canvas, out = document.createElement('canvas');
  out.width = width; out.height = height;
  const pixels = canvas.getContext('2d').getImageData(0, 0, width, height);
  out.getContext('2d').putImageData(new ImageData(localContrast(pixels.data, width, height), width, height), 0, 0);
  return out;
}
