import React from 'react';
import { IconAlert, IconKey, IconEmpty, IconDelta, IconRefresh, IconSearch } from './icons.jsx';

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
    </div>
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

export function Delta({ value, suffix = '', digits }) {
  const cls = value > 0 ? 'delta--up' : value < 0 ? 'delta--down' : 'delta--flat';
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

export function Chips({ items, value, onChange }) {
  return (
    <div className="chips" role="tablist">
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
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days < 5) return days + ' дня назад';
  return days + ' дней назад';
}

export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
