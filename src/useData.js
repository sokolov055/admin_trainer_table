import { useState, useEffect } from 'react';
import { apiStale } from './api.js';

/**
 * Загрузка данных экрана.
 *
 * Главное здесь — порядок появления. Если для этого экрана что-то уже
 * лежит в кэше, оно показывается СРАЗУ, без скелетонов, а свежие данные
 * подгружаются в фоне и заменяют показанное. При задержках Apps Script в
 * несколько секунд это разница между «приложение тормозит» и «приложение
 * открылось, цифры на глазах обновились».
 *
 * Отдельный случай — обрыв связи. Если запрос не удался, но старые данные
 * есть, экран не превращается в ошибку: показываем что было и помечаем
 * признаком stale. Ошибку во весь экран человек видит, только когда
 * показать действительно нечего.
 *
 * Возвращает { data, loading, stale, error, reload }:
 *   loading — нечего показать и данные едут;
 *   stale   — показанное могло устареть, обновление идёт или не удалось.
 */
export function useData(action, params, deps = []) {
  const [state, setState] = useState({
    data: null, loading: true, stale: false, error: null,
  });

  const load = () => {
    const { data, stale, promise } = apiStale(action, params);

    setState(data
      ? { data, loading: false, stale: true, error: null }
      : { data: null, loading: true, stale: false, error: null });

    promise
      .then((fresh) => setState({ data: fresh, loading: false, stale: false, error: null }))
      .catch((error) => {
        setState((prev) => (prev.data
          // Есть что показать — оставляем, но честно помечаем устаревшим
          ? { ...prev, loading: false, stale: true }
          : { data: null, loading: false, stale: false, error }));
      });
  };

  useEffect(load, deps);

  return { ...state, reload: load };
}
