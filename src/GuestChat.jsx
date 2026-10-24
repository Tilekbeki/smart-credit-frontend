import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import catArt from '../assets/alpha-cat-hero.png';
import './guest-chat.css';

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
  complete: 'Спасибо! Ответы собраны. Войдите, чтобы продолжить заявку в кабинете.',
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

function startingProgress(value) {
  return value?.currentStep && Array.isArray(value.history)
    ? { currentStep: value.currentStep, history: value.history }
    : { currentStep: 'purpose', history: [] };
}

export default function GuestChat({ form, onFieldChange, onContinue, onSignIn, initialProgress, onProgressChange }) {
  const [progress, setProgress] = useState(() => startingProgress(initialProgress));
  const [typing, setTyping] = useState(true);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const threadRef = useRef(null);
  const answerRef = useRef(null);
  const continueRef = useRef(null);
  const { currentStep, history } = progress;
  const complete = currentStep === 'complete';
  const includesDescription = currentStep === 'purposeDescription' || history.some((item) => item.field === 'purposeDescription');
  const totalQuestions = includesDescription ? 6 : 5;
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

  useLayoutEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [history, currentStep, typing]);

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
    advance(currentStep, currentStep === 'termMonths' ? `${number} мес.` : formatRub(number), NEXT_STEP[currentStep]);
  };

  const revise = (index) => {
    const previous = history[index];
    if (!previous) return;
    saveProgress({ currentStep: previous.field, history: history.slice(0, index) });
    setTyping(true);
  };

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

  return <section className="guest-chat" aria-label="Начало заявки в диалоге">
    <header className="guest-chat-header">
      <a className="guest-chat-brand" href="/" aria-label="Умный кредитный кабинет — на главную">
        <span className="guest-chat-brand-mark">а.</span><span>умный кредитный<br />кабинет</span>
      </a>
      <button className="guest-chat-signin" type="button" onClick={onSignIn}>Уже есть кабинет? <strong>Войти</strong></button>
    </header>

    <div className="guest-chat-stage">
      <div className="guest-chat-heading"><div><span>КОТ ПОМОЖЕТ НАЧАТЬ</span><h1>Расскажите о задаче</h1></div><span>{complete ? 'Ответы собраны' : `Вопрос ${answeredCount + 1} из ${totalQuestions}`}</span></div>
      <div className="guest-chat-progress" role="progressbar" aria-label="Подготовка заявки" aria-valuemin="0" aria-valuemax={totalQuestions} aria-valuenow={answeredCount}><span style={{ width: `${answeredCount / totalQuestions * 100}%` }} /></div>

      <ol className="guest-chat-thread" ref={threadRef} role="log" aria-label="Диалог по заявке" aria-live="polite" aria-relevant="additions">
        <li className="guest-chat-message is-cat"><span className="guest-chat-avatar" style={{ backgroundImage: `url(${catArt})` }} aria-hidden="true" /><span className="guest-chat-bubble">Привет! Я задам несколько коротких вопросов. Отвечайте кнопками или своими словами — ответы можно изменить до входа.</span></li>
        {history.map((item, index) => <li className="guest-chat-exchange" key={`${item.field}-${index}`}>
          <div className="guest-chat-message is-cat"><span className="guest-chat-avatar" style={{ backgroundImage: `url(${catArt})` }} aria-hidden="true" /><span className="guest-chat-bubble">{item.question}</span></div>
          <div className="guest-chat-message is-user"><div><span className="guest-chat-bubble">{item.answer}</span><button type="button" onClick={() => revise(index)} aria-label={`Изменить ответ: ${item.question}`}>Изменить</button></div></div>
        </li>)}
        <li className="guest-chat-message is-cat is-current" key={`${currentStep}-${typing ? 'typing' : 'question'}`}>
          <span className="guest-chat-avatar" style={{ backgroundImage: `url(${catArt})` }} aria-hidden="true" />
          {typing ? <span className="guest-chat-bubble is-typing" role="status"><span>Кот печатает</span><span className="guest-chat-typing-dots" aria-hidden="true"><i /><i /><i /></span></span>
            : <span className="guest-chat-bubble">{QUESTIONS[currentStep]}</span>}
        </li>
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
        {complete && !typing && <div className="guest-chat-complete"><p>Данные останутся на следующем шаге. После входа проверьте их в форме, выберите продукт и продолжите заявку.</p><button type="button" ref={continueRef} onClick={onContinue}>Войти и продолжить <span aria-hidden="true">↗</span></button></div>}
        <div className="guest-chat-footer"><span>{complete ? 'Можно вернуться к любому ответу' : 'Предварительный разговор не является решением по кредиту'}</span>{history.length > 0 && <button type="button" onClick={() => revise(history.length - 1)}>← Изменить прошлый ответ</button>}</div>
      </div>
    </div>
  </section>;
}
