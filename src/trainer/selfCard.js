import { useCallback, useEffect, useState } from 'react';
import { apiMutate } from '../api.js';
import { setSelfRow } from '../native-activity.js';

/**
 * Карточка самого тренера («Мои тренировки», сервер: trainer.self). Заводится
 * при первом обращении; не владельцу — не спрашиваем: раздел пока его.
 *
 * Своей строкой в общем списке клиентов её нет (trainer.clients её не
 * отдаёт), поэтому каждый выбор клиента, куда тренер может захотеть себя, —
 * журнал, назначение шаблона, — ставит её первой отдельно.
 */
export function useSelfCard(enabled) {
  const [state, setState] = useState({ card: null, error: null, loading: !!enabled });
  const load = useCallback(() => {
    if (!enabled) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    apiMutate('trainer.self', {})
      .then((card) => { setSelfRow(card && card.clientRow); setState({ card, error: null, loading: false }); })
      .catch((error) => setState({ card: null, error, loading: false }));
  }, [enabled]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/** Строка «Я · Имя» для списка выбора клиента. */
export const selfPick = (card) => (card ? { row: card.clientRow, name: 'Я · ' + card.name, note: 'Мои тренировки' } : null);
