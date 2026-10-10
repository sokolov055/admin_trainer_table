const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

// Меню на телефоне: полноэкранный список разделов
const toggle = document.querySelector('.menu-toggle');
const nav = document.getElementById('site-nav');
if (toggle && nav) {
  const setOpen = (open) => {
    // Меню начинается под шапкой: над ней может быть полоса объявления
    if (open) nav.style.setProperty('--menu-top', `${Math.round(nav.parentElement.getBoundingClientRect().bottom)}px`);
    document.documentElement.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (event) => { if (event.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
  matchMedia('(min-width: 761px)').addEventListener('change', (event) => { if (event.matches) setOpen(false); });
}

// Демо оценки подхода — те же правила, что в приложении (src/effort.js):
// легко → следующие подходы +2,5 кг (отдых короче, только если прибавлять некуда);
// тяжело → отдых на 30 с дольше, вес снижается, если не добил повторы
// или тяжело второй раз подряд; норм — всё как в плане.
const demo = document.querySelector('[data-effort-demo]');
if (demo) {
  const OUTCOMES = {
    easy: { next: '75 кг', rest: '1:30', why: '+2,5 кг · было легко. Оставшиеся подходы стали тяжелее.' },
    norm: { next: '72,5 кг', rest: '1:30', why: 'Как в плане. Два раза «норм» подряд — и в следующий раз вес вырастет.' },
    hard: { next: '72,5 кг', rest: '2:00', why: 'Вес тот же, отдых дольше. Не добили повторы или тяжело второй раз — вес снизится.' },
  };
  const next = demo.querySelector('[data-next]');
  const rest = demo.querySelector('[data-rest]');
  const why = demo.querySelector('[data-why]');
  const buttons = demo.querySelectorAll('[data-effort]');

  const swap = (element, value) => {
    if (element.textContent === value) return;
    element.textContent = value;
    element.classList.remove('is-changed');
    void element.offsetWidth; // перезапуск анимации смены значения
    element.classList.add('is-changed');
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const effort = button.dataset.effort;
      const outcome = OUTCOMES[effort];
      demo.dataset.state = effort;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      swap(next, outcome.next);
      swap(rest, outcome.rest);
      swap(why, outcome.why);
    });
  });
}
