/**
 * «Вышла новая версия» на iPhone (22.10.2026): из App Store — ссылка на
 * App Store, из TestFlight — на TestFlight. Последние версии обоих каналов
 * отдаёт сервер (GET /ios/versions.json, server/src/lib/app-versions.js).
 *
 * Из какого канала приложение, телефон не говорит. Отличаем по номеру:
 * сборка новее той, что в App Store, бывает только в TestFlight. Сборку
 * TestFlight не старше App Store человек получит и из App Store — это та
 * же версия или новее, поэтому ссылка на App Store ей тоже верна.
 *
 * Чистые функции без телефона — проверка в scripts/test-app-update.mjs.
 */

/** 1.10 > 1.9; недостающие части — нули */
export function compareVersions(a, b) {
  const pa = String(a || '').split('.').map(Number);
  const pb = String(b || '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * mine — { version, build } установленного приложения (App.getInfo).
 * Вернёт { store, version, build, url } или null, если обновляться не на что.
 */
export function iosUpdate(versions, mine) {
  const ios = versions && versions.ios;
  const build = Number(mine && mine.build) || 0;
  const version = String((mine && mine.version) || '');
  if (!ios || !build) return null;
  const store = ios.appStore && ios.appStore.url ? ios.appStore : null;
  const beta = ios.testflight && ios.testflight.url ? ios.testflight : null;

  const storeBuild = store ? Number(store.build) || 0 : 0;
  // Сборка из TestFlight: новее App Store по номеру, а без номера — по версии
  const fromBeta = !store || (storeBuild ? build > storeBuild : compareVersions(version, store.version) > 0);

  if (fromBeta) {
    if (beta && Number(beta.build) > build) return { store: 'TestFlight', version: beta.version, build: Number(beta.build), url: beta.url };
    return null;
  }
  const newer = compareVersions(store.version, version) > 0 || (storeBuild > build && compareVersions(store.version, version) === 0);
  return newer ? { store: 'App Store', version: store.version, build: storeBuild, url: store.url } : null;
}

/** Текст плашки */
export function updateText(update) {
  return `Вышла новая версия ${update.version} — обновите в ${update.store}`;
}
