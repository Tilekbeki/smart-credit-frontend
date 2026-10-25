import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import catArt from '../assets/alpha-cat-hero.png';
import './guest-chat.css';
import { chatProgress, guestRecommendation, recommendationInput } from './chat-recommendations';

const GOALS = [
  ['stock', 'Товары и сырьё'],
  ['expenses', 'Текущие расходы'],
  ['seasonal', 'Сезонный спрос'],
  ['equipment', 'Оборудование'],
  ['upgrade', 'Модернизация'],
  ['other', 'Другая задача'],
];

const QUESTIONS = {
  purpose: 'На что нужны деньги вашему бизнесу?',
  purposeDescription: 'Расскажите о задаче парой слов.',
  requestedAmountRub: 'Какую сумму вы хотите привлечь?',
  termMonths: 'На какой срок нужен кредит?',
  monthlyRevenueRub: 'Какая средняя выручка бизнеса за месяц?',
  monthlyExpensesRub: 'Сколько бизнес тратит в среднем за месяц?',
  complete: 'Спасибо! Вот что я могу предложить под вашу задачу.',
};

const NEXT_STEP = {
  purposeDescription: 'requestedAmountRub',
  requestedAmountRub: 'termMonths',
  termMonths: 'monthlyRevenueRub',
  monthlyRevenueRub: 'monthlyExpensesRub',
  monthlyExpensesRub: 'complete',
};

const formatRub = (value) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

function parseNumber(raw, field) {
  let value = String(raw).trim().toLocaleLowerCase('ru-RU').replace(/\s|₽/g, '');
  if (field === 'termMonths') value = value.replace(/мес(?:яц(?:ев|а)?)?\.?$/, '');
  const match = value.match(/^(\d+(?:[.,]\d+)?)(млн\.?|тыс(?:яч)?\.?)?$/);
  if (!match) return null;
  const multiplier = match[2]?.startsWith('млн') ? 1000000 : match[2] ? 1000 : 1;
  const number = Number(match[1].replace(',', '.')) * multiplier;
  const minimum = field === 'termMonths' || field === 'requestedAmountRub' ? 1 : 0;
  const maximum = field === 'termMonths' ? 120 : 1000000000000;
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
}

export default function GuestChat({ form, onFieldChange, onContinue, onSignIn, initialProgress, onProgressChange,
  authenticated = false, company, onRecommend, onSubmitApplication, onBackToCabinet, busy = false }) {
  const [progress, setProgress] = useState(() => chatProgress(initialProgress, authenticated));
  const [result, setResult] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [resultError, setResultError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const sendingRef = useRef(false);
  const [typing, setTyping] = useState(true);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const threadRef = useRef(null);
  const answerRef = useRef(null);
  const continueRef = useRef(null);
  const { currentStep, history } = progress;
  const complete = currentStep === 'complete';
  const includesDescription = currentStep === 'purposeDescription' || history.some((item) => item.field === 'purposeDescription');
  const totalQuestions = (authenticated ? 5 : 3) + (includesDescription ? 1 : 0);
  const recommendationKey = JSON.stringify([form.purpose, form.requestedAmountRub, form.termMonths, form.monthlyRevenueRub, form.monthlyExpensesRub]);
  const selectedProduct = result?.products?.find((item) => item.product.id === selectedProductId && item.eligible);
  const answeredCount = history.length;

  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
    };
  }, []);

  useEffect(() => {
    setDraft(currentStep === 'purpose' || complete ? '' : String(form[currentStep] ?? ''));
    setError('');
  }, [currentStep]);

  useEffect(() => {
    if (!typing) return undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = reducedMotion ? 0 : Math.min(1250, 540 + QUESTIONS[currentStep].length * 8);
    const timer = window.setTimeout(() => setTyping(false), delay);
    return () => window.clearTimeout(timer);
  }, [currentStep, typing]);

  useEffect(() => {
    setResult(null); setResultError(''); setConfirming(false); setSelectedProductId(null);
    if (!complete || typing || !authenticated) return undefined;
    let active = true;
    setCalculating(true);
    Promise.resolve().then(() => onRecommend(recommendationInput(form)))
      .then((response) => {
        if (!active) return;
        setResult(response);
        const preferred = response.products?.find((item) => item.product.id === response.recommendedProductId && item.eligible)
          || response.products?.find((item) => item.eligible);
        setSelectedProductId(preferred?.product.id || null);
      })
      .catch((failure) => { if (active) setResultError(failure.message || 'Не удалось получить подбор. Попробуйте ещё раз.'); })
      .finally(() => { if (active) setCalculating(false); });
    return () => { active = false; };
  }, [complete, typing, authenticated, recommendationKey, retry, onRecommend]);

  useLayoutEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [history, currentStep, typing, result, resultError, calculating, confirming]);

  useEffect(() => {
    if (typing) return undefined;
    const frame = window.requestAnimationFrame(() => {
      (complete ? continueRef.current : answerRef.current?.querySelector('button, input'))?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [typing, currentStep]);

  const saveProgress = (next) => {
    setProgress(next);
    onProgressChange?.(next);
  };

  const advance = (field, answer, nextStep) => {
    saveProgress({ currentStep: nextStep, history: [...history, { field, question: QUESTIONS[field], answer }] });
    setDraft('');
    setError('');
    setTyping(true);
  };

  const answer = (raw, selectedGoal) => {
    if (typing || complete) return;
    const value = String(raw).trim();
    if (!value) { setError('Напишите ответ или выберите один из вариантов.'); return; }
    if (currentStep === 'purpose') {
      if (value.length > 300) { setError('Не больше 300 символов.'); return; }
      const known = selectedGoal
        ? GOALS.find(([id]) => id === selectedGoal)
        : GOALS.find(([, label]) => label.toLocaleLowerCase('ru-RU') === value.toLocaleLowerCase('ru-RU'));
      if (known) {
        onFieldChange('purpose', known[0]);
        advance('purpose', known[1], known[0] === 'other' ? 'purposeDescription' : 'requestedAmountRub');
      } else {
        onFieldChange('purpose', 'other');
        onFieldChange('purposeDescription', value);
        advance('purpose', value, 'requestedAmountRub');
      }
      return;
    }
    if (currentStep === 'purposeDescription') {
      if (value.length > 300) { setError('Не больше 300 символов.'); return; }
      onFieldChange('purposeDescription', value);
      advance('purposeDescription', value, NEXT_STEP.purposeDescription);
      return;
    }
    const number = parseNumber(value, currentStep);
    if (number === null) {
      setError(currentStep === 'termMonths'
        ? 'Укажите срок от 1 до 120 месяцев.'
        : 'Укажите целую сумму в рублях. Например, 500 000 или 1,5 млн.');
      return;
    }
    onFieldChange(currentStep, String(number));
    advance(currentStep, currentStep === 'termMonths' ? `${number} мес.` : formatRub(number), currentStep === 'termMonths' && !authenticated ? 'complete' : NEXT_STEP[currentStep]);
  };

  const revise = (index) => {
    const previous = history[index];
    if (!previous || busy) return;
    saveProgress({ currentStep: previous.field, history: history.slice(0, index) });
    setTyping(true);
  };

  const applyAdjustment = (adjustment) => {
    onFieldChange('requestedAmountRub', String(adjustment.amountRub));
    onFieldChange('termMonths', String(adjustment.termMonths));
    saveProgress({ currentStep: 'complete', history: history.map((item) => item.field === 'requestedAmountRub'
      ? { ...item, answer: formatRub(adjustment.amountRub) }
      : item.field === 'termMonths' ? { ...item, answer: `${adjustment.termMonths} мес.` } : item) });
  };
  const send = async () => {
    if (!selectedProduct || sendingRef.current || busy) return;
    sendingRef.current = true;
    setResultError('');
    try { await onSubmitApplication(selectedProduct.product.id, form); }
    catch (failure) { setResultError(`${failure.message || 'Не удалось подтвердить сохранение заявки.'} Проверьте список заявок перед повторной отправкой.`); }
    finally { sendingRef.current = false; }
  };
  const orientation = guestRecommendation(form.purpose);

  const quickReplies = currentStep === 'purpose'
    ? GOALS.map(([id, label]) => ({ value: id, label, goal: id }))
    : currentStep === 'requestedAmountRub'
      ? [500000, 1000000, 3000000].map((value) => ({ value, label: formatRub(value) }))
      : currentStep === 'termMonths'
        ? [6, 12, 24].map((value) => ({ value, label: `${value} мес.` }))
        : [];
  const inputLabel = currentStep === 'purpose' ? 'Или напишите свою цель'
    : currentStep === 'purposeDescription' ? 'Опишите задачу'
      : currentStep === 'termMonths' ? 'Свой срок в месяцах'
        : currentStep === 'monthlyRevenueRub' ? 'Выручка за месяц, ₽'
          : currentStep === 'monthlyExpensesRub' ? 'Расходы за месяц, ₽' : 'Своя сумма, ₽';

  return <section className="guest-chat" aria-label="Подбор кредита в диалоге">
    <header className="guest-chat-header">
      <a className="guest-chat-brand" href="/" aria-label="Умный кредитный кабинет — на главную">
        <span className="guest-chat-brand-mark">а.</span><span>умный кредитный<br />кабинет</span>
      </a>
      <button className="guest-chat-signin" type="button" disabled={busy} onClick={authenticated ? onBackToCabinet : onSignIn}>{authenticated ? 'Вернуться в кабинет' : <>Уже есть кабинет? <strong>Войти</strong></>}</button>
    </header>

    <div className="guest-chat-stage">
      <div className="guest-chat-heading"><div><span>КОТ ПОМОЖЕТ НАЧАТЬ</span><h1>Расскажите о задаче</h1></div><span>{complete ? 'Рекомендация' : `Вопрос ${answeredCount + 1} из ${totalQuestions}`}</span></div>
      <div className="guest-chat-progress" role="progressbar" aria-label="Подбор продукта" aria-valuemin="0" aria-valuemax={totalQuestions} aria-valuenow={answeredCount}><span style={{ width: `${answeredCount / totalQuestions * 100}%` }} /></div>

      <ol className="guest-chat-thread" ref={threadRef} role="log" aria-label="Диалог по заявке" aria-live="polite" aria-relevant="additions">
        <li className="guest-chat-message is-cat"><span className="guest-chat-avatar" style={{ backgroundImage: `url(${catArt})` }} aria-hidden="true" /><span className="guest-chat-bubble">{authenticated ? `Продолжим подбор для ${company?.name || 'вашей компании'}. Уточню показатели бизнеса и покажу расчёт. Заявку отправим только после вашего подтверждения.` : 'Привет! Помогу выбрать тип кредита для вашей задачи. Несколько коротких вопросов — и рекомендация готова. Вход и регистрация не нужны.'}</span></li>
        {history.map((item, index) => <li className="guest-chat-exchange" key={`${item.field}-${index}`}>
          <div className="guest-chat-message is-cat"><span className="guest-chat-avatar" style={{ backgroundImage: `url(${catArt})` }} aria-hidden="true" /><span className="guest-chat-bubble">{item.question}</span></div>
          <div className="guest-chat-message is-user"><div><span className="guest-chat-bubble">{item.answer}</span><button type="button" onClick={() => revise(index)} disabled={busy} aria-label={`Изменить ответ: ${item.question}`}>Изменить</button></div></div>
        </li>)}
        <li className="guest-chat-message is-cat is-current" key={`${currentStep}-${typing ? 'typing' : 'question'}`}>
          <span className="guest-chat-avatar" style={{ backgroundImage: `url(${catArt})` }} aria-hidden="true" />
          {typing ? <span className="guest-chat-bubble is-typing" role="status"><span>Кот печатает</span><span className="guest-chat-typing-dots" aria-hidden="true"><i /><i /><i /></span></span>
            : <span className="guest-chat-bubble">{complete && authenticated ? 'Ответы собраны. Проверю подходящие продукты и посчитаю ориентировочный платёж.' : QUESTIONS[currentStep]}</span>}
        </li>
        {complete && !typing && <li className="guest-chat-result" aria-label="Рекомендации по кредиту" aria-busy={calculating}>
          {!authenticated ? <article className="guest-chat-product">
            <span className="guest-chat-result-label">ПО ЗАДАЧЕ ВАШЕГО БИЗНЕСА</span>
            <h2>{orientation.title}</h2><p>{orientation.description}</p>
            <dl><div><dt>Вы планируете привлечь</dt><dd>{formatRub(Number(form.requestedAmountRub))}</dd></div><div><dt>На срок</dt><dd>{form.termMonths} мес.</dd></div></dl>
            <p>{orientation.next}</p>
            <small>Это рекомендация типа продукта. Сумма и срок — ваши пожелания. Возможность кредитования, ставку и платёж банк определит после проверки данных.</small>
          </article> : <>
            {calculating && <p className="guest-chat-result-status" role="status">Сравниваю продукты и финансовую нагрузку…</p>}
            {result && <>
              <p className="guest-chat-result-status">{result.products?.some((item) => item.eligible) ? 'Под эти данные есть подходящий вариант. Можно подготовить заявку на согласование.' : 'По указанным данным подходящего варианта пока нет. Можно изменить ответы или проверить предложенные условия.'}</p>
              {result.products?.filter((item) => item.matches?.purpose).map((item) => <article className={`guest-chat-product ${selectedProductId === item.product.id ? 'is-selected' : ''}`} key={item.product.id}>
                <span className="guest-chat-result-label">{item.eligible ? 'ПОДХОДИТ ПО ПРЕДВАРИТЕЛЬНОМУ РАСЧЁТУ' : 'НУЖНО УТОЧНИТЬ УСЛОВИЯ'}</span>
                <h2>{item.product.name}</h2>
                <dl><div><dt>Сумма заявки</dt><dd>{formatRub(Number(form.requestedAmountRub))}</dd></div><div><dt>Срок</dt><dd>{form.termMonths} мес.</dd></div><div><dt>Ставка в год</dt><dd>{item.product.annualRatePercent}%</dd></div><div><dt>Платёж в месяц</dt><dd>{formatRub(item.monthlyPaymentRub)}</dd></div></dl>
                {[...(item.reasons || []), ...(item.limitations || [])].length > 0 && <ul>{[...new Set([...(item.reasons || []), ...(item.limitations || [])])].map((reason) => <li key={reason}>{reason}</li>)}</ul>}
                {!item.eligible && item.adjustments?.length > 0 && <div className="guest-chat-adjustments"><p>Можно проверить другие условия:</p>{item.adjustments.map((adjustment, index) => <button type="button" key={index} disabled={busy} onClick={() => applyAdjustment(adjustment)}>{formatRub(adjustment.amountRub)} · {adjustment.termMonths} мес.<small>{adjustment.explanation}</small></button>)}</div>}
                {item.eligible && result.products.filter((product) => product.eligible).length > 1 && <button type="button" className="guest-chat-secondary" aria-pressed={selectedProductId === item.product.id} disabled={busy} onClick={() => { setSelectedProductId(item.product.id); setConfirming(false); }}>Выбрать этот продукт</button>}
              </article>)}
              {!result.products?.some((item) => item.matches?.purpose) && <p>Выберите цель «Товары и сырьё», «Текущие расходы», «Сезонный спрос», «Оборудование» или «Модернизация», чтобы проверить доступные продукты.</p>}
              <p className="guest-chat-disclaimer">{result.disclaimer || 'Предварительный расчёт не является решением по кредиту.'}</p>
            </>}
          </>}
          {resultError && <div role="alert" className="guest-chat-result-error"><p>{resultError}</p>{!confirming && <button type="button" className="guest-chat-secondary" onClick={() => setRetry((value) => value + 1)}>Повторить расчёт</button>}</div>}
          {confirming && selectedProduct && <section className="guest-chat-confirm" aria-label="Подтверждение заявки">
            <h2>Отправить на согласование?</h2><p>{company?.name} · {selectedProduct.product.name}</p>
            <dl><div><dt>Сумма</dt><dd>{formatRub(Number(form.requestedAmountRub))}</dd></div><div><dt>Срок</dt><dd>{form.termMonths} мес.</dd></div><div><dt>Выручка / месяц</dt><dd>{formatRub(Number(form.monthlyRevenueRub))}</dd></div><div><dt>Расходы / месяц</dt><dd>{formatRub(Number(form.monthlyExpensesRub))}</dd></div></dl>
            <p>Сохраним заявку в кабинете и передадим на проверку. Если понадобятся документы, откроем черновик для загрузки. Решение и дальнейшие действия появятся в кабинете.</p>
          </section>}
        </li>}
      </ol>

      <div className="guest-chat-reply" ref={answerRef}>
        {!complete && !typing && <>
          {quickReplies.length > 0 && <div className="guest-chat-choices" role="group" aria-label="Варианты ответа">{quickReplies.map((reply) => <button type="button" key={String(reply.value)} onClick={() => answer(reply.value, reply.goal)}>{reply.label}</button>)}</div>}
          <form className="guest-chat-composer-form" onSubmit={(event) => { event.preventDefault(); answer(draft); }}>
            <label htmlFor="guest-chat-input">{inputLabel}</label>
            <div className="guest-chat-composer"><input id="guest-chat-input" type="text" inputMode={['purpose', 'purposeDescription'].includes(currentStep) ? 'text' : 'decimal'} maxLength={currentStep === 'purpose' || currentStep === 'purposeDescription' ? 300 : 24} value={draft} onChange={(event) => { setDraft(event.target.value); setError(''); }} placeholder={currentStep === 'purpose' ? 'Например, открыть цветочный магазин' : currentStep === 'purposeDescription' ? 'Например, новая точка' : currentStep === 'termMonths' ? 'Например, 24' : 'Например, 1 000 000'} aria-invalid={Boolean(error)} aria-describedby={error ? 'guest-chat-error' : undefined} /><button type="submit" aria-label="Отправить ответ" disabled={!draft.trim()}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5m0 0-6 6m6-6 6 6" /></svg></button></div>
          </form>
          {error && <p className="guest-chat-error" id="guest-chat-error" role="alert">{error}</p>}
        </>}
        {complete && !typing && <div className="guest-chat-complete"><p>{authenticated ? confirming ? 'Проверьте данные выше перед отправкой.' : 'Подбор не создаёт заявку. Решение об отправке за вами.' : 'Рекомендация готова. Если у вас уже есть доступ к кабинету, войдите для расчёта по данным компании.'}</p>{authenticated ? selectedProduct && <div className="guest-chat-final-actions"><button type="button" ref={continueRef} disabled={busy} onClick={confirming ? send : () => setConfirming(true)}>{busy ? 'Сохраняем заявку…' : confirming ? 'Отправить на согласование' : 'Подготовить заявку'}</button>{confirming && <button type="button" className="guest-chat-secondary" disabled={busy} onClick={() => setConfirming(false)}>Назад к рекомендации</button>}</div> : <button type="button" ref={continueRef} onClick={onContinue}>Войти в свой кабинет</button>}</div>}
        <div className="guest-chat-footer"><span>{complete ? 'Можно вернуться к любому ответу' : 'Предварительный разговор не является решением по кредиту'}</span>{history.length > 0 && <button type="button" disabled={busy} onClick={() => revise(history.length - 1)}>← Изменить прошлый ответ</button>}</div>
      </div>
    </div>
  </section>;
}
