import React from 'react';

import { useData } from '../useData.js';
import { Empty, ErrorState, Loading, Panel, Row, Rows, Section, Tag, formatWhen } from '../ui.jsx';

/**
 * «Управление → AI-сканер» (FT-748, владелец 25.10.2026: «обучать модель
 * комментариями»). Дообучения модели с картинками нет — поэтому здесь
 * поправки людей рядом с ответом модели и тем, что записали в дневник. По ним
 * Claude правит подсказку модели и справочник.
 *
 * Без имён и номеров клиентов — как вся аналитика панели. Журнал хранится 90
 * дней (server/src/lib/food-photo.js).
 */

const KIND = { photo: 'Фото', label: 'Этикетка' };
const itemLine = (it) => [it.name, it.grams ? Math.round(it.grams) + ' г' : '', it.per100?.kcal ? Math.round(it.per100.kcal) + ' ккал/100' : ''].filter(Boolean).join(' · ');

export default function AdminAiScan() {
  const { data, loading, error, reload } = useData('owner.foodPhoto', { days: 30 }, []);
  if (loading && !data) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { total, rows } = data;
  return <>
    <Section title="За 30 дней">
      <Panel><Rows>
        <Row label="Распознано фото">{total.photos - total.labels}</Row>
        <Row label="Прочитано этикеток">{total.labels}</Row>
        <Row label="Записано в дневник">{total.saved}</Row>
        <Row label="Поправки «AI ошибся»">{total.complained}</Row>
      </Rows></Panel>
    </Section>
    <Section title="Поправки" note="Что ответил AI и что человек написал в ответ — по ним правится подсказка модели">
      {rows.length === 0 ? <Panel pad><Empty title="Поправок пока нет" text="Они появятся, когда кто-нибудь нажмёт «AI ошибся?» в листе распознавания." /></Panel>
        : rows.map((r) => <Panel pad key={r.id}>
          <div className="ai-fix">
            <div className="ai-fix__head"><Tag>{KIND[r.kind]}</Tag><span className="small muted">{formatWhen(r.at)}</span></div>
            <p className="ai-fix__text">«{r.feedback}»</p>
            <p className="small"><span className="muted">AI ответил: </span>{r.items.length ? r.items.map(itemLine).join('; ') : 'ничего не прочитал'}</p>
            {r.items[0]?.quote && <p className="small muted">Цитата с этикетки: «{r.items[0].quote}»</p>}
            {Array.isArray(r.confirmed) && <p className="small"><span className="muted">Записали: </span>{r.confirmed.map(itemLine).join('; ') || '—'}</p>}
          </div>
        </Panel>)}
    </Section>
  </>;
}
