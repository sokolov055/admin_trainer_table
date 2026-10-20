import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
// Модели и исполняемый код входят в сборку, в том числе в iOS/Android.
// Версии и integrity закреплены package-lock.json; CDN в runtime не нужен.
export function ocrAssets() {
  const core = dirname(require.resolve('tesseract.js-core/package.json'));
  return [
    ['worker.min.js', join(dirname(require.resolve('tesseract.js/package.json')), 'dist/worker.min.js')],
    // *.wasm.js уже содержат бинарный WASM. Отдельные *.wasm не нужны.
    ...readdirSync(core).filter(n => /lstm\.wasm\.js$/.test(n)).map(n => [n, join(core, n)]),
    ...['rus', 'eng'].map(lang => [lang + '.traineddata.gz', join(dirname(require.resolve('@tesseract.js-data/' + lang + '/package.json')), '4.0.0_best_int', lang + '.traineddata.gz')]),
  ];
}
export function localOcrAssets() {
  return { name: 'fit-track-local-ocr', generateBundle() {
    for (const [name, path] of ocrAssets()) this.emitFile({ type: 'asset', fileName: 'ocr/' + name, source: readFileSync(path) });
  }, configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const name = req.url?.split('?')[0].split('/ocr/')[1];
      if (!name) return next();
      const asset = ocrAssets().find(([n]) => n === name);
      if (!asset) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
      res.end(readFileSync(asset[1]));
    });
  } };
}
