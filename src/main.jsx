import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import heroArt from '../assets/alpha-cat-hero.png';
import CreditCabinet from './CreditCabinet';
import './styles.css';

function LandingPage() {
  useEffect(() => {
    const items = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach((item) => item.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="page-shell">
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Умный кредитный кабинет — на главную">
          <span className="brand-mark">а<span>.</span></span>
          <span className="brand-name">умный кредитный<br />кабинет</span>
        </a>
        <nav className="header-nav" aria-label="Основная навигация">
          <a href="#why">Зачем</a>
          <a href="#how">Как работает</a>
          <a href="#products">Продукты</a>
        </nav>
        <a href="/cabinet" className="landing-button header-cta">
          Начать подбор <span aria-hidden="true">↗</span>
        </a>
      </header>

      <main id="main">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero-glow hero-glow-one" aria-hidden="true" />
          <div className="hero-glow hero-glow-two" aria-hidden="true" />
          <div className="container hero-layout">
            <div className="hero-copy">
              <span className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Кредит для идей бизнеса</span>
              <h1 id="hero-title">Деньги нужны бизнесу.<br /><em>Ясность</em> — вам.</h1>
              <p className="hero-lede">От задачи бизнеса до отправленной заявки: подберите продукт, сохраните черновик и следите за ходом проверки в одном кабинете.</p>
              <div className="hero-actions">
                <a href="/cabinet" className="landing-button cta-large">
                  Начать подбор <span aria-hidden="true">↗</span>
                </a>
                <a className="text-link light-link" href="#how">Как это работает <span aria-hidden="true">↓</span></a>
              </div>
              <p className="hero-note">Сценарий работает на синтетических данных. Решение по кредиту и выдача средств пока готовятся.</p>
            </div>
            <div className="hero-visual" aria-label="Иллюстрация с красным котом и голубым телефоном">
              <div className="hero-orbit orbit-one" aria-hidden="true" />
              <div className="hero-orbit orbit-two" aria-hidden="true" />
              <img className="hero-art" src={heroArt} alt="Красный 3D-кот рядом с голубым телефоном" />
              <div className="float-card float-card-flowers" aria-hidden="true"><span className="float-card-emoji">💐</span><span>Цветочный магазин</span></div>
              <div className="float-card float-card-new-place" aria-hidden="true"><span className="float-card-emoji">🔑</span><span>Новая точка</span></div>
              <div className="float-card float-card-car-wash" aria-hidden="true"><span className="float-card-emoji">🚗</span><span>Автомойка</span></div>
              <div className="float-card float-card-shawarma" aria-hidden="true"><span className="float-card-emoji">🥙</span><span>Шаурмечная</span></div>
              <span className="hero-sparkle hero-sparkle-star" aria-hidden="true">✦</span>
              <span className="hero-sparkle hero-sparkle-gift" aria-hidden="true">🎁</span>
            </div>
          </div>
        </section>

        <section className="pain section-pad" id="why" aria-labelledby="pain-title">
          <div className="container">
            <div className="section-head" data-reveal>
              <span className="eyebrow">01 / Узнаёте ситуацию?</span>
              <h2 id="pain-title">Кредитный путь не должен<br />быть <span className="marker">сложнее бизнеса.</span></h2>
              <p>Важное решение сложно принять, когда информация разрознена, а после отправки заявки начинается тишина.</p>
            </div>
            <div className="pain-grid">
              <article className="pain-card" data-reveal>
                <span className="card-index">01</span><div className="pain-symbol">?</div>
                <h3>Какой продукт подойдёт?</h3>
                <p>Названия похожи, условия разные. Хочется понять выбор на языке своей задачи.</p>
              </article>
              <article className="pain-card" data-reveal>
                <span className="card-index">02</span><div className="pain-symbol">≡</div>
                <h3>Что нужно заполнить?</h3>
                <p>Форма просит много данных, но не объясняет, зачем они нужны и что будет дальше.</p>
              </article>
              <article className="pain-card" data-reveal>
                <span className="card-index">03</span><div className="pain-symbol">…</div>
                <h3>Где сейчас заявка?</h3>
                <p>После отправки важно видеть этап рассмотрения и следующий понятный шаг.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="approach section-pad" id="how" aria-labelledby="approach-title">
          <div className="container approach-grid">
            <div className="approach-copy" data-reveal>
              <span className="eyebrow eyebrow-light">02 / Вместо неопределённости</span>
              <h2 id="approach-title">Один маршрут.<br /><span>Без догадок.</span></h2>
              <p>Выберите цель, подготовьте документы и отправьте заявку. В кабинете вы увидите сохранённый статус и историю автоматических проверок.</p>
              <ol className="step-list">
                <li><span>01</span><div><strong>Опишите задачу</strong><small>Выберите цель, сумму и срок.</small></div></li>
                <li><span>02</span><div><strong>Сравните варианты</strong><small>Посмотрите предварительный подбор двух продуктов.</small></div></li>
                <li><span>03</span><div><strong>Следите за заявкой</strong><small>Сохраните черновик, загрузите документы и отслеживайте проверку.</small></div></li>
              </ol>
              <a href="/cabinet" className="secondary-link">Начать подбор <span aria-hidden="true">↗</span></a>
            </div>
            <div className="dashboard-scene" data-reveal aria-hidden="true">
              <div className="scene-halo" />
              <div className="scene-card scene-card-back"><span>ЗАЯВКА / 001</span><strong>Всё под контролем</strong><div className="scene-line" /><div className="scene-line short" /></div>
              <div className="scene-card scene-card-front">
                <div className="scene-card-top"><span>КРЕДИТНЫЙ КАБИНЕТ</span><span>✦</span></div>
                <div className="scene-chart"><span /><span /><span /><span /><span /><span /><span /></div>
                <div className="scene-card-bottom"><strong>Путь заявки</strong><div><i /><i /><i /><i /></div><small>Следующий шаг — всегда виден</small></div>
              </div>
              <div className="scene-stamp">ясно.<span>↗</span></div>
            </div>
          </div>
        </section>

        <section className="products section-pad" id="products" aria-labelledby="products-title">
          <div className="container">
            <div className="section-head compact" data-reveal>
              <span className="eyebrow">03 / Для разных задач</span>
              <h2 id="products-title">Не просто «взять кредит».<br /><span className="marker">Решить вашу задачу.</span></h2>
              <p>Несколько задач бизнеса, два кредитных продукта для первого релиза. Выбор начинается с вашей цели.</p>
            </div>
            <div className="product-grid">
              <article className="product-card turnover-card" data-reveal>
                <div className="product-top"><span>01 / На каждый день</span><span className="product-glyph">↺</span></div>
                <div><h3>Оборотные<br />средства</h3><p>Закупка товаров, материалов и текущие расходы бизнеса.</p></div>
                <a className="product-link" href="/cabinet?purpose=stock">Подобрать вариант <span aria-hidden="true">↗</span></a>
              </article>
              <article className="product-card equipment-card" data-reveal>
                <div className="product-top"><span>02 / На развитие</span><span className="product-glyph">↗</span></div>
                <div><h3>Инвестиционный<br />кредит</h3><p>Покупка оборудования для следующего этапа роста.</p></div>
                <a className="product-link" href="/cabinet?purpose=equipment">Подобрать вариант <span aria-hidden="true">↗</span></a>
              </article>
            </div>
            <p className="fine-print">Подбор типа продукта не означает одобрение кредита и не является индивидуальным предложением.</p>
          </div>
        </section>

        <section className="clarity section-pad" id="status" aria-labelledby="clarity-title">
          <div className="container clarity-grid">
            <div data-reveal>
              <span className="eyebrow">04 / Видно, что дальше</span>
              <h2 id="clarity-title">Заявка не пропадает<br />в <span className="marker">чёрном ящике.</span></h2>
              <p>Кабинет показывает, что заявка отправлена, когда началась обработка и какие этапы проверки уже пройдены.</p>
              <ul className="check-list"><li>Понятные статусы без внутренних терминов</li><li>История обработки в одном месте</li><li>Объяснение дальнейших действий</li></ul>
            </div>
            <div className="status-panel" data-reveal>
              <div className="status-panel-head"><span>ПРИМЕР ЭКРАНА ЗАЯВКИ</span><span className="status-dot">● Статус</span></div>
              <strong className="status-title">Заявка на проверке</strong>
              <p>Заявка отправлена. Система проверяет данные компании и кредитную историю; ход обработки виден в кабинете.</p>
              <div className="status-track"><span className="done" /><span className="active" /><span /><span /></div>
              <div className="status-labels"><span>Черновик</span><span>Отправка</span><span>Проверки</span><span>Решение</span></div>
              <div className="next-step"><span>Следующий шаг</span><strong>Проверяйте новые события в истории</strong></div>
            </div>
          </div>
        </section>

        <section className="cabinet-preview section-pad" id="start" aria-labelledby="preview-title">
          <div className="container preview-layout">
            <div className="preview-intro" data-reveal>
              <span className="eyebrow eyebrow-light">05 / Ваш следующий шаг</span>
              <h2 id="preview-title">Начните с цели.<br /><em>Продолжите в кабинете.</em></h2>
              <p>Попробуйте два пути: со счётом в Альфа-Банке и со счётом в другом банке. Подберите продукт, сохраните черновик и следите за заявкой.</p>
              <a href="/cabinet" className="landing-button cta-large">Перейти в кабинет <span aria-hidden="true">↗</span></a>
              <div className="preview-annotation"><span>✳</span><p>Компании и данные здесь синтетические. Это прототип без реальных банковских операций.</p></div>
            </div>
            <div className="preview-card" data-reveal aria-label="Этапы работы в кабинете">
              <div className="preview-card-top"><span>ЛИЧНЫЙ КАБИНЕТ</span><span className="preview-card-mark">а.</span></div>
              <ol>
                <li><span>01</span><div><strong>Выберите компанию</strong><small>Откройте кабинет с данными примера.</small></div><b aria-hidden="true">↗</b></li>
                <li><span>02</span><div><strong>Подберите вариант</strong><small>Укажите задачу и параметры финансирования.</small></div><b aria-hidden="true">↗</b></li>
                <li><span>03</span><div><strong>Следите за заявкой</strong><small>Черновик, документы и история проверки.</small></div><b aria-hidden="true">↗</b></li>
              </ol>
              <a href="/cabinet" className="preview-card-link">Открыть кабинет <span aria-hidden="true">→</span></a>
            </div>
          </div>
        </section>

        <section className="faq section-pad" aria-labelledby="faq-title">
          <div className="container faq-grid">
            <div data-reveal><span className="eyebrow">06 / Без мелкого шрифта</span><h2 id="faq-title">Важное —<br /><span className="marker">сразу понятно.</span></h2></div>
            <div className="faq-list" data-reveal>
              <details><summary>Это настоящий банковский сервис?<span aria-hidden="true">+</span></summary><p>Нет. Это прототип для хакатона на синтетических данных. Заявки сохраняются в сервисе проекта; реальных банковских операций нет.</p></details>
              <details><summary>Подбор означает одобрение?<span aria-hidden="true">+</span></summary><p>Нет. Подбор предлагает тип продукта. После отправки заявки система выполняет проверки, а финальное кредитное решение пока не реализовано.</p></details>
              <details><summary>Нужен ли счёт в Альфа-Банке до заявки?<span aria-hidden="true">+</span></summary><p>Нет. По опубликованным условиям банка счёт можно открыть после одобрения заявки; для выдачи денег он понадобится. В этом прототипе оба пути показаны на синтетических компаниях.</p></details>
              <details><summary>Что нужно для отправки?<span aria-hidden="true">+</span></summary><p>Укажите цель, сумму, срок, выручку и расходы. Если счёт в другом банке и нужен оборотный кредит, приложите выписку для подтверждения оборотов. Другие требования кабинет покажет перед отправкой.</p></details>
              <details><summary>Почему кредитных продуктов два?<span aria-hidden="true">+</span></summary><p>В первом релизе показаны оборотные средства и инвестиционный кредит. Другую задачу можно описать и сохранить в черновике; для отправки заявки пока нужно выбрать поддерживаемую цель.</p></details>
            </div>
          </div>
        </section>

        <section className="closing" aria-labelledby="closing-title">
          <div className="container closing-inner" data-reveal><span className="eyebrow eyebrow-light">Следующий шаг — за вами</span><h2 id="closing-title">Бизнесу — движение.<br /><em>Вам — ясность.</em></h2><p>Посмотрите, как начинается понятный кредитный путь.</p><a href="/cabinet" className="landing-button cta-large">Начать подбор <span aria-hidden="true">↗</span></a><div className="closing-orb" aria-hidden="true">а.</div></div>
        </section>
      </main>

      <footer className="site-footer"><div className="container footer-inner"><div className="footer-brand"><span className="brand-mark">а<span>.</span></span><span>Умный кредитный кабинет<br /><small>Проект для хакатона, 2026</small></span></div><a href="#top">Наверх ↑</a><p>Прототип на синтетических данных. Не является банковским предложением.</p></div></footer>
    </div>
  );
}

function CabinetPage() {
  useEffect(() => {
    document.title = 'Личный кабинет | Умный кредитный кабинет';
  }, []);

  return (
    <div className="cabinet-page">
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      <header className="cabinet-page-header">
        <a className="brand" href="/" aria-label="Умный кредитный кабинет — на главную">
          <span className="brand-mark">а<span>.</span></span>
          <span className="brand-name">умный кредитный<br />кабинет</span>
        </a>
        <a className="cabinet-home-link" href="/">← На главную</a>
      </header>
      <main className="cabinet-page-main container" id="main">
        <div className="cabinet-page-intro">
          <span className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Личный кабинет предпринимателя</span>
          <h1>Кредитный путь<br /><em>под вашу задачу.</em></h1>
          <p>Подбирайте продукт, продолжайте черновики и следите за статусом заявок в одном месте.</p>
        </div>
        <h2 className="visually-hidden">Работа с заявками</h2>
        <CreditCabinet />
        <p className="cabinet-page-note">Сведения компаний учебные. Прототип не выполняет реальные банковские операции.</p>
      </main>
    </div>
  );
}

const path = window.location.pathname.replace(/\/+$/, '') || '/';
createRoot(document.getElementById('root')).render(path === '/cabinet' ? <CabinetPage /> : <LandingPage />);
