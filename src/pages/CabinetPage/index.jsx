import './styles.css';
import React, { lazy, Suspense, useEffect } from 'react';
import { PAGES } from '../../config/pages.js';
import { ModuleBoundary } from '../../components/ModuleBoundary.jsx';

const CreditCabinet = lazy(() => import('../CreditCabinet/index.jsx'));

export default function CabinetPage() {
  useEffect(() => {
    document.title = 'Заявки | Умный кредитный кабинет';
  }, []);

  return (
    <div className="cabinet-page">
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      <header className="cabinet-page-header">
        <a className="brand" href={PAGES.HOME} aria-label="Умный кредитный кабинет — на главную">
          <span className="brand-name">умный кредитный<br />кабинет</span>
</a>
        <a className="cabinet-home-link" href={PAGES.HOME}>На главную</a>
      </header>
      <main className="cabinet-page-main container" id="main">
        <div className="cabinet-page-intro">
          <span className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Кредит для бизнеса</span>
          <h1>Кредитный путь<br /><em>под вашу задачу</em></h1>
          <p>Подбирайте продукт, продолжайте черновики и следите за статусом заявок в одном месте.</p>
        </div>
        <h2 className="visually-hidden">Работа с заявками</h2>
        <ModuleBoundary><Suspense fallback={<p role="status">Открываем кабинет…</p>}><CreditCabinet /></Suspense></ModuleBoundary>
        <p className="cabinet-page-note">Данные компаний синтетические. Реальные банковские операции не выполняются.</p>
      </main>
    </div>
  );
}

