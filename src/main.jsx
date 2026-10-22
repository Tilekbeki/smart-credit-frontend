import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';
import heroArt from '../assets/alpha-cat-hero.png';
import './styles.css';

const scrollToSection = (id, block = 'start') => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block });
};

const formatRubles = (value) => new Intl.NumberFormat('ru-RU').format(Number(value));

function App() {
  const [goal, setGoal] = useState('turnover');
  const [amount, setAmount] = useState('1500000');
  const [term, setTerm] = useState('12');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const items = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach((item) => item.classList.add('is-visible'));
      return;
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

  const showRecommendation = (event) => {
    event.preventDefault();
    const requestedAmount = Number(amount);
    const months = Number(term);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || !Number.isInteger(months) || months <= 0) {
      setResult(null);
      setError('Укажите положительную сумму и срок в целых месяцах.');
      return;
    }
    setError('');
    setResult({ goal, amount: requestedAmount, term: months });
    window.requestAnimationFrame(() => scrollToSection('demo-result', 'nearest'));
  };

  const chosenProduct = result?.goal === 'equipment'
    ? { name: 'Инвестиционный кредит', reason: 'Для покупки оборудования и развития производственных возможностей.', icon: '↗' }
    : { name: 'Кредит на оборотные средства', reason: 'Для закупок, материалов и текущих расходов бизнеса.', icon: '↺' };

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
        <Button view="primary" onClick={() => scrollToSection('demo')} className="header-cta">
          Открыть демо <span aria-hidden="true">↗</span>
        </Button>
      </header>

      <main id="main">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero-glow hero-glow-one" aria-hidden="true" />
          <div className="hero-glow hero-glow-two" aria-hidden="true" />
          <div className="container hero-layout">
            <div className="hero-copy">
              <span className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Концепт для Альфа-Будущее Хакатона</span>
              <h1 id="hero-title">Деньги нужны бизнесу.<br /><em>Ясность</em> — вам.</h1>
              <p className="hero-lede">Понятный путь от выбора кредитного продукта до статуса заявки. Без банковского лабиринта и догадок о следующем шаге.</p>
              <div className="hero-actions">
                <Button view="primary" onClick={() => scrollToSection('demo')} className="cta-large">
                  Открыть демо <span aria-hidden="true">↗</span>
                </Button>
                <a className="text-link light-link" href="#how">Как это работает <span aria-hidden="true">↓</span></a>
              </div>
              <p className="hero-note">Демонстрация на синтетических данных. Без реальной заявки и выдачи кредита.</p>
            </div>
            <div className="hero-visual" aria-label="Иллюстрация концепта с красным котом и голубым телефоном">
              <div className="hero-orbit orbit-one" aria-hidden="true" />
              <div className="hero-orbit orbit-two" aria-hidden="true" />
              <img className="hero-art" src={heroArt} alt="Красный 3D-кот рядом с голубым телефоном" />
              <div className="float-card float-card-top" aria-hidden="true">
                <span className="float-card-icon">✦</span>
                <span>Вариант под вашу цель</span>
              </div>
              <div className="float-card float-card-bottom" aria-hidden="true">
                <span className="status-pulse" />
                <span>Статус всегда на виду</span>
              </div>
            </div>
          </div>
          <div className="container hero-footer">
            <span>01 / 06</span>
            <div className="hero-progress"><span /></div>
            <a href="#why">Листайте вниз <span aria-hidden="true">↘</span></a>
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
              <h2 id="approach-title">Один маршрут.<br /><span>Три понятных шага.</span></h2>
              <p>Так мы задумали полноценный кабинет: сначала понятный выбор, затем заявка и прозрачный статус на каждом этапе.</p>
              <ol className="step-list">
                <li><span>01</span><div><strong>Выберите цель</strong><small>Демо-подбор по цели уже работает ниже.</small></div></li>
                <li><span>02</span><div><strong>Соберите заявку</strong><small>В полной версии объясним поля и сохраним черновик.</small></div></li>
                <li><span>03</span><div><strong>Следите за статусом</strong><small>В полной версии покажем этап, результат и следующий шаг.</small></div></li>
              </ol>
              <Button view="secondary" colors="inverted" onClick={() => scrollToSection('demo')}>Попробовать демо <span aria-hidden="true">↗</span></Button>
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
              <p>В демо представлены два типа финансирования. Выбор начинается с того, для чего бизнесу нужны средства.</p>
            </div>
            <div className="product-grid">
              <article className="product-card turnover-card" data-reveal>
                <div className="product-top"><span>01 / На каждый день</span><span className="product-glyph">↺</span></div>
                <div><h3>Оборотные<br />средства</h3><p>Закупка товаров, материалов и текущие расходы бизнеса.</p></div>
                <button className="product-link" type="button" onClick={() => { setGoal('turnover'); setResult(null); setError(''); scrollToSection('demo'); }}>Посмотреть в демо <span aria-hidden="true">↗</span></button>
              </article>
              <article className="product-card equipment-card" data-reveal>
                <div className="product-top"><span>02 / На развитие</span><span className="product-glyph">↗</span></div>
                <div><h3>Инвестиционный<br />кредит</h3><p>Покупка оборудования для следующего этапа роста.</p></div>
                <button className="product-link" type="button" onClick={() => { setGoal('equipment'); setResult(null); setError(''); scrollToSection('demo'); }}>Посмотреть в демо <span aria-hidden="true">↗</span></button>
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
              <p>Идея кабинета — показывать текущий этап обработки, его смысл и то, требуется ли действие предпринимателя.</p>
              <ul className="check-list"><li>Понятные статусы без внутренних терминов</li><li>Результат и условия в одном месте</li><li>Объяснение дальнейших действий</li></ul>
            </div>
            <div className="status-panel" data-reveal>
              <div className="status-panel-head"><span>ПРИМЕР ЭКРАНА ЗАЯВКИ</span><span className="status-dot">● Демо</span></div>
              <strong className="status-title">На рассмотрении</strong>
              <p>Система проверяет данные компании и финансовые показатели.</p>
              <div className="status-track"><span className="done" /><span className="done" /><span className="active" /><span /></div>
              <div className="status-labels"><span>Черновик</span><span>Отправлена</span><span>Проверка</span><span>Результат</span></div>
              <div className="next-step"><span>Что дальше</span><strong>Пока ничего делать не нужно</strong></div>
            </div>
          </div>
        </section>

        <section className="demo section-pad" id="demo" aria-labelledby="demo-title">
          <div className="container demo-layout">
            <div className="demo-intro" data-reveal>
              <span className="eyebrow eyebrow-light">05 / Попробуйте сами</span>
              <h2 id="demo-title">Начните с цели.<br /><em>Остальное — яснее.</em></h2>
              <p>Пройдите короткий демо-подбор. Он показывает логику интерфейса на примере двух продуктов.</p>
              <div className="demo-annotation"><span>✳</span><p>Это прототип: он не проверяет вашу кредитоспособность, не рассчитывает ставку и не создаёт заявку в банке.</p></div>
            </div>
            <form className="finder" onSubmit={showRecommendation} data-reveal>
              <div className="finder-head"><span>ДЕМО-ПОДБОР</span><span>1 минута</span></div>
              <fieldset className="goal-fieldset"><legend>Для чего нужны средства?</legend>
                <label className={`goal-option ${goal === 'turnover' ? 'selected' : ''}`}><input type="radio" name="goal" value="turnover" checked={goal === 'turnover'} onChange={() => { setGoal('turnover'); setResult(null); setError(''); }} /><span className="goal-icon">↺</span><span><strong>Для текущих расходов</strong><small>Товары, материалы, оборот</small></span><span className="goal-check" aria-hidden="true">✓</span></label>
                <label className={`goal-option ${goal === 'equipment' ? 'selected' : ''}`}><input type="radio" name="goal" value="equipment" checked={goal === 'equipment'} onChange={() => { setGoal('equipment'); setResult(null); setError(''); }} /><span className="goal-icon">↗</span><span><strong>Для покупки оборудования</strong><small>Техника и развитие</small></span><span className="goal-check" aria-hidden="true">✓</span></label>
              </fieldset>
              <div className="finder-inputs">
                <Input label="Сумма, ₽" type="number" min="1" value={amount} onChange={(_, data) => { setAmount(data?.value ?? ''); setResult(null); setError(''); }} />
                <Input label="Срок, мес." type="number" min="1" value={term} onChange={(_, data) => { setTerm(data?.value ?? ''); setResult(null); setError(''); }} />
              </div>
              <p className="field-note">Сумма и срок показываются в примере заявки; на выбор типа продукта здесь влияет только цель.</p>
              {error && <p className="form-error" role="alert">{error}</p>}
              <Button view="primary" type="submit" block className="finder-submit">Показать вариант <span aria-hidden="true">↗</span></Button>
              {result && <div className="finder-result" id="demo-result" role="status" aria-live="polite"><div className="result-icon">{chosenProduct.icon}</div><span>Подходящий тип для указанной цели</span><h3>{chosenProduct.name}</h3><p>{chosenProduct.reason}</p><div className="result-meta"><span>{formatRubles(result.amount)} ₽</span><span>{result.term} мес.</span></div><small>Демо-рекомендация не гарантирует одобрение или доступность условий.</small></div>}
            </form>
          </div>
        </section>

        <section className="faq section-pad" aria-labelledby="faq-title">
          <div className="container faq-grid">
            <div data-reveal><span className="eyebrow">06 / Без мелкого шрифта</span><h2 id="faq-title">Важное —<br /><span className="marker">сразу понятно.</span></h2></div>
            <div className="faq-list" data-reveal>
              <details><summary>Это настоящий банковский сервис?<span aria-hidden="true">+</span></summary><p>Пока нет. Это концепт и демонстрация для хакатона на синтетических данных. Реальные заявки и выдача кредита не выполняются.</p></details>
              <details><summary>Подбор означает одобрение?<span aria-hidden="true">+</span></summary><p>Нет. Демо подбирает тип продукта по цели финансирования. Кредитное решение требует отдельной проверки и не рассчитывается на этой странице.</p></details>
              <details><summary>Что будет в полноценном кабинете?<span aria-hidden="true">+</span></summary><p>По плану MVP — анкета, сохранение заявки, проверки на тестовых данных, скоринг, статусы и интерфейс сотрудника банка. Сейчас доступен только демонстрационный подбор.</p></details>
            </div>
          </div>
        </section>

        <section className="closing" aria-labelledby="closing-title">
          <div className="container closing-inner" data-reveal><span className="eyebrow eyebrow-light">Следующий шаг — за вами</span><h2 id="closing-title">Бизнесу — движение.<br /><em>Вам — ясность.</em></h2><p>Посмотрите, как начинается понятный кредитный путь.</p><Button view="primary" onClick={() => scrollToSection('demo')} className="cta-large">Открыть демо <span aria-hidden="true">↗</span></Button><div className="closing-orb" aria-hidden="true">а.</div></div>
        </section>
      </main>

      <footer className="site-footer"><div className="container footer-inner"><div className="footer-brand"><span className="brand-mark">а<span>.</span></span><span>Умный кредитный кабинет<br /><small>Концепт для хакатона, 2026</small></span></div><a href="#top">Наверх ↑</a><p>Демо на синтетических данных. Не является банковским предложением.</p></div></footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
