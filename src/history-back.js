/**
 * Кнопка «Назад» браузера — тот же «назад», что жест и системная кнопка
 * Android (FT-567).
 *
 * Внутренние экраны (меню, карточка клиента, рацион, занятие) в историю
 * браузера не попадали: Back в браузере уводил со страницы целиком, хотя
 * жест на том же экране закрыл бы только верхний экран.
 *
 * Полноценного адреса у каждого экрана нет, и заводить его ради этого не
 * нужно. Достаточно одной «страховочной» записи в истории, пока в стопке
 * «назад» (gestures.jsx) есть хоть один экран: Back браузера снимает её —
 * мы закрываем верхний экран и, если под ним есть ещё, ставим запись
 * снова. Стопка опустела кнопкой в самом приложении — убираем запись
 * сами, чтобы следующий Back браузера сразу уходил со страницы, а не
 * тратился впустую.
 *
 * Синхронизация — после всех эффектов кадра (setTimeout 0): переход
 * «экран меню → другой экран меню» снимает и тут же ставит экран в
 * стопке, и дёргать историю на каждом шаге незачем. history.back()
 * асинхронный, поэтому его собственный popstate помечается и пропускается.
 *
 * В приложениях iOS и Android не работает: там у Back свой обработчик
 * (native.js), а история WebView наружу не видна.
 */

const MARK = 'ftBack';

const marked = (state) => !!(state && state[MARK]);

export function createHistoryGuard({ win, size, onBack }) {
  const history = win.history;
  // После перезагрузки страница может стоять на нашей же записи
  let guarded = marked(history.state);
  let skip = 0;
  let timer = null;

  const sync = () => {
    timer = null;
    const want = size() > 0;
    if (want && !guarded) {
      history.pushState({ ...(history.state || {}), [MARK]: true }, '');
      guarded = true;
    } else if (!want && guarded) {
      guarded = false;
      skip += 1;
      history.back();
    }
  };

  const schedule = () => {
    if (timer === null) timer = win.setTimeout(sync, 0);
  };

  const onPop = () => {
    if (skip > 0) { skip -= 1; return; }
    // Вперёд на нашу запись — просто снова на ней стоим
    if (marked(history.state)) { guarded = true; schedule(); return; }
    if (!guarded) return;
    guarded = false;
    onBack();
    schedule();
  };

  win.addEventListener('popstate', onPop);
  schedule();

  return {
    schedule,
    stop() {
      win.removeEventListener('popstate', onPop);
      if (timer !== null) win.clearTimeout(timer);
    },
  };
}
