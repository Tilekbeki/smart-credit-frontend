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
const TEST_PHONE = '+7 900 000-00-00';
const TEST_CODE = '1221';
const companyProfiles = [
  { id: 'shop', name: 'ИП «Лавка у дома»', detail: 'Торговля', contact: 'Алия Соколова', role: 'Владелец бизнеса', icon: '↺', goal: 'stock' },
  { id: 'workshop', name: 'ООО «Мастерская Север»', detail: 'Производство', contact: 'Михаил Орлов', role: 'Генеральный директор', icon: '↗', goal: 'equipment' },
  { id: 'cafe', name: 'ООО «Точка вкуса»', detail: 'Общественное питание', contact: 'Мария Лаврова', role: 'Финансовый директор', icon: '✳', goal: 'seasonal' },
  { id: 'logistics', name: 'ООО «Маршрут плюс»', detail: 'Логистика', contact: 'Денис Волков', role: 'Уполномоченный сотрудник', icon: '⇢', goal: 'upgrade' },
];
const financingGoals = [
  { id: 'stock', title: 'Закупить товары или сырьё', detail: 'Пополнить склад и запасы', icon: '↺', product: 'turnover' },
  { id: 'expenses', title: 'Покрыть текущие расходы', detail: 'Аренда, зарплата, поставщики', icon: '≡', product: 'turnover' },
  { id: 'seasonal', title: 'Пройти сезонный пик', detail: 'Подготовиться к росту спроса', icon: '◷', product: 'turnover' },
  { id: 'equipment', title: 'Купить оборудование', detail: 'Техника и производственные линии', icon: '↗', product: 'investment' },
  { id: 'upgrade', title: 'Модернизировать бизнес', detail: 'Обновить оснащение и процессы', icon: '✳', product: 'investment' },
  { id: 'other', title: 'Другая задача', detail: 'Опишите её своими словами', icon: '+', product: null },
];
const products = {
  turnover: { name: 'Кредит на оборотные средства', shortName: 'Оборотные средства', reason: 'Для закупок, регулярных расходов и покрытия временного разрыва в обороте.', icon: '↺' },
  investment: { name: 'Инвестиционный кредит', shortName: 'Инвестиционный кредит', reason: 'Для приобретения оборудования и обновления производственных возможностей.', icon: '↗' },
};

function App() {
  const [goal, setGoal] = useState('stock');
  const [otherGoal, setOtherGoal] = useState('');
  const [amount, setAmount] = useState('1500000');
  const [term, setTerm] = useState('12');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [authStage, setAuthStage] = useState('phone');
  const [phone, setPhone] = useState(TEST_PHONE);
  const [smsCode, setSmsCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [flowStage, setFlowStage] = useState('selection');
  const [progressStep, setProgressStep] = useState(0);
  const [productChoice, setProductChoice] = useState(null);
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactError, setContactError] = useState('');
  const [applicationSummary, setApplicationSummary] = useState(null);

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

  useEffect(() => {
    if (flowStage !== 'calculating' && flowStage !== 'preparing') return undefined;
    setProgressStep(0);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reducedMotion ? 700 : 1500;
    const midpoint = window.setTimeout(() => setProgressStep(1), duration / 2);
    const complete = window.setTimeout(() => {
      setProgressStep(2);
      setFlowStage(flowStage === 'calculating' ? 'result' : 'draft');
      focusStage('flow-stage-title');
    }, duration);
    return () => {
      window.clearTimeout(midpoint);
      window.clearTimeout(complete);
    };
  }, [flowStage]);

  const showRecommendation = (event) => {
    event.preventDefault();
    const requestedAmount = Number(amount);
    const months = Number(term);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || !Number.isInteger(months) || months <= 0) {
      setResult(null);
      setError('Укажите положительную сумму и срок в целых месяцах.');
      return;
    }
    if (goal === 'other' && otherGoal.trim().length < 4) {
      setResult(null);
      setError('Коротко опишите задачу — хотя бы четыре символа.');
      return;
    }
    setError('');
    setResult({ goal, goalLabel: goal === 'other' ? otherGoal.trim() : financingGoals.find((item) => item.id === goal)?.title, amount: requestedAmount, term: months });
    setProductChoice(financingGoals.find((item) => item.id === goal)?.product ?? null);
    setFlowStage('calculating');
    focusStage('flow-stage-title');
  };

  const focusStage = (id = 'auth-stage-title') => {
    window.requestAnimationFrame(() => document.getElementById(id)?.focus());
  };

  const goToAuthStage = (stage) => {
    setAuthStage(stage);
    setAuthError('');
    focusStage();
  };

  const requestTestCode = (event) => {
    event.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (!((digits.length === 11 && ['7', '8'].includes(digits[0])) || digits.length === 10)) {
      setAuthError('Укажите российский номер из 10 или 11 цифр. Можно оставить тестовый номер.');
      return;
    }
    setSmsCode('');
    goToAuthStage('code');
  };

  const verifyTestCode = (event) => {
    event.preventDefault();
    if (smsCode !== TEST_CODE) {
      setAuthError('Неверный код. Проверьте тестовые данные в инструкции к проекту.');
      return;
    }
    goToAuthStage('profile');
  };

  const chooseProfile = (profile) => {
    setSelectedProfile(profile);
    setGoal(profile.goal);
    setContactName(profile.contact);
    setContactRole(profile.role);
    setContactError('');
    setApplicationSummary(null);
    setProductChoice(null);
    setFlowStage('selection');
    setResult(null);
    setError('');
    setAuthStage('ready');
    focusStage('finder-stage-title');
  };

  const exitDemo = () => {
    setSelectedProfile(null);
    setPhone(TEST_PHONE);
    setSmsCode('');
    setContactName('');
    setContactRole('');
    setContactError('');
    setApplicationSummary(null);
    setProductChoice(null);
    setFlowStage('selection');
    setResult(null);
    setError('');
    goToAuthStage('phone');
  };

  const selectedGoal = financingGoals.find((item) => item.id === goal);
  const chosenProduct = productChoice ? products[productChoice] : null;
  const currentFlowIndex = ['selection', 'calculating'].includes(flowStage) ? 0 : flowStage === 'result' ? 1 : ['contact', 'preparing'].includes(flowStage) ? 2 : 3;

  const prepareApplication = (event) => {
    event.preventDefault();
    const normalizedName = contactName.trim().replace(/\s+/g, ' ');
    if (normalizedName.split(' ').length < 2 || /\d/.test(normalizedName)) {
      setContactError('Укажите фамилию и имя контактного лица без цифр.');
      return;
    }
    if (!contactRole.trim()) {
      setContactError('Укажите роль контактного лица в компании.');
      return;
    }
    setContactError('');
    setApplicationSummary({ contactName: normalizedName, contactRole: contactRole.trim(), company: selectedProfile.name, goal: result.goalLabel, product: chosenProduct.name, amount: result.amount, term: result.term });
    setFlowStage('preparing');
    focusStage('flow-stage-title');
  };

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
          Начать подбор <span aria-hidden="true">↗</span>
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
                  Начать подбор <span aria-hidden="true">↗</span>
                </Button>
                <a className="text-link light-link" href="#how">Как это работает <span aria-hidden="true">↓</span></a>
              </div>
              <p className="hero-note">Прототип для хакатона. Реальные заявки не отправляются.</p>
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
                <li><span>01</span><div><strong>Опишите задачу</strong><small>Выберите цель, сумму и срок.</small></div></li>
                <li><span>02</span><div><strong>Сравните варианты</strong><small>Посмотрите предварительный подбор двух продуктов.</small></div></li>
                <li><span>03</span><div><strong>Проверьте данные</strong><small>Уточните контактное лицо и соберите черновик заявки.</small></div></li>
              </ol>
              <Button view="secondary" colors="inverted" onClick={() => scrollToSection('demo')}>Начать подбор <span aria-hidden="true">↗</span></Button>
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
                <button className="product-link" type="button" onClick={() => { setGoal('stock'); setResult(null); setError(''); setFlowStage('selection'); scrollToSection('demo'); }}>Подобрать вариант <span aria-hidden="true">↗</span></button>
              </article>
              <article className="product-card equipment-card" data-reveal>
                <div className="product-top"><span>02 / На развитие</span><span className="product-glyph">↗</span></div>
                <div><h3>Инвестиционный<br />кредит</h3><p>Покупка оборудования для следующего этапа роста.</p></div>
                <button className="product-link" type="button" onClick={() => { setGoal('equipment'); setResult(null); setError(''); setFlowStage('selection'); scrollToSection('demo'); }}>Подобрать вариант <span aria-hidden="true">↗</span></button>
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
              <div className="status-panel-head"><span>ПРИМЕР ЭКРАНА ЗАЯВКИ</span><span className="status-dot">● Статус</span></div>
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
              <p>Выберите компанию, опишите задачу, проверьте предварительный вариант и соберите черновик заявки.</p>
              <div className="demo-annotation"><span>✳</span><p>Данные и расчёт учебные: сообщения и заявки в банк не отправляются.</p></div>
            </div>
            {authStage !== 'ready' ? (
              <div className="auth-card">
                <div className="auth-head"><span>ВХОД В КАБИНЕТ</span><span>{authStage === 'phone' ? '01 / 03' : authStage === 'code' ? '02 / 03' : '03 / 03'}</span></div>
                <h3 className="auth-stage-title" id="auth-stage-title" tabIndex={-1}>
                  {authStage === 'phone' ? 'Выберите способ входа' : authStage === 'code' ? 'Введите код' : 'Выберите компанию'}
                </h3>
                <p className="auth-description">
                  {authStage === 'phone'
                    ? 'Начните с готового профиля компании или воспользуйтесь входом по номеру.'
                    : authStage === 'code'
                      ? 'Для тестового входа возьмите код из инструкции к проекту. СМС не отправляется.'
                      : 'Выберите готовый профиль. Данные контактного лица можно будет проверить и изменить.'}
                </p>
                {authStage === 'phone' && (
                  <form className="auth-form" onSubmit={requestTestCode}>
                    <button className="auth-skip" type="button" onClick={() => goToAuthStage('profile')}>Выбрать компанию <span aria-hidden="true">↗</span></button>
                    <div className="auth-divider"><span>или войдите по номеру</span></div>
                    <Input className="auth-input" label="Номер телефона" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(_, data) => { setPhone(data?.value ?? ''); setAuthError(''); }} />
                    <p className="auth-phone-hint">Номер для тестового входа уже подставлен.</p>
                    {authError && <p className="auth-error" role="alert">{authError}</p>}
                    <Button view="primary" type="submit" block className="auth-submit">Продолжить по номеру <span aria-hidden="true">↗</span></Button>
                    <p className="auth-privacy">Это учебный вход: СМС не отправляется, номер не покидает вкладку.</p>
                  </form>
                )}
                {authStage === 'code' && (
                  <form className="auth-form" onSubmit={verifyTestCode}>
                    <Input className="auth-input" label="Код доступа" type="password" inputMode="numeric" autoComplete="off" value={smsCode} onChange={(_, data) => { setSmsCode((data?.value ?? '').replace(/\D/g, '').slice(0, 4)); setAuthError(''); }} />
                    {authError && <p className="auth-error" role="alert">{authError}</p>}
                    <Button view="primary" type="submit" block className="auth-submit">Продолжить <span aria-hidden="true">↗</span></Button>
                    <button className="auth-back" type="button" onClick={() => goToAuthStage('phone')}>Изменить номер</button>
                  </form>
                )}
                {authStage === 'profile' && (
                  <div className="auth-profiles" role="group" aria-label="Готовые профили компаний">
                    {companyProfiles.map((profile) => (
                      <button className="auth-profile" key={profile.id} type="button" onClick={() => chooseProfile(profile)}>
                        <span className="auth-profile-icon" aria-hidden="true">{profile.icon}</span>
                        <span className="auth-profile-copy"><strong>{profile.name}</strong><small>{profile.detail} · {profile.contact}, {profile.role}</small></span>
                        <span className="auth-profile-arrow" aria-hidden="true">↗</span>
                      </button>
                    ))}
                    <p className="auth-privacy">Все компании и контактные лица вымышленные.</p>
                  </div>
                )}
              </div>
            ) : ['calculating', 'preparing'].includes(flowStage) ? (
              <div className="loading-panel" role="status" aria-live="polite">
                <div className="loading-orb" aria-hidden="true" />
                <h3 id="flow-stage-title" tabIndex={-1}>{flowStage === 'calculating' ? 'Подбираем вариант' : 'Готовим черновик'}</h3>
                <p>{flowStage === 'calculating' ? 'Сопоставляем вашу задачу с двумя типами финансирования.' : 'Проверяем полноту введённых данных и собираем сводку заявки.'}</p>
                <ol className="loading-steps">
                  {(flowStage === 'calculating'
                    ? ['Сверяем цель финансирования', 'Проверяем сумму и срок']
                    : ['Проверяем контактные данные', 'Формируем сводку заявки']).map((step, index) => (
                    <li className={`loading-step ${index < progressStep ? 'done' : index === progressStep ? 'active' : ''}`} key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="finder">
                <div className="finder-head"><span>КРЕДИТНЫЙ ПУТЬ</span><div className="finder-account"><span className="finder-profile">{selectedProfile.name}</span><button className="finder-exit" type="button" onClick={exitDemo}>Выйти</button></div></div>
                <div className="flow-progress" aria-label={`Этап ${currentFlowIndex + 1} из 4`}>
                  {['Задача', 'Вариант', 'Контакт', 'Черновик'].map((label, index) => <span key={label} className={index < currentFlowIndex ? 'done' : index === currentFlowIndex ? 'active' : ''}>{label}</span>)}
                </div>
                {flowStage === 'selection' && (
                  <form onSubmit={showRecommendation}>
                    <fieldset className="goal-fieldset"><legend id="finder-stage-title" tabIndex={-1}>Для чего нужны средства?</legend>
                      <div className="goal-grid">
                        {financingGoals.map((item) => (
                          <label className={`goal-option ${goal === item.id ? 'selected' : ''}`} key={item.id}>
                            <input type="radio" name="goal" value={item.id} checked={goal === item.id} onChange={() => { setGoal(item.id); setResult(null); setError(''); }} />
                            <span className="goal-icon" aria-hidden="true">{item.icon}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><span className="goal-check" aria-hidden="true">✓</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    {goal === 'other' && <label className="goal-custom">Опишите задачу<textarea value={otherGoal} onChange={(event) => { setOtherGoal(event.target.value); setError(''); }} placeholder="Например, открыть ещё одну точку" maxLength={180} /></label>}
                    <div className="finder-inputs">
                      <Input label="Сумма, ₽" type="number" min="1" value={amount} onChange={(_, data) => { setAmount(data?.value ?? ''); setResult(null); setError(''); }} />
                      <Input label="Срок, мес." type="number" min="1" value={term} onChange={(_, data) => { setTerm(data?.value ?? ''); setResult(null); setError(''); }} />
                    </div>
                    <p className="field-note">Сумма и срок попадут в черновик заявки. Предварительный подбор зависит от цели; ставки и одобрение здесь не рассчитываются.</p>
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <Button view="primary" type="submit" block className="finder-submit">Подобрать вариант <span aria-hidden="true">↗</span></Button>
                  </form>
                )}
                {flowStage === 'result' && (
                  <div>
                    <h3 className="flow-title" id="flow-stage-title" tabIndex={-1}>Предварительный подбор</h3>
                    <p className="flow-copy">Задача: {result.goalLabel}. Вы можете выбрать другой продукт перед созданием заявки.</p>
                    {chosenProduct ? (
                      <div className="finder-result" role="status"><div className="result-icon">{chosenProduct.icon}</div><span>{selectedGoal?.product === productChoice ? 'Подходит к вашей цели' : 'Выбранный вами вариант'}</span><h3>{chosenProduct.name}</h3><p>{chosenProduct.reason}</p><div className="result-meta"><span>{formatRubles(result.amount)} ₽</span><span>{result.term} мес.</span></div></div>
                    ) : <div className="alternative-product"><strong>Нужен ваш выбор</strong><p>По свободному описанию мы не делаем автоматический вывод. Сравните два типа продукта ниже.</p></div>}
                    <fieldset className="goal-fieldset product-fieldset"><legend>Какой продукт взять в заявку?</legend>
                      <div className="goal-grid">
                        {Object.entries(products).map(([id, item]) => (
                          <label className={`goal-option ${productChoice === id ? 'selected' : ''}`} key={id}>
                            <input type="radio" name="product" value={id} checked={productChoice === id} onChange={() => { setProductChoice(id); setError(''); }} />
                            <span className="goal-icon" aria-hidden="true">{item.icon}</span><span><strong>{item.shortName}</strong><small>{item.reason}</small></span><span className="goal-check" aria-hidden="true">✓</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <p className="field-note">Это подбор типа продукта, а не кредитное решение или предложение условий.</p>
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <div className="result-actions"><Button view="primary" type="button" onClick={() => { if (!productChoice) { setError('Выберите один из двух продуктов.'); return; } setFlowStage('contact'); focusStage('flow-stage-title'); }}>Продолжить заявку <span aria-hidden="true">↗</span></Button><button className="auth-back" type="button" onClick={() => { setFlowStage('selection'); setError(''); focusStage('finder-stage-title'); }}>Изменить параметры</button></div>
                  </div>
                )}
                {flowStage === 'contact' && (
                  <div>
                    <h3 className="flow-title" id="flow-stage-title" tabIndex={-1}>Проверьте контактное лицо</h3>
                    <p className="flow-copy">ФИО и роль подставлены из профиля компании. Исправьте их, если заявку оформляет другой сотрудник.</p>
                    <form className="contact-form" onSubmit={prepareApplication}>
                      <Input className="auth-input" label="ФИО контактного лица" autoComplete="off" value={contactName} onChange={(_, data) => { setContactName(data?.value ?? ''); setContactError(''); }} />
                      <Input className="auth-input" label="Роль в компании" autoComplete="off" value={contactRole} onChange={(_, data) => { setContactRole(data?.value ?? ''); setContactError(''); }} />
                      <div className="contact-summary"><p><strong>Компания:</strong> {selectedProfile.name}</p><p><strong>Задача:</strong> {result.goalLabel}</p><p><strong>Продукт:</strong> {chosenProduct.name}</p><p><strong>Запрос:</strong> {formatRubles(result.amount)} ₽ на {result.term} мес.</p></div>
                      {contactError && <p className="form-error" role="alert">{contactError}</p>}
                      <Button view="primary" type="submit" block className="finder-submit">Собрать черновик <span aria-hidden="true">↗</span></Button>
                      <button className="auth-back" type="button" onClick={() => { setFlowStage('result'); focusStage('flow-stage-title'); }}>Вернуться к вариантам</button>
                    </form>
                  </div>
                )}
                {flowStage === 'draft' && applicationSummary && (
                  <div>
                    <h3 className="flow-title" id="flow-stage-title" tabIndex={-1}>Черновик заявки готов</h3>
                    <p className="flow-copy">Проверьте собранные данные. Они остаются в этой вкладке и не передаются в банк.</p>
                    <div className="draft-panel" role="status"><p><strong>Компания:</strong> {applicationSummary.company}</p><p><strong>Контакт:</strong> {applicationSummary.contactName}, {applicationSummary.contactRole}</p><p><strong>Задача:</strong> {applicationSummary.goal}</p><p><strong>Продукт:</strong> {applicationSummary.product}</p><p><strong>Сумма и срок:</strong> {formatRubles(applicationSummary.amount)} ₽ · {applicationSummary.term} мес.</p></div>
                    <div className="result-actions"><Button view="primary" type="button" onClick={() => { setFlowStage('contact'); focusStage('flow-stage-title'); }}>Изменить данные</Button><button className="auth-back" type="button" onClick={() => { setFlowStage('selection'); setResult(null); focusStage('finder-stage-title'); }}>Новый подбор</button></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="faq section-pad" aria-labelledby="faq-title">
          <div className="container faq-grid">
            <div data-reveal><span className="eyebrow">06 / Без мелкого шрифта</span><h2 id="faq-title">Важное —<br /><span className="marker">сразу понятно.</span></h2></div>
            <div className="faq-list" data-reveal>
              <details><summary>Это настоящий банковский сервис?<span aria-hidden="true">+</span></summary><p>Пока нет. Это прототип для хакатона на вымышленных данных. Реальные заявки и выдача кредита не выполняются.</p></details>
              <details><summary>Подбор означает одобрение?<span aria-hidden="true">+</span></summary><p>Нет. Подбор сопоставляет цель с одним из двух типов финансирования. Скоринг и кредитное решение на этой странице не выполняются.</p></details>
              <details><summary>Зачем нужны ФИО и роль?<span aria-hidden="true">+</span></summary><p>Это данные контактного лица для черновика заявки. Они подставлены из готового профиля и доступны для изменения.</p></details>
              <details><summary>Почему кредитных продуктов два?<span aria-hidden="true">+</span></summary><p>В первом релизе показаны оборотные средства и инвестиционный кредит. Задач финансирования больше; при выборе «Другая задача» продукт можно указать вручную.</p></details>
            </div>
          </div>
        </section>

        <section className="closing" aria-labelledby="closing-title">
          <div className="container closing-inner" data-reveal><span className="eyebrow eyebrow-light">Следующий шаг — за вами</span><h2 id="closing-title">Бизнесу — движение.<br /><em>Вам — ясность.</em></h2><p>Посмотрите, как начинается понятный кредитный путь.</p><Button view="primary" onClick={() => scrollToSection('demo')} className="cta-large">Начать подбор <span aria-hidden="true">↗</span></Button><div className="closing-orb" aria-hidden="true">а.</div></div>
        </section>
      </main>

      <footer className="site-footer"><div className="container footer-inner"><div className="footer-brand"><span className="brand-mark">а<span>.</span></span><span>Умный кредитный кабинет<br /><small>Концепт для хакатона, 2026</small></span></div><a href="#top">Наверх ↑</a><p>Прототип на вымышленных данных. Не является банковским предложением.</p></div></footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
