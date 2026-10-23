import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconAlert, IconCheck, IconKey, IconEmpty, IconDelta, IconExit, IconRefresh, IconSearch, IconBack, IconClose } from './icons.jsx';
import { useBackGesture } from './gestures.jsx';
import { environmentInfo } from './telegram.js';
import { hasToken, describeDevice } from './session.js';
import { logout } from './api.js';
import { stopBackgroundSync } from './native-sync.js';

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
  // Неотправленные тренировки (FT-566): сколько — и выходить ли всё равно
  const [unsent, setUnsent] = useState(0);

  if (!hasToken()) return null;

  const run = async (anyway = false) => {
    setBusy(true);
    // Тренировки, проведённые без сети, живут только на телефоне. Сначала
    // пробуем отправить; не ушли — спрашиваем: выход стирает их с телефона
    // (чужому человеку на этом устройстве они не должны достаться)
    const outbox = await import('./workout-outbox.js').catch(() => null);
    if (outbox && !anyway) {
      await outbox.flushOutbox().catch(() => {});
      const left = await outbox.pendingWorkouts().catch(() => 0);
      if (left) { setUnsent(left); setBusy(false); return; }
    }
    // Фоновая отправка шагов (Android) не должна пережить выход: её ключ
    // гасим первым, пока есть связь (native-sync.js)
    await stopBackgroundSync().catch(() => {});
    if (outbox) await outbox.forgetOfflineAccount().catch(() => {});
    await import('./offline-media.js').then((m) => m.forgetVideos()).catch(() => {});
    await import('./offline-account.js').then((m) => m.setOfflineAccount(null)).catch(() => {});
    // Сбрасывать busy не нужно: сразу после выхода экран сменится целиком
    logout();
  };

  return (
    <Section title="Вход">
      <Panel pad>
        <div className="setting">
          <div className="setting__label">{describeDevice()}</div>
          <button className="button" onClick={() => run(false)} disabled={busy}>
            <IconExit size={16} />
            {busy ? 'Выходим…' : 'Выйти'}
          </button>
          <div className="setting__note">
            Приложение закроется на этом устройстве. Чтобы вернуться,
            войдите снова — по почте или по ссылке тренера.
          </div>
          {unsent > 0 && (
            <div className="setting__note" role="alert">
              <strong>
                {unsent === 1 ? 'Одна запись ещё не отправлена' : 'Не отправлено записей: ' + unsent}
              </strong>{' '}
              (тренировки, замеры, настройки тренажёров) — нет связи с сервером.
              После выхода они удалятся с телефона.
              Лучше дождаться связи: тогда они отправятся сами.
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button className="button" onClick={() => setUnsent(0)} disabled={busy}>Не выходить</button>
                <button className="button button--critical" onClick={() => run(true)} disabled={busy}>Выйти и удалить</button>
              </div>
            </div>
          )}
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

/**
 * Число с единицей (FT-665): «72,4 кг», «5 000 ₽», «1 ч 20 мин». Число —
 * размером и весом места, где стоит; единица мельче и серым (.qty__unit).
 * Между ними неразрывный пробел: «кг» не уезжает на другую строку от
 * своего числа. Несколько пар — parts: [[1, 'ч'], [20, 'мин']].
 */
export function Qty({ value, unit, parts, className = '' }) {
  const list = parts || [[value, unit]];
  return (
    <span className={'qty' + (className ? ' ' + className : '')}>
      {list.map(([v, u], i) => (
        <React.Fragment key={i}>
          {i > 0 ? ' ' : ''}{v}
          {u ? <>&nbsp;<span className="qty__unit">{u}</span></> : null}
        </React.Fragment>
      ))}
    </span>
  );
}

/**
 * Видимый «назад» над заголовком экрана (FT-567). Жест и системный Back
 * делают то же самое, но о них нужно знать заранее; кнопка видна всем,
 * в том числе в браузере с мышью. Подпись — куда вернёт: «Клиенты»,
 * «Программа», а не безличное «Назад», если это известно.
 */
export function BackButton({ label = 'Назад', onClick }) {
  // «Клиенты», «Программа» — читалке экрана нужно ещё и «назад», иначе это
  // не отличить от одноимённой вкладки; «К списку» говорит само за себя
  const aria = label === 'Назад' || /^К /.test(label) ? undefined : 'Назад: ' + label;
  return (
    <button type="button" className="button button--ghost app__back" aria-label={aria} onClick={onClick}>
      <IconBack size={16} />
      {label}
    </button>
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
 * Метка в строке списка: тихая плашка без рамки, 12 px. Свойства записи
 * («анимация», «настройка», «2 тренажёра») — не статусы, и рамка с жирным
 * кеглем делала их громче названия. Цвет — только у того, что требует
 * внимания (good / warn).
 */
export function Tag({ tone, children }) {
  return <span className={'tag' + (tone ? ' tag--' + tone : '')}>{children}</span>;
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

/**
 * Ряд шире экрана прокручивается сам так, чтобы выбранный был виден: раздел
 * сменили жестом или снаружи — палец не должен искать его за краем.
 * Прокручивается сам ряд или, у вкладок в шапке, обёртка вокруг него
 * (.app__subnav): там ряд едет целиком, вместе со своей рамкой.
 */
function useActiveInView(rowRef, value) {
  const first = useRef(true);
  useLayoutEffect(() => {
    const row = rowRef.current;
    const active = row && row.querySelector('.chip--active');
    const wide = (el) => el && el.scrollWidth > el.clientWidth + 1;
    const scroller = wide(row) ? row : wide(row && row.parentElement) ? row.parentElement : null;
    const instant = first.current;
    first.current = false;
    if (!active || !scroller) return;
    const box = active.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const pad = 24;
    let delta = 0;
    if (box.left - pad < view.left) delta = box.left - pad - view.left;
    else if (box.right + pad > view.right) delta = box.right + pad - view.right;
    if (Math.abs(delta) < 1) return;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollBy({ left: delta, behavior: instant || reduce ? 'auto' : 'smooth' });
  }, [value]);
}

/**
 * Ряд подразделов в шапке (FT-567). Пять разделов карточки или библиотеки
 * на телефоне не помещаются, а полоса прокрутки скрыта — и раньше ничто не
 * говорило, что справа есть ещё «Питание» или «Блюда». Теперь край, за
 * которым есть что листать, затухает.
 */
/**
 * Классы края ряда, который листается вбок: is-more-left / is-more-right —
 * там ещё есть что листать, край затухает (styles.css). Общий для рядов
 * подразделов (SubNav) и фильтров (Chips): на «Клиентах» фильтры
 * «Требуют внимания» обрезались краем без всякого намёка (FT-567).
 */
function useEdgeFade(ref) {
  const [edges, setEdges] = useState('');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const check = () => {
      const rest = el.scrollWidth - el.clientWidth - el.scrollLeft;
      setEdges((el.scrollLeft > 4 ? ' is-more-left' : '') + (rest > 4 ? ' is-more-right' : ''));
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    if (ro) { ro.observe(el); [...el.children].forEach((child) => ro.observe(child)); }
    return () => { el.removeEventListener('scroll', check); if (ro) ro.disconnect(); };
  }, []);
  return edges;
}

export function SubNav({ className = '', children }) {
  const ref = useRef(null);
  const edges = useEdgeFade(ref);
  return <div ref={ref} className={'app__subnav' + (className ? ' ' + className : '') + edges}>{children}</div>;
}

export function Chips({ items, value, onChange, variant, className, label }) {
  const rowRef = useRef(null);
  useActiveInView(rowRef, value);
  const edges = useEdgeFade(rowRef);
  return (
    <div ref={rowRef} className={'chips' + (variant ? ' chips--' + variant : '') + (className ? ' ' + className : '') + edges} role="tablist" aria-label={label}>
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
export function Segmented({ items, value, onChange, label, disabled, wrap, track }) {
  // track — равные доли в утопленной дорожке: «чьи / какие» над списком,
  // чтобы не спорить с синими фильтрами ниже (раздел «Шаблоны»)
  return (
    <div className={'chips chips--flush' + (wrap ? ' chips--wrap' : '') + (track ? ' chips--track' : '')} role="radiogroup" aria-label={label}>
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
  inputMode = 'numeric', placeholder, inputRef, type = 'text', list,
}) {
  return (
    <label className={'field' + (error ? ' field--bad' : '')}>
      <span className="field__label">{label}</span>
      <input
        ref={inputRef}
        className="field__input"
        // Дата отдаётся браузеру: свой календарь на телефоне всегда хуже
        // родного, а «вчера» и «первое число» набирают именно в нём.
        type={type}
        // Список подсказок к полю со свободным вводом: браузер покажет
        // уже введённое, не занимая места на экране.
        list={list}
        inputMode={type === 'text' ? inputMode : undefined}
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
    <div className={'note note--' + tone} data-reveal="">
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
const DRAWER_DUR = 340;

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
 * делить разницу в миллисекундах на 24 часа. Так же с 23.10.2026 считает
 * и daysSince (relativeDays) ниже.
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

// Тоже в календарных днях: делением на сутки тренировка в среду в 07:30
// в пятницу в 06:58 выходила «вчера» (23.10.2026)
export function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  return Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
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

/* ==========================================================================
 * Нижний лист
 * ========================================================================== */

/** Листы знают друг о друге через контекст: вложенный лист накрывает
 *  родителя, и тот перестаёт отвечать на клавиши и чтение с экрана. */
const SheetContext = createContext(null);

/** Прокрутку страницы держит первый открытый лист и отпускает последний
 *  закрытый — вложенные листы один счётчик делят между собой. */
let sheetLocks = 0;
let sheetOverflow = '';
function lockPage() {
  if (sheetLocks++ === 0) {
    sheetOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
}
function unlockPage() {
  sheetLocks = Math.max(0, sheetLocks - 1);
  if (sheetLocks === 0) document.body.style.overflow = sheetOverflow;
}

/** Длительность ухода листа — та же, что в styles.css (.sheet.is-leaving) */
const SHEET_LEAVE = 220;

/**
 * Нижний лист — один на всё приложение (FT-577 анкета, FT-643 дневник).
 *
 * Выезжает снизу, живёт в body через портал, страницу под собой не даёт
 * прокручивать. Закрывается крестиком, Escape, системным «назад» и
 * касанием мимо — но касание мимо не трогает лист с набранной формой
 * (`dirty`): случайное движение пальца не должно стирать ввод.
 *
 * Листы складываются стопкой: лист, открытый из листа, рисуется поверх,
 * а нижний остаётся в DOM со всеми полями и получает `inert`. Закрытие
 * верхнего возвращает на нижний как он был.
 *
 * `locked` держит лист открытым, пока форма отправляется.
 *
 * Фокус: `focus` — селектор поля, которое получает фокус сразу (так
 * открывается клавиатура); без него — сам лист, чтобы читалка назвала
 * заголовок. На выходе фокус возвращается кнопке, которая лист открыла.
 *
 * Лист, открытый кнопкой вне себя («+» нижнего меню), закрывается и ею:
 * `closeRef.current()` — тот же уход, что у крестика, а `onLeaving` —
 * в первый кадр ухода, чтобы кнопка начала обратное движение вместе с
 * листом, а не после него.
 */
export function Sheet({ title, onClose, onDone, done = 'Готово', dirty = false, locked = false, focus, className, closeRef, onLeaving, children }) {
  const [leaving, setLeaving] = useState(false);
  const [covered, setCovered] = useState(0);
  const panel = useRef(null);
  const opener = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const titleId = useRef('sheet-title-' + Math.random().toString(36).slice(2, 8));
  const live = useRef({ leaving: false, covered: 0, locked, onClose });
  live.current.covered = covered;
  live.current.locked = locked;
  live.current.onClose = onClose;
  live.current.onLeaving = onLeaving;
  if (closeRef) closeRef.current = () => close(live.current.onClose);
  const parent = useContext(SheetContext);

  // locked — форма отправляется: лист не закрыть, пока не пришёл ответ
  const close = (cb) => {
    if (live.current.leaving || live.current.locked) return;
    live.current.leaving = true;
    setLeaving(true);
    if (live.current.onLeaving) live.current.onLeaving();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => {
      if (cb) cb();
      try { opener.current?.focus?.({ preventScroll: true }); } catch (_) {}
    }, reduce ? 0 : SHEET_LEAVE);
  };

  useBackGesture(() => close(live.current.onClose), true, null, { swipe: false });

  useEffect(() => {
    if (!parent) return undefined;
    parent.cover(1);
    return () => parent.cover(-1);
  }, [parent]);

  useLayoutEffect(() => {
    lockPage();
    const p = panel.current;
    // Поле с автофокусом уже взяло фокус при монтировании — не отбираем
    if (p && !p.contains(document.activeElement)) {
      const target = (focus && p.querySelector(focus)) || p.querySelector('[role="spinbutton"]') || p;
      try { target.focus({ preventScroll: true }); } catch (_) {}
      if (target !== p && typeof target.select === 'function') { try { target.select(); } catch (_) {} }
    }
    return () => unlockPage();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (live.current.covered || live.current.leaving) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(live.current.onClose); return; }
      if (e.key === 'Tab') keepFocusInside(e, panel.current);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const ctx = useMemo(() => ({ cover: (d) => setCovered((c) => Math.max(0, c + d)) }), []);
  const hidden = covered > 0 || leaving;

  return createPortal(
    <SheetContext.Provider value={ctx}>
      {/* data-no-gestures: барабан и списки внутри крутят вниз — это не «потяни, чтобы обновить» */}
      <div className={'sheet' + (leaving ? ' is-leaving' : '') + (covered ? ' is-covered' : '') + (className ? ' ' + className : '')}
        data-no-gestures="" inert={hidden ? '' : undefined} aria-hidden={hidden ? 'true' : undefined}>
        <div className="sheet__scrim" onClick={() => { if (!dirty) close(live.current.onClose); }} />
        <section ref={panel} className="sheet__panel" role="dialog" aria-modal="true" aria-labelledby={titleId.current} tabIndex={-1}>
          <span className="sheet__grip" aria-hidden="true" />
          <header className="sheet__head">
            <h2 id={titleId.current}>{title}</h2>
            <button type="button" className="sheet__close" aria-label="Закрыть" onClick={() => close(live.current.onClose)}><IconClose size={18} /></button>
          </header>
          <div className="sheet__body">{children}</div>
          {onDone && <button type="button" className="button button--primary button--block sheet__done" onClick={() => close(onDone)}>{done}</button>}
        </section>
      </div>
    </SheetContext.Provider>,
    document.body,
  );
}
