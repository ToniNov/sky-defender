import { Component, type ReactNode } from 'react';
import './App.css';
import { reportError } from './errors';

/** Если интерфейс упал при отрисовке: отправить ошибку и показать экран с перезапуском вместо пустоты. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportError(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen">
        <div className="card">
          <h2 className="title small">Что-то пошло не так</h2>
          <p className="subtitle">Мы уже получили отчёт об ошибке. Перезапусти игру — всё должно заработать.</p>
          <button className="btn primary" onClick={() => location.reload()}>
            Перезапустить
          </button>
        </div>
      </div>
    );
  }
}
