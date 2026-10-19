import React from 'react';
import { BackButton } from './ui.jsx';

/**
 * Ошибка на экране тренировки — не серый экран (19.10.2026).
 *
 * Без границы любое исключение при отрисовке занятия размонтировало всё
 * приложение: оставался пустой фон, и так при каждом открытии того же
 * занятия. Черновик здесь не трогаем — он в localStorage и в очереди
 * телефона, «Повторить» просто заново открывает экран с ним.
 */
export default class WorkoutBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, attempt: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Видно в консоли (Safari Web Inspector) — с местом в разметке
    console.error('Экран тренировки упал:', error, info && info.componentStack);
  }

  retry = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));

  render() {
    const { error, attempt } = this.state;
    const { children, onClose, backLabel = 'Назад' } = this.props;
    if (!error) return <React.Fragment key={attempt}>{children}</React.Fragment>;
    return (
      <div className="workout" role="alert">
        {onClose && <BackButton label={backLabel} onClick={onClose} />}
        <h2>Не удалось открыть занятие</h2>
        <p className="muted">Отмеченное сохранено на этом устройстве и никуда не делось. Попробуйте ещё раз.</p>
        <button type="button" className="button button--primary button--block" onClick={this.retry}>Повторить</button>
      </div>
    );
  }
}
