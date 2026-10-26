import { Component } from 'react';

// A failed module download should leave a readable recovery action instead of a blank page.
export class ModuleBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <section role="alert">
      <h2>Не удалось открыть раздел</h2>
      <p>Обновите страницу, чтобы загрузить его заново. Вход восстановится, если сессия ещё действует. Сохранённые заявки останутся в кабинете.</p>
      <button type="button" onClick={() => window.location.reload()}>Обновить страницу</button>
    </section>;
    return this.props.children;
  }
}
