import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconAlert, IconCheck, IconKey, IconEmpty, IconDelta, IconExit, IconRefresh, IconSearch } from './icons.jsx';
import { environmentInfo } from './telegram.js';
import { hasToken, describeDevice } from './session.js';
import { logout } from './api.js';

/**
 * Состояние загрузки. Скелетоны повторяют форму будущего содержимого,
 * поэтому при появлении данных ничего не прыгает — в отличие от крутилки,
 * после которой экран собирается заново.
 */
export function Loading({ lead = true, rows = 3 }) {
  return (
    <div aria-busy="true" aria-live="polite">
      {lead && <div className="skeleton skeleton--lead" />}
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton skeleton--row" key={i} />
      ))}
    </div>
  );
}

/**
 * Ошибка. 401/403 — не поломка, а обычный сценарий: человек ещё не
 * привязан или сессия истекла. Такому случаю нужен путь дальше, а не
 * код ошибки.
 */
export function ErrorState({ error, onRetry }) {
  const code = error && error.code;
  const isAuth = code === 401 || code === 403;

  return (
    <div className="state">
      <div className="state__icon">
        {isAuth ? <IconKey size={30} /> : <IconAlert size={30} />}
      </div>
      <div className="state__title">
        {isAuth ? 'Нет доступа' : 'Не получилось загрузить'}
      </div>
      <div className="state__text">{(error && error.message) || 'Неизвестная ошибка'}</div>
      {onRetry && (
        <div className="state__action">
          <button className="button" onClick={onRetry}>
            <IconRefresh size={16} />
            Попробовать снова
          </button>
        </div>
      )}

      {/* При отказе в доступе важно понять, что именно не доехало:
          по-разному ломается на телефоне и в настольном клиенте */}
      {isAuth && <EnvDetails />}
    </div>
  );
}

function EnvDetails() {
  const info = environmentInfo();

  return (
    <details className="small muted" style={{ maxWidth: 420, margin: '18px auto 0' }}>
      <summary style={{ cursor: 'pointer', textAlign: 'center' }}>Подробности</summary>
      <div style={{ marginTop: 10, lineHeight: 1.7, textAlign: 'left' }}>
        <div>Подпись в адресе: {info.fromHash ? 'есть' : 'нет'}</div>
        <div>Длина подписи: {info.initDataLength}</div>
        <div>Скрипт Telegram: {info.sdkLoaded ? 'загружен' : 'не загружен'}</div>
        <div>Платформа: {info.platform}</div>
        <div>Версия: {info.version}</div>
      </div>
    </details>
  );
}

/** Пустое состояние объясняет, как оно заполнится, а не сообщает «пусто» */
export function Empty({ icon, title, text, action }) {
  const IconComponent = icon || IconEmpty;

  return (
    <div className="state">
      <div className="state__icon"><IconComponent size={30} /></div>
      {title && <div className="state__title">{title}</div>}
      {text && <div className="state__text">{text}</div>}
      {action && <div className="state__action">{action}</div>}
    </div>
  );
}

/**
 * Выход из приложения.
 *
 * Появляется, ТОЛЬКО когда в приложение вошли с устройства, по коду.
 * Внутри Telegram выходить не из чего: личность там подтверждает сам
 * мессенджер при каждом запуске, и кнопка «Выйти» либо ничего не сделала
 * бы, либо пообещала бы то, чего не умеет.
 *
 * Пути назад нет — после нажатия человек оказывается на экране входа, —
 * поэтому кнопка обычная, не основная, и рядом сказано, что будет дальше.
 */
export function SignOut() {
  const [busy, setBusy] = useState(false);

  if (!hasToken()) return null;

  const run = () => {
    setBusy(true);
    // Сбрасывать busy не нужно: сразу после выхода экран сменится целиком
    logout();
  };

  return (
    <Section title="Вход">
      <Panel pad>
        <div className="setting">
          <div className="setting__label">{describeDevice()}</div>
          <button className="button" onClick={run} disabled={busy}>
            <IconExit size={16} />
            {busy ? 'Выходим…' : 'Выйти'}
          </button>
          <div className="setting__note">
            Приложение закроется на этом устройстве. Чтобы вернуться,
            понадобится новое подтверждение в Telegram.
          </div>
        </div>
      </Panel>
    </Section>
  );
}

/* ==========================================================================
 * Ведущий показатель
 * ========================================================================== */

/**
 * Один крупный факт и приглушённый ряд уточнений под ним.
 *
 * Ряд одинаковых плиток выглядит аккуратно, но заставляет сравнивать всё
 * со всем: ни один показатель не главный, поэтому экран не отвечает сразу
 * ни на один вопрос. Здесь ответ на главный вопрос экрана виден мгновенно,
 * а остальное читается, когда понадобится.
 */
export function Lead({ label, value, hint, tone, facts }) {
  // Тон красит всю область, а не одну строку: цвет должен успеть сообщить
  // состояние раньше, чем прочитаны цифры.
  const toneClass = tone ? ' lead--' + tone : '';

  return (
    <section className={'lead enter' + toneClass}>
      <div className="lead__label">{label}</div>
      <div className="lead__value">{value}</div>
      {hint && <div className="lead__hint">{hint}</div>}

      {facts && facts.length > 0 && (
        <div className="lead__facts">
          {facts.filter(Boolean).map((f, i) => (
            <div className="fact" key={i}>
              <div className="fact__label">{f.label}</div>
              <div className="fact__value">{f.value}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function Section({ title, note, children, action }) {
  return (
    <section className="section enter">
      {(title || note || action) && (
        <div className="section__head">
          <div>
            {title && <h2 className="section__title">{title}</h2>}
            {note && <div className="section__note">{note}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Panel({ children, pad = false, className = '' }) {
  return <div className={'panel' + (pad ? ' panel--pad' : '') + (className ? ' ' + className : '')}>{children}</div>;
}

export function Rows({ children }) {
  return <div className="rows">{children}</div>;
}

export function Row({ label, children }) {
  return (
    <div className="rows__item">
      <span className="rows__label">{label}</span>
      <span className="rows__value">{children}</span>
    </div>
  );
}

/* ==========================================================================
 * Значки и дельты
 * ========================================================================== */

export function Badge({ kind, children }) {
  const cls = kind ? ' badge--' + kind : '';
  return (
    <span className={'badge' + cls}>
      {kind && <span className="badge__dot" />}
      {children}
    </span>
  );
}

/**
 * Статусы из таблицы приходят строками вида «✅ 08.09.2026» — их пишет
 * 90_ClientStats.js. Символ разбираем и заменяем значком приложения:
 * чужая эмодзи-графика внутри своего интерфейса выглядит заплаткой.
 */
export function StatusBadge({ value, fallback = '—' }) {
  const s = String(value || '').trim();
  if (!s) return <span className="muted">{fallback}</span>;

  if (s.indexOf('✅') === 0) return <Badge kind="good">{s.replace('✅', '').trim()}</Badge>;
  if (s.indexOf('❌') === 0) return <Badge kind="bad">{s.replace('❌', '').trim()}</Badge>;
  if (s.indexOf('⚠️') === 0) return <Badge kind="warn">{s.replace('⚠️', '').trim()}</Badge>;

  // Сплит-пара: «Имя: ✅ дата | Имя: ❌ дата» — показываем целиком
  return <span className="small">{s}</span>;
}

/**
 * Изменение показателя: стрелка, число и цвет.
 *
 * `aim` — куда изменению полагается идти по цели человека: 1 — вверх,
 * -1 — вниз, 0 — оценивать нечем. Зелёный и бордовый значат «по плану» и
 * «против плана», а не «больше» и «меньше»: плюс 2,8 кг у человека на
 * похудении — не достижение, и красить его в зелёный только потому, что
 * число выросло, значит хвалить за то, чего он не хотел.
 *
 * При aim = 0 цвета нет вовсе: стрелка направление покажет, а оценку
 * выдумывать не из чего — цель не выбрана или к ней этот обхват не привязан.
 * По умолчанию aim = 1: рабочие веса растут в плюс при любой цели.
 */
export function Delta({ value, suffix = '', digits, aim = 1 }) {
  const cls = !aim || value === 0
    ? 'delta--flat'
    : (value * aim > 0 ? 'delta--good' : 'delta--off');

  return (
    <span className={'delta ' + cls}>
      <IconDelta value={value} size={13} />
      {formatNumber(Math.abs(value), digits)}{suffix}
    </span>
  );
}

/* ==========================================================================
 * Управление
 * ========================================================================== */

export function Chips({ items, value, onChange, variant }) {
  return (
    <div className={'chips' + (variant ? ' chips--' + variant : '')} role="tablist">
      {items.map((item) => {
        const key = typeof item === 'string' ? item : item.value;
        const label = typeof item === 'string' ? item : item.label;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={key === value}
            className={'chip' + (key === value ? ' chip--active' : '')}
            onClick={() => onChange(key)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Выбор одного значения из нескольких — внешне тот же ряд, что и фильтры,
 * но это не вкладки: здесь не переключают вид, а меняют настройку. Поэтому
 * роль другая (radiogroup), и с клавиатуры он ведёт себя как переключатель.
 */
export function Segmented({ items, value, onChange, label, disabled }) {
  return (
    <div className="chips chips--flush" role="radiogroup" aria-label={label}>
      {items.map((item) => {
        const key = typeof item === 'string' ? item : item.value;
        const text = typeof item === 'string' ? item : item.label;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={key === value}
            className={'chip' + (key === value ? ' chip--active' : '')}
            onClick={() => onChange(key)}
            disabled={disabled}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Выбор одного значения из длинного списка.
 *
 * Тот же переключатель, что Segmented, но поставленный столбиком. Разница
 * не в оформлении, а в длине подписей: «Средняя: 3–5 тренировок в неделю»
 * в ряд не помещается, и ряд начинает прокручиваться вбок — половина
 * вариантов уезжает за край, и человек выбирает из того, что увидел.
 * В столбик видно всё сразу, а строка во всю ширину — заведомо крупная
 * цель для пальца.
 *
 * Выпадающий список решал бы ту же задачу, но прячет варианты за лишним
 * нажатием и открывает системное колесо поверх экрана. Здесь вариантов
 * три-пять, прятать нечего.
 */
export function Options({ items, value, onChange, label, disabled }) {
  return (
    <div className="options" role="radiogroup" aria-label={label}>
      {items.map((item) => {
        const key = typeof item === 'string' ? item : item.value;
        const text = typeof item === 'string' ? item : item.label;
        const active = key === value;

        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            className={'option' + (active ? ' option--active' : '')}
            onClick={() => onChange(key)}
            disabled={disabled}
          >
            <span className="option__mark">{active && <IconCheck size={12} />}</span>
            <span className="option__label">{text}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Поле ввода с подписью и местом под ошибку.
 *
 * type="text" при inputMode, а не type="number": числовая клавиатура нужна,
 * а вот поведение числового поля — нет. В нём «76,9» в части браузеров
 * превращается в пустую строку, колесо мыши незаметно меняет значение, а
 * стрелки-стрелочки на телефоне только сужают поле. Запятую разбираем сами
 * — ровно так же, как это делает сервер.
 *
 * Ошибка живёт под полем, а не в общем списке сверху: чинить надо здесь,
 * и читать про это надо здесь же.
 */
export function Field({
  label, hint, value, onChange, onFocus, error, disabled,
  inputMode = 'numeric', placeholder, inputRef,
}) {
  return (
    <label className={'field' + (error ? ' field--bad' : '')}>
      <span className="field__label">{label}</span>
      <input
        ref={inputRef}
        className="field__input"
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
      />
      {error
        ? <span className="field__error">{error}</span>
        : hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

/**
 * Короткое сообщение о том, чем кончилось действие.
 *
 * Тон красит всю плашку целиком — заливка, рамка и текст одного семейства,
 * — потому что цвет должен сообщить исход раньше, чем прочитан текст.
 */
export function Note({ tone = 'info', icon, children }) {
  const IconComponent = icon || (tone === 'critical' ? IconAlert : tone === 'good' ? IconCheck : IconAlert);

  return (
    <div className={'note note--' + tone}>
      <span className="note__icon"><IconComponent size={18} /></span>
      <div className="note__text">{children}</div>
    </div>
  );
}

/* ==========================================================================
 * Выдвижное меню
 * ========================================================================== */

/** Совпадает с длительностью перехода в styles.css: панель должна уехать
 *  до того, как её размонтируют, иначе закрытие происходит рывком */
const DRAWER_DUR = 260;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Боковая панель поверх экрана.
 *
 * Здесь собрана вся механика, которую легко недоделать и на которой меню
 * сразу начинает ощущаться дешёвым: фокус уходит внутрь и возвращается на
 * кнопку, Tab не выпадает наружу, страница под меню не прокручивается,
 * закрыть можно мимо, с клавиатуры и смахиванием.
 *
 * Открывается меню кнопкой, а не свайпом от края: в Android с жестовой
 * навигацией свайп от края — системное «назад», и приложение проиграло бы
 * этот спор. Смахивание для закрытия начинается внутри панели и ничему не
 * мешает.
 */
export function Drawer({ open, onClose, label, children }) {
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState(0);

  // Монтаж и размонтаж разведены с анимацией: панель живёт в DOM на время
  // обратного перехода.
  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), DRAWER_DUR);
    return () => clearTimeout(timer);
  }, [open]);

  useLayoutEffect(() => {
    if (!mounted || !open) return;

    // Панель уже в DOM, но ещё в закрытом положении. Чтобы переход проиграл,
    // браузер должен это положение посчитать — отсюда обращение к offsetWidth:
    // оно заставляет пересчитать стили до того, как появится класс открытия.
    // Через requestAnimationFrame это же место работает не везде: в вебвью
    // без композитора кадры могут не выдаваться вовсе, и меню замирает
    // за краем экрана.
    const panel = panelRef.current;
    if (panel) void panel.offsetWidth;
    setShown(true);
  }, [mounted, open]);

  useEffect(() => {
    if (!mounted) return undefined;

    const returnTo = document.activeElement;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key === 'Tab') keepFocusInside(e, panelRef.current);
    };

    document.addEventListener('keydown', onKey);

    // Фокус переносим на саму панель, а не на первый пункт: подсвеченный
    // пункт читался бы как уже выбранный. Tab отсюда уходит внутрь меню.
    const panel = panelRef.current;
    if (panel) {
      try { panel.focus({ preventScroll: true }); } catch (_) {}
    }

    return () => {
      document.removeEventListener('keydown', onKey);
      body.style.overflow = prevOverflow;
      // Фокус возвращается туда, откуда меню открыли, иначе следующий Tab
      // начнёт обход страницы с начала.
      if (returnTo && returnTo.focus) {
        try { returnTo.focus({ preventScroll: true }); } catch (_) {}
      }
    };
  }, [mounted]);

  if (!mounted) return null;

  const onTouchStart = (e) => {
    const t = e.touches[0];
    dragRef.current = { x: t.clientX, y: t.clientY, at: Date.now(), dx: 0, axis: null };
  };

  const onTouchMove = (e) => {
    const st = dragRef.current;
    if (!st) return;

    const t = e.touches[0];
    const dx = t.clientX - st.x;
    const dy = t.clientY - st.y;

    // Направление определяем один раз: иначе список внутри меню начинает
    // дёргаться вбок при обычной вертикальной прокрутке.
    if (!st.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      st.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (st.axis !== 'x') return;

    st.dx = Math.max(0, dx);
    setDrag(st.dx);
  };

  const onTouchEnd = () => {
    const st = dragRef.current;
    dragRef.current = null;
    setDrag(0);
    if (!st || st.axis !== 'x') return;

    // Быстрый короткий бросок закрывает так же, как медленный длинный:
    // палец говорит о намерении не только расстоянием. Но совсем короткое
    // движение остаётся промахом при нажатии, а не жестом.
    const speed = st.dx / Math.max(1, Date.now() - st.at);
    const width = panelRef.current ? panelRef.current.offsetWidth : 320;
    if (st.dx > width * 0.3 || (st.dx > 32 && speed > 0.5)) closeRef.current();
  };

  return (
    <div className={'drawer' + (shown ? ' drawer--in' : '')}>
      <div className="drawer__scrim" onClick={() => closeRef.current()} />
      <div
        className="drawer__panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={drag ? { transform: 'translateX(' + drag + 'px)', transition: 'none' } : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

function keepFocusInside(e, panel) {
  if (!panel) return;

  const nodes = Array.prototype.slice.call(panel.querySelectorAll(FOCUSABLE));
  if (nodes.length === 0) {
    e.preventDefault();
    panel.focus();
    return;
  }

  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement;
  const outside = !panel.contains(active);

  // Shift+Tab с самой панели увёл бы фокус на страницу за меню
  if (e.shiftKey && active === panel) {
    e.preventDefault();
    last.focus();
    return;
  }

  if (e.shiftKey && (active === first || outside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || outside)) {
    e.preventDefault();
    first.focus();
  }
}

export function Search({ value, onChange, placeholder = 'Поиск' }) {
  return (
    <div className="search">
      <span className="search__icon"><IconSearch size={17} /></span>
      <input
        className="search__input"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function DataTable({ headers, rows, numericFrom }) {
  if (!rows || rows.length === 0) return <Empty text="Нет данных" />;

  const isNum = (i) => numericFrom !== undefined && i >= numericFrom;

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={isNum(i) ? 'num' : ''}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className={isNum(ci) ? 'num' : ''}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ==========================================================================
 * Форматирование
 * ========================================================================== */

export function formatNumber(n, digits) {
  if (n === null || n === undefined || n === '') return '—';
  const num = typeof n === 'number' ? n : parseFloat(String(n).replace(',', '.'));
  if (!Number.isFinite(num)) return String(n);

  const d = digits !== undefined ? digits : (Number.isInteger(num) ? 0 : 1);
  return num.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function formatMoney(n, { compact = false } = {}) {
  const num = typeof n === 'number' ? n : parseFloat(n);
  if (!Number.isFinite(num)) return '—';

  if (compact && Math.abs(num) >= 100000) {
    return Math.round(num / 1000).toLocaleString('ru-RU') + ' тыс ₽';
  }
  return num.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽';
}

export function formatDate(iso, withYear = true) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);

  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/** «10:00» — время занятия; дата приходит без пояса, это часы тренера */
export function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';

  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// Винительный падеж — «во вторник», а не «вторник». Список вместо правил:
// семь слов, зато без грамматических сюрпризов у «среды» и «вторника».
const WEEKDAY_AT = [
  'в воскресенье', 'в понедельник', 'во вторник', 'в среду',
  'в четверг', 'в пятницу', 'в субботу',
];

/**
 * Когда занятие: «сегодня, 10:00», «завтра, 10:00», «в пятницу, 10:00»,
 * дальше недели — «26 сентября, 10:00».
 *
 * Считаем разницу в КАЛЕНДАРНЫХ днях, а не в сутках: занятие сегодня в
 * 18:00 — это «сегодня», хотя до него меньше суток, и «завтра», если
 * делить разницу в миллисекундах на 24 часа. Именно так ошибается
 * relativeDays, поэтому здесь отдельный расчёт.
 */
export function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';

  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);

  const time = formatTime(iso);

  if (days === 0) return 'сегодня, ' + time;
  if (days === 1) return 'завтра, ' + time;
  if (days === 2) return 'послезавтра, ' + time;
  if (days > 2 && days < 7) return WEEKDAY_AT[d.getDay()] + ', ' + time;

  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + ', ' + time;
}

export function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/** «3 дня назад» вместо даты там, где важна свежесть, а не сам день */
export function relativeDays(iso) {
  const days = daysSince(iso);
  if (days === null) return '—';

  // Дата в будущем — не «сегодня». Раньше отрицательная разница сваливалась
  // в ту же ветку, и запланированная тренировка выглядела как проведённая
  // сегодня — ошибка, которую на экране не отличить от правды.
  if (days < 0) {
    const ahead = -days;
    if (ahead === 1) return 'завтра';
    return 'через ' + ahead + ' ' + plural(ahead, 'день', 'дня', 'дней');
  }

  if (days === 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return days + ' ' + plural(days, 'день', 'дня', 'дней') + ' назад';
}

export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
