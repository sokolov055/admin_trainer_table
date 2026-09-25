import React from 'react';
import { useData } from '../useData.js';
import { Section, Panel, Rows, Row, Loading, formatNumber, plural } from '../ui.jsx';
import { RECIPES } from './recipes.js';
import { useData as useCatalogData } from '../useData.js';
import { extraTotals } from './match.js';

/**
 * Рацион клиента глазами тренера (карточка → «Питание»).
 *
 * Отметки клиента теперь на сервере, поэтому тренер видит настоящие: что
 * съедено сверх подобранного сегодня, что человек ест чаще всего за месяц,
 * что у него дома и какие блюда ему нравятся. Только чтение — рацион
 * меняет сам клиент.
 */
export default function RationSummary({ clientRow }) {
  const { loading, data: raw } = useData('ration.summary', { clientRow }, [clientRow]);
  // Названия блюд — из каталога сервера (там и новые); встроенный — запасной
  const catalog = useCatalogData('dishes.list', {}, []);

  if (loading) return <Loading lead={false} rows={2} />;
  // Старый сервер или сбой — поля может не быть: пусто, а не падение экрана
  const data = raw && { ...raw, extras: raw.extras || [], frequent: raw.frequent || [], liked: raw.liked || [] };
  if (!data || (!data.saved && !data.extras.length && !data.frequent.length)) {
    return (
      <Section title="Рацион клиента">
        <Panel pad>
          <p className="small muted" style={{ margin: 0 }}>
            Клиент ещё не открывал подбор рациона. Когда отметит продукты и блюда
            или добавит своё — это появится здесь.
          </p>
        </Panel>
      </Section>
    );
  }

  const eaten = extraTotals(data.extras);
  const names = new Map(RECIPES.map((r) => [r.id, r.name]));
  ((catalog.data && catalog.data.dishes) || []).forEach((d) => names.set(d.id, d.name));
  const likedNames = (data.liked || []).map((id) => names.get(id)).filter(Boolean);

  return (
    <>
      <Section title="Сверх плана сегодня" note={data.extras.length ? formatNumber(eaten.kcal) + ' ккал' : undefined}>
        <Panel>
          {data.extras.length
            ? (
              <Rows>
                {data.extras.map((e) => (
                  <Row key={e.id} label={e.product.name}>
                    {e.pieces && e.product.piece ? formatNumber(e.pieces) + ' шт.' : formatNumber(e.grams) + ' г'}
                    {' · '}{formatNumber(Math.round(e.product.kcal * e.grams / 100))} ккал
                  </Row>
                ))}
              </Rows>
            )
            : <p className="small muted" style={{ margin: 0, padding: 'var(--space-4)' }}>Сегодня ничего сверх подобранного.</p>}
        </Panel>
      </Section>

      {data.frequent.length > 0 && (
        <Section title="Что ест чаще" note="за 30 дней">
          <Panel>
            <Rows>
              {data.frequent.map((f) => (
                <Row key={f.name} label={f.name}>
                  {f.times} {plural(f.times, 'раз', 'раза', 'раз')} · {formatNumber(f.kcal)} ккал
                </Row>
              ))}
            </Rows>
          </Panel>
        </Section>
      )}

      {data.saved && (
        <Section title="Подбор блюд">
          <Panel pad>
            <p className="small" style={{ marginTop: 0 }}>
              <strong>Дома:</strong>{' '}
              {(data.pantry || []).length ? data.pantry.join(', ') : 'ничего не отмечено'}
            </p>
            <p className="small" style={{ marginBottom: 0 }}>
              <strong>Нравится:</strong>{' '}
              {likedNames.length ? likedNames.join(', ') : 'пока ничего'}
            </p>
          </Panel>
        </Section>
      )}
    </>
  );
}
