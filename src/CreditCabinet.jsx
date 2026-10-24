import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';
import * as api from './api';
import { getJourneyStage, getNextAction, getSubmitChecklist } from './journey';
import './cabinet.css';

const GOALS = [
  ['stock', 'Товары и сырьё'],
  ['expenses', 'Текущие расходы'],
  ['seasonal', 'Сезонный спрос'],
  ['equipment', 'Оборудование'],
  ['upgrade', 'Модернизация'],
  ['other', 'Другая задача'],
];
const DOCUMENT_NAMES = {
  BANK_STATEMENT: 'Выписка по счёту',
  EQUIPMENT_INVOICE: 'Счёт на оборудование',
};
const STATUS_NAMES = {
  draft: 'Черновик',
  submitted: 'Отправлена',
  processing: 'На проверке',
  manual_review: 'Ожидает рассмотрения',
  approved: 'Одобрена',
  counter_offer: 'Предложены другие условия',
  rejected: 'Отказано',
  signed: 'Условия подтверждены',
  closed: 'Закрыта',
};
const formatRub = (value) => value == null ? '—' : `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const formatDate = (value) => value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const shortId = (id) => id?.slice(0, 8).toUpperCase() || '—';
const isAwaitingDecision = (status) => ['submitted', 'processing', 'manual_review'].includes(status);
const withNewerDecisionStatus = (application, decision) => decision?.applicationId === application.applicationId
  && decision.version > application.version
  ? { ...application, status: decision.status, version: decision.version }
  : application;
const accountPath = (value) => ['alfa_account', 'external_account'].includes(value) ? value : 'unknown';
const initialForm = (company) => ({
  productId: null,
  purpose: 'stock',
  purposeDescription: '',
  requestedAmountRub: '1000000',
  termMonths: '24',
  monthlyRevenueRub: accountPath(company?.bankRelationship) === 'alfa_account'
    ? String(company?.financials?.monthlyRevenueRub ?? '') : '',
  monthlyExpensesRub: accountPath(company?.bankRelationship) === 'alfa_account'
    ? String(company?.financials?.monthlyExpensesRub ?? '') : '',
});
const formFromApplication = (application) => ({
  productId: application.productId,
  purpose: application.purpose || 'stock',
  purposeDescription: application.purposeDescription || '',
  requestedAmountRub: application.requestedAmountRub == null ? '' : String(application.requestedAmountRub),
  termMonths: application.termMonths == null ? '' : String(application.termMonths),
  monthlyRevenueRub: application.monthlyRevenueRub == null ? '' : String(application.monthlyRevenueRub),
  monthlyExpensesRub: application.monthlyExpensesRub == null ? '' : String(application.monthlyExpensesRub),
});
const payloadFromForm = (form) => ({
  productId: form.productId || null,
  purpose: form.purpose || null,
  purposeDescription: form.purposeDescription.trim() || null,
  requestedAmountRub: form.requestedAmountRub === '' ? null : Number(form.requestedAmountRub),
  termMonths: form.termMonths === '' ? null : Number(form.termMonths),
  monthlyRevenueRub: form.monthlyRevenueRub === '' ? null : Number(form.monthlyRevenueRub),
  monthlyExpensesRub: form.monthlyExpensesRub === '' ? null : Number(form.monthlyExpensesRub),
});
const numericFields = ['requestedAmountRub', 'termMonths', 'monthlyRevenueRub', 'monthlyExpensesRub'];
const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) return digits.slice(1);
  return null;
};
// This code is only for the local, synthetic company flow. It is not a secret or a production login method.
const QUICK_ACCESS_CODE = '1221';
const selectedLandingPurpose = () => {
  const value = new URLSearchParams(window.location.search).get('purpose');
  return GOALS.some(([id]) => id === value && id !== 'other') ? value : null;
};
const initialFormAfterSignIn = (company, products) => {
  const form = initialForm(company);
  const purpose = selectedLandingPurpose();
  if (!purpose) return form;
  form.purpose = purpose;
  const preferredProductId = purpose === 'equipment' ? 'investment' : purpose === 'stock' ? 'turnover' : null;
  if (products.some((product) => product.id === preferredProductId && product.purposes?.includes(purpose))) {
    form.productId = preferredProductId;
  }
  return form;
};

function validateForm(form, { forRecommendation = false } = {}) {
  for (const field of numericFields) {
    const raw = form[field].trim();
    const value = Number(raw);
    if (forRecommendation && !raw) return 'Укажите сумму, срок, выручку и расходы для подбора.';
    if (raw && (!Number.isSafeInteger(value) || value < (field === 'requestedAmountRub' || field === 'termMonths' ? 1 : 0))) {
      return 'Денежные значения и срок должны быть целыми положительными числами; выручка и расходы могут быть нулевыми.';
    }
    if (raw && value > (field === 'termMonths' ? 120 : 1000000000000)) return 'Проверьте сумму или срок: значение превышает допустимый предел.';
  }
  if (form.purposeDescription.length > 300) return 'Описание задачи должно быть не длиннее 300 символов.';
  return '';
}

function ErrorNotice({ error, details }) {
  if (!error) return null;
  return <div className="cabinet-error" role="alert"><strong>{error}</strong>{details?.length > 0 && <ul>{details.map((item, index) => <li key={`${item.field}-${index}`}>{item.message}</li>)}</ul>}</div>;
}

function LoadingCard({ title, detail }) {
  return <div className="cabinet-loading" role="status" aria-live="polite"><span className="cabinet-spinner" aria-hidden="true" /><strong>{title}</strong><p>{detail}</p></div>;
}

function DecisionPanel({ decision, bankRelationship, choice, onChoose, onConfirm, busy }) {
  if (!decision) return null;
  const { status, offer, processing, reasons = [] } = decision;
  const riskName = { LOW: 'Низкий', MEDIUM: 'Средний', HIGH: 'Высокий' }[decision.riskLevel];
  const hasFinalDecision = ['approved', 'counter_offer', 'rejected', 'signed', 'closed'].includes(status);
  const manualReview = status === 'manual_review';
  if (!hasFinalDecision && !processing && !manualReview) return null;

  return <section className={`cabinet-decision-panel is-${status}`} aria-label="Решение по заявке" aria-live="polite">
    <div className="cabinet-decision-heading"><span>{hasFinalDecision ? 'РЕШЕНИЕ ПО ЗАЯВКЕ' : 'ХОД ПРОВЕРКИ'}</span>{decision.assessedAt && <time dateTime={decision.assessedAt}>{formatDate(decision.assessedAt)}</time>}</div>
    {processing && <div className="cabinet-processing-detail"><strong>{processing.state === 'retrying' ? 'Проверка повторяется автоматически' : processing.state === 'failed' ? 'Проверка временно остановилась' : 'Проверка продолжается'}</strong><p>{processing.message || 'Заявка обрабатывается. Обновления появятся в кабинете.'}</p>{processing.retryAt && <small>Следующая попытка: {formatDate(processing.retryAt)}</small>}</div>}
    {manualReview && <div className="cabinet-processing-detail"><strong>Заявку рассматривает сотрудник банка</strong><p>Решение ещё не принято. Как только оно появится, здесь отобразятся причины и дальнейшие действия.</p></div>}
    {decision.score != null && <div className="cabinet-risk-summary"><span>Учебная оценка</span><strong>{decision.score} / 100</strong>{riskName && <span>Уровень риска: {riskName.toLowerCase()}</span>}<small>Это один из факторов проверки, не кредитное решение.</small></div>}
    {manualReview && reasons.length > 0 && <div className="cabinet-decision-reasons"><strong>Что требует дополнительной проверки</strong><ul>{reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul></div>}
    {hasFinalDecision && <>
      <h5>{status === 'rejected' ? 'По заявке принято решение об отказе' : status === 'signed' ? 'Условия подтверждены' : status === 'closed' ? 'Предложение отклонено' : status === 'counter_offer' ? 'Банк предложил другие условия' : 'Заявка одобрена'}</h5>
      {reasons.length > 0 && <div className="cabinet-decision-reasons"><strong>Почему принято такое решение</strong><ul>{reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul></div>}
      {offer && <div className="cabinet-offer"><div className="cabinet-offer-intro"><span>ПРЕДЛОЖЕНИЕ БАНКА</span><strong>{offer.status === 'accepted' ? 'Принято' : offer.status === 'withdrawn' ? 'Отклонено' : 'Доступно для ответа'}</strong></div><div className="cabinet-offer-terms"><div><span>Сумма кредита</span><strong>{formatRub(offer.amountRub)}</strong></div><div><span>Срок</span><strong>{offer.termMonths} мес.</strong></div><div><span>Ставка в год</span><strong>{offer.annualRatePercent}%</strong></div><div><span>Платёж в месяц</span><strong>{formatRub(offer.monthlyPaymentRub)}</strong></div></div>
        {bankRelationship === 'external_account' && offer.status === 'active' && <p className="cabinet-offer-account-note">Для фактической выдачи кредита понадобится счёт бизнеса в Альфа-Банке. Сейчас можно рассмотреть предложение.</p>}
        {offer.status === 'active' && ['approved', 'counter_offer'].includes(status) && <><div className="cabinet-offer-actions"><Button className="cabinet-primary-button" view="primary" type="button" onClick={() => onChoose('accept')} disabled={Boolean(busy)}>Принять условия ↗</Button><Button view="secondary" type="button" onClick={() => onChoose('decline')} disabled={Boolean(busy)}>Отклонить предложение</Button></div>
          {choice && <div className="cabinet-offer-confirm" role="group" aria-label="Подтверждение действия"><strong>{choice === 'accept' ? 'Подтвердить принятие условий?' : 'Отклонить это предложение?'}</strong><p>{choice === 'accept' ? 'В кабинете сохранится подтверждение учебных условий. Выдача средств этим действием не выполняется.' : 'Заявка будет закрыта, а предложение больше не будет доступно.'}</p><div><Button className={choice === 'accept' ? 'cabinet-primary-button' : ''} view={choice === 'accept' ? 'primary' : 'secondary'} type="button" onClick={() => onConfirm(choice)} disabled={Boolean(busy)}>{busy === `offer-${choice}` ? 'Сохраняем ответ…' : choice === 'accept' ? 'Да, принять условия' : 'Да, отклонить'}</Button><button className="cabinet-text-button" type="button" onClick={() => onChoose(null)} disabled={Boolean(busy)}>Отмена</button></div></div>}
        </>}
      </div>}
      {status === 'signed' && <p className="cabinet-offer-result">Ваш ответ сохранён. Подтверждение условий не означает выдачу кредита или перевод средств.</p>}
      {status === 'closed' && <p className="cabinet-offer-result">Вы отклонили предложение. Заявка закрыта.</p>}
    </>}
  </section>;
}

function JourneyProgress({ stage }) {
  return <section className="cabinet-journey" aria-label="Этапы заявки">
    <div className="cabinet-journey-heading"><span>ТЕКУЩИЙ ЭТАП</span><strong>{stage.title}</strong></div>
    <ol>{stage.steps.map((step, index) => <li key={step.id} className={`is-${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}><span aria-hidden="true">{step.state === 'done' ? '✓' : index + 1}</span><small>{step.label}</small></li>)}</ol>
    <p>{stage.description}</p>
  </section>;
}

function SubmitChecklist({ checklist }) {
  const done = checklist.items.filter((item) => item.state === 'done').length;
  const conditional = checklist.items.filter((item) => item.state === 'conditional').length;
  return <section className="cabinet-checklist" aria-label="Проверка перед отправкой">
    <div className="cabinet-section-head"><div><span>ПЕРЕД ОТПРАВКОЙ</span><h4>Что уже готово</h4></div><small>{done} готово{conditional > 0 ? ` · ${conditional} по запросу` : ''}</small></div>
    <ul>{checklist.items.map((item) => <li key={item.id} className={`is-${item.state}`}><span className="cabinet-check-icon" aria-hidden="true">{item.state === 'done' ? '✓' : item.state === 'conditional' ? '?' : '•'}</span><div><strong>{item.label}</strong>{item.message && <small>{item.message}</small>}</div></li>)}</ul>
    <p>Это предварительная проверка. Окончательные требования к продукту и документам проверит сервис при отправке.</p>
  </section>;
}

export default function CreditCabinet() {
  const [profiles, setProfiles] = useState([]);
  const [authStage, setAuthStage] = useState('phone');
  const [phone, setPhone] = useState('');
  const [chosenProfile, setChosenProfile] = useState(null);
  const [otpRequest, setOtpRequest] = useState(null);
  const [code, setCode] = useState('');
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [products, setProducts] = useState([]);
  const [applications, setApplications] = useState([]);
  const [applicationsTotal, setApplicationsTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [creditDecision, setCreditDecision] = useState(null);
  const [offerChoice, setOfferChoice] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [form, setForm] = useState(() => ({ ...initialForm(null), purpose: selectedLandingPurpose() || 'stock' }));
  const [newFormBaseline, setNewFormBaseline] = useState(initialForm(null));
  const [recommendations, setRecommendations] = useState(null);
  const [screen, setScreen] = useState('new');
  const [documentType, setDocumentType] = useState('BANK_STATEMENT');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [details, setDetails] = useState([]);
  const [notice, setNotice] = useState('');
  const [conflictedForm, setConflictedForm] = useState(null);
  const documentsRef = useRef(null);
  const fileInputRef = useRef(null);
  const formRef = useRef(null);
  const submitRef = useRef(null);
  const panelContentRef = useRef(null);
  const offerActionRef = useRef(null);

  const reportError = (failure, fallback = 'Не удалось выполнить действие.') => {
    setError(failure?.message || fallback);
    setDetails(Array.isArray(failure?.details) ? failure.details : []);
  };
  const clearMessages = () => { setError(''); setDetails([]); setNotice(''); };
  const fieldError = (field) => details.find((item) => item.field === field)?.message;

  useEffect(() => {
    let active = true;
    setBusy('profiles');
    api.getProfiles().then((response) => { if (active) setProfiles(response.items || []); })
      .catch((failure) => { if (active) reportError(failure, 'Не удалось загрузить профили.'); })
      .finally(() => { if (active) setBusy(''); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      setUser(null);
      setCompany(null);
      setSelected(null);
      setCreditDecision(null);
      setOfferChoice(null);
      offerActionRef.current = null;
      setApplications([]);
      setApplicationsTotal(0);
      setDocuments([]);
      setTimeline([]);
      setProducts([]);
      setForm(initialForm(null));
      setNewFormBaseline(initialForm(null));
      setRecommendations(null);
      setFile(null);
      setChosenProfile(null);
      setOtpRequest(null);
      setCode('');
      setPhone('');
      setAuthStage('phone');
      setScreen('new');
      setConflictedForm(null);
      setBusy('');
      setError('Сессия истекла. Войдите по номеру телефона, чтобы продолжить.');
      setDetails([]);
    });
    return () => api.setUnauthorizedHandler(null);
  }, []);

  const loadApplications = useCallback(async (offset = 0) => {
    const page = await api.listApplications({ limit: 20, offset });
    setApplications((previous) => offset === 0 ? page.items : [...previous, ...page.items]);
    setApplicationsTotal(page.total);
    return page;
  }, []);

  const refreshSelected = useCallback(async (applicationId) => {
    const [application, events, uploaded, decision] = await Promise.all([
      api.getApplication(applicationId),
      api.getApplicationTimeline(applicationId),
      api.listDocuments(applicationId),
      api.getApplicationDecision(applicationId),
    ]);
    const currentApplication = withNewerDecisionStatus(application, decision);
    setSelected(currentApplication);
    setCreditDecision(decision);
    setTimeline([...(events.items || [])].sort((a, b) => a.sequence - b.sequence));
    setDocuments(uploaded.items || []);
    return currentApplication;
  }, []);

  useEffect(() => {
    if (!selected?.applicationId || !isAwaitingDecision(selected.status)) return undefined;
    let active = true;
    let polling = false;
    const timer = window.setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const [application, events, decision] = await Promise.all([
          api.getApplication(selected.applicationId),
          api.getApplicationTimeline(selected.applicationId),
          api.getApplicationDecision(selected.applicationId),
        ]);
        if (!active) return;
        const currentApplication = withNewerDecisionStatus(application, decision);
        setSelected(currentApplication);
        setCreditDecision(decision);
        setTimeline([...(events.items || [])].sort((a, b) => a.sequence - b.sequence));
        if (!isAwaitingDecision(currentApplication.status)) await loadApplications(0);
      } catch (failure) {
        if (active && failure.status !== 401) reportError(failure, 'Не удалось обновить статус.');
      } finally { polling = false; }
    }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selected?.applicationId, selected?.status, loadApplications]);

  const requestCode = async (profile, { resend = false } = {}) => {
    clearMessages();
    setBusy('otp-request');
    try {
      const request = await api.requestOtp(profile.id);
      setChosenProfile(profile);
      setOtpRequest(request);
      setCode('');
      setAuthStage('code');
      if (resend) setNotice('Запрос кода обновлён. Предыдущий код больше не действует.');
    } catch (failure) {
      setOtpRequest(null);
      setCode('');
      setAuthStage('phone');
      reportError(failure, 'Не удалось запросить код. Попробуйте ещё раз.');
    }
    finally { setBusy(''); }
  };

  const submitPhone = (event) => {
    event.preventDefault();
    clearMessages();
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError('Введите номер телефона в формате +7 999 000-00-00.');
      return;
    }
    const profile = profiles.find((item) => item.role === 'CLIENT' && normalizePhone(item.phone) === normalized);
    if (!profile) {
      setError('Этот номер пока не подключён. Используйте номер из раздела «Доступные компании для входа».');
      return;
    }
    requestCode(profile);
  };

  const completeSignIn = async (session) => {
    if (session.role !== 'CLIENT' || !session.companyId) {
      throw new api.ApiError('Этот кабинет доступен предпринимателям.', { code: 'invalid_role' });
    }
    api.setAccessToken(session.accessToken);
    try {
      const [currentUser, currentCompany, productList, page] = await Promise.all([
        api.getMe(), api.getCompany(session.companyId), api.getCreditProducts(),
        api.listApplications({ limit: 20, offset: 0 }),
      ]);
      setUser(currentUser);
      setCompany(currentCompany);
      setProducts(productList.items || []);
      setApplications(page.items || []);
      setApplicationsTotal(page.total || 0);
      const startingForm = initialFormAfterSignIn(currentCompany, productList.items || []);
      setForm(startingForm);
      setNewFormBaseline(startingForm);
      setSelected(null);
      setDocuments([]);
      setTimeline([]);
      setRecommendations(null);
      setScreen(selectedLandingPurpose() || !(page.items || []).length ? 'new' : 'list');
      setConflictedForm(null);
      setAuthStage('ready');
      setOtpRequest(null);
      setCode('');
    } catch (failure) {
      api.setAccessToken(null);
      throw failure;
    }
  };

  const continueAsCompany = async (profile) => {
    clearMessages();
    setChosenProfile(profile);
    setBusy('quick-sign-in');
    try {
      const request = await api.requestOtp(profile.id);
      const session = await api.verifyOtp(request.otpRequestId, QUICK_ACCESS_CODE);
      await completeSignIn(session);
    } catch (failure) {
      api.setAccessToken(null);
      setError(failure?.code === 'network_error'
        ? 'Нет связи с сервисом. Проверьте подключение и попробуйте снова.'
        : failure?.code === 'invalid_otp'
          ? 'Быстрый вход недоступен: проверьте настройки тестового окружения или войдите по номеру.'
          : 'Не удалось открыть кабинет компании. Повторите попытку или войдите по номеру.');
      setDetails([]);
    } finally {
      setBusy('');
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    clearMessages();
    if (!code.trim()) { setError('Введите код доступа.'); return; }
    if (!otpRequest?.otpRequestId) { setAuthStage('phone'); setError('Запрос кода не найден. Получите новый код.'); return; }
    setBusy('otp-verify');
    let verified = false;
    try {
      const session = await api.verifyOtp(otpRequest.otpRequestId, code.trim());
      verified = true;
      await completeSignIn(session);
    } catch (failure) {
      if (verified) {
        api.setAccessToken(null);
        setAuthStage('phone');
        setOtpRequest(null);
        setCode('');
        if (failure.status !== 401) reportError(failure, 'Не удалось открыть кабинет. Войдите ещё раз.');
      } else if (['otp_expired', 'otp_invalidated', 'otp_attempts_exceeded', 'otp_used'].includes(failure?.code)) {
        setOtpRequest(null);
        setCode('');
        setAuthStage('phone');
        setError(failure.code === 'otp_expired' ? 'Срок действия кода истёк. Запросите новый код.'
          : failure.code === 'otp_attempts_exceeded' ? 'Число попыток исчерпано. Запросите новый код.'
            : 'Этот код больше не действует. Запросите новый код.');
      } else if (failure?.code === 'invalid_otp') {
        setCode('');
        setError('Неверный код. Проверьте его и попробуйте снова.');
      } else {
        reportError(failure, 'Не удалось проверить код. Попробуйте ещё раз.');
      }
    } finally { setBusy(''); }
  };

  const signOut = () => {
    if (!confirmLeaveForm()) return;
    api.setAccessToken(null);
    setUser(null);
    setCompany(null);
    setSelected(null);
    setCreditDecision(null);
    setOfferChoice(null);
    offerActionRef.current = null;
    setApplications([]);
    setApplicationsTotal(0);
    setDocuments([]);
    setTimeline([]);
    setProducts([]);
    setForm(initialForm(null));
    setNewFormBaseline(initialForm(null));
    setFile(null);
    setRecommendations(null);
    setAuthStage('phone');
    setScreen('new');
    setChosenProfile(null);
    setOtpRequest(null);
    setCode('');
    setPhone('');
    setConflictedForm(null);
    clearMessages();
  };

  const beginNew = () => {
    if (screen === 'new') return;
    if (!confirmLeaveForm()) return;
    clearMessages();
    setSelected(null);
    setCreditDecision(null);
    setOfferChoice(null);
    offerActionRef.current = null;
    setDocuments([]);
    setTimeline([]);
    const startingForm = initialForm(company);
    setForm(startingForm);
    setNewFormBaseline(startingForm);
    setRecommendations(null);
    setFile(null);
    setConflictedForm(null);
    setScreen('new');
  };

  const goToList = () => {
    if (!confirmLeaveForm()) return;
    clearMessages();
    setConflictedForm(null);
    setScreen('list');
  };

  const scrollToNextAction = () => {
    const target = nextAction?.kind === 'upload_document' ? documentsRef
      : nextAction?.kind === 'review_and_submit' ? submitRef : formRef;
    if (nextAction?.field?.startsWith('documents.')) setDocumentType(nextAction.field.split('.')[1]);
    target.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
    window.requestAnimationFrame(() => {
      if (nextAction?.kind === 'upload_document') fileInputRef.current?.focus();
      else if (nextAction?.field === 'purpose') window.document.querySelector('input[name="purpose"]:checked')?.focus();
      else if (nextAction?.field === 'productId') {
        (window.document.querySelector('.cabinet-select-product:not(:disabled)')
          || window.document.getElementById('cabinet-product-select')
          || window.document.querySelector('.cabinet-adjustments button:not(:disabled)')
          || window.document.querySelector('input[name="requestedAmountRub"]'))?.focus();
      }
      else if (nextAction?.field) window.document.querySelector(`input[name="${nextAction.field}"]`)?.focus();
    });
  };

  const chooseApplication = async (applicationId) => {
    if (!confirmLeaveForm()) return;
    clearMessages();
    setOfferChoice(null);
    offerActionRef.current = null;
    setBusy('opening');
    try {
      const application = await refreshSelected(applicationId);
      setForm(formFromApplication(application));
      setRecommendations(null);
      setFile(null);
      setConflictedForm(null);
      setDocumentType(application.productId === 'investment' ? 'EQUIPMENT_INVOICE' : 'BANK_STATEMENT');
      setScreen('application');
    } catch (failure) { reportError(failure, 'Не удалось открыть заявку.'); }
    finally { setBusy(''); }
  };

  const updateField = (field, value) => {
    setForm((previous) => {
      const next = { ...previous, [field]: value };
      if (field === 'purpose') {
        const currentProduct = products.find((product) => product.id === next.productId);
        if (!currentProduct?.purposes.includes(value)) next.productId = null;
        if (value !== 'other') next.purposeDescription = '';
      }
      return next;
    });
    if (field !== 'productId' && field !== 'purposeDescription') setRecommendations(null);
    setError('');
    setNotice('');
    setDetails((previous) => previous.filter((item) => item.field !== field && !(field === 'purpose' && item.field === 'productId')));
  };

  const calculate = async (event) => {
    event?.preventDefault();
    clearMessages();
    const validation = validateForm(form, { forRecommendation: true });
    if (validation) { setError(validation); return; }
    setBusy('recommendations');
    try {
      const response = await api.getRecommendations({
        purpose: form.purpose,
        requestedAmountRub: Number(form.requestedAmountRub),
        termMonths: Number(form.termMonths),
        monthlyRevenueRub: Number(form.monthlyRevenueRub),
        monthlyExpensesRub: Number(form.monthlyExpensesRub),
      });
      setRecommendations(response);
      setForm((previous) => ({
        ...previous,
        productId: response.products?.some((item) => item.product.id === previous.productId && item.eligible)
          ? previous.productId : null,
      }));
    } catch (failure) { reportError(failure); }
    finally { setBusy(''); }
  };

  const applyAdjustment = async (adjustment) => {
    const next = { ...form, requestedAmountRub: String(adjustment.amountRub), termMonths: String(adjustment.termMonths) };
    setForm(next);
    setBusy('recommendations');
    clearMessages();
    try {
      const response = await api.getRecommendations({
        purpose: next.purpose,
        requestedAmountRub: Number(next.requestedAmountRub),
        termMonths: Number(next.termMonths),
        monthlyRevenueRub: Number(next.monthlyRevenueRub),
        monthlyExpensesRub: Number(next.monthlyExpensesRub),
      });
      setRecommendations(response);
      setForm((previous) => ({
        ...previous,
        productId: response.products?.some((item) => item.product.id === previous.productId && item.eligible)
          ? previous.productId : null,
      }));
    } catch (failure) { reportError(failure); }
    finally { setBusy(''); }
  };

  const saveDraft = async () => {
    clearMessages();
    const validation = validateForm(form);
    if (validation) { setError(validation); return; }
    setBusy('saving');
    try {
      const payload = payloadFromForm(form);
      const wasNew = !selected;
      const saved = selected
        ? await api.updateApplication(selected.applicationId, { version: selected.version, ...payload })
        : await api.createApplication(payload);
      setSelected(saved);
      setApplications((previous) => [saved, ...previous.filter((item) => item.applicationId !== saved.applicationId)]);
      if (wasNew) { setApplicationsTotal((previous) => previous + 1); setDocuments([]); setTimeline([]); }
      setForm(formFromApplication(saved));
      setRecommendations(null);
      setDocumentType(saved.productId === 'investment' ? 'EQUIPMENT_INVOICE' : 'BANK_STATEMENT');
      setScreen('application');
      setConflictedForm(null);
      setNotice(wasNew ? 'Черновик сохранён в кабинете. Продолжите его, когда будете готовы к отправке.' : 'Изменения сохранены.');
      try {
        const application = await refreshSelected(saved.applicationId);
        setForm(formFromApplication(application));
        await loadApplications(0);
      } catch (refreshError) {
        setNotice('Черновик сохранён. Свежий список пока недоступен; откройте его позже.');
      }
    } catch (failure) {
      if (failure?.error === 'version_conflict' || failure?.code === 'version_conflict') {
        const localForm = { ...form };
        try {
          const latest = await refreshSelected(selected.applicationId);
          setConflictedForm(localForm);
          setForm(formFromApplication(latest));
          await loadApplications(0);
          setError('Черновик изменился в другом окне. Мы сохранили ваш ввод на этой странице: сравните его с новой версией и восстановите, если нужно.');
        } catch (reloadError) { setError('Черновик изменился в другом окне. Ваш ввод остался на странице, но свежую версию загрузить не удалось. Попробуйте открыть заявку позже.'); }
      } else reportError(failure);
    } finally { setBusy(''); }
  };

  const upload = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!file) { setError('Выберите файл.'); return; }
    if (file.size < 1 || file.size > 5242880 || !/\.(pdf|png|jpe?g)$/i.test(file.name)) {
      setError('Подойдёт непустой PDF, PNG или JPEG размером не более 5 МБ.');
      return;
    }
    setBusy('uploading');
    try {
      const uploaded = await api.uploadDocument(selected.applicationId, documentType, file);
      setDocuments((previous) => [...previous, uploaded]);
      setDetails((previous) => previous.filter((item) => item.field !== `documents.${documentType}`));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setNotice('Документ загружен.');
      try {
        const response = await api.listDocuments(selected.applicationId);
        setDocuments(response.items || []);
      } catch (refreshError) { setNotice('Документ загружен. Обновить список файлов пока не удалось.'); }
    } catch (failure) { reportError(failure); }
    finally { setBusy(''); }
  };

  const download = async (document) => {
    clearMessages();
    setBusy(`download-${document.documentId}`);
    try {
      const blob = await api.downloadDocument(selected.applicationId, document.documentId);
      const href = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = href;
      link.download = document.fileName;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 60000);
    } catch (failure) { reportError(failure, 'Не удалось скачать документ.'); }
    finally { setBusy(''); }
  };

  const submit = async () => {
    clearMessages();
    setBusy('submitting');
    try {
      const submitted = await api.submitApplication(selected.applicationId);
      setSelected((previous) => ({ ...previous, status: submitted.status, submittedAt: submitted.submittedAt }));
      setApplications((previous) => previous.map((item) => item.applicationId === selected.applicationId
        ? { ...item, status: submitted.status, submittedAt: submitted.submittedAt } : item));
      setScreen('application');
      setNotice('Заявка отправлена. Статус обновляется автоматически.');
      try {
        await refreshSelected(selected.applicationId);
        await loadApplications(0);
      } catch (refreshError) {
        setNotice('Заявка отправлена. Обновить историю пока не удалось; проверьте её чуть позже.');
      }
    } catch (failure) {
      reportError(failure);
      if (failure?.details?.some((item) => item.field?.startsWith('documents.'))) {
        window.requestAnimationFrame(() => {
          documentsRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
          fileInputRef.current?.focus();
        });
      }
    }
    finally { setBusy(''); }
  };

  const answerOffer = async (action) => {
    const offer = creditDecision?.offer;
    if (!selected?.applicationId || !offer || offer.status !== 'active'
      || !['approved', 'counter_offer'].includes(creditDecision.status)
      || !['accept', 'decline'].includes(action)) return;
    const signature = `${selected.applicationId}:${action}:${creditDecision.version}:${offer.offerId}`;
    if (offerActionRef.current?.signature !== signature) {
      offerActionRef.current = { signature, key: window.crypto.randomUUID() };
    }
    const idempotencyKey = offerActionRef.current.key;
    const applicationId = selected.applicationId;
    clearMessages();
    setBusy(`offer-${action}`);
    let updatedDecision;
    try {
      const payload = { version: creditDecision.version, offerId: offer.offerId };
      updatedDecision = await (action === 'accept' ? api.acceptOffer : api.declineOffer)(applicationId, payload, idempotencyKey);
    } catch (failure) {
      if (failure?.status === 409) {
        try {
          await refreshSelected(applicationId);
          setOfferChoice(null);
          offerActionRef.current = null;
          setNotice('Предложение изменилось. Проверьте актуальные условия и выберите действие снова.');
        } catch (refreshFailure) { reportError(refreshFailure, 'Не удалось обновить предложение.'); }
      } else {
        reportError(failure, 'Не удалось сохранить ответ. Попробуйте ещё раз.');
      }
      setBusy('');
      return;
    }
    setCreditDecision(updatedDecision);
    setSelected((previous) => ({ ...previous, status: updatedDecision.status, version: updatedDecision.version }));
    setOfferChoice(null);
    offerActionRef.current = null;
    setNotice(action === 'accept'
      ? 'Условия подтверждены и сохранены в кабинете. Выдача средств не выполнялась.'
      : 'Предложение отклонено. Заявка закрыта.');
    try {
      await Promise.all([refreshSelected(applicationId), loadApplications(0)]);
    } catch (failure) {
      setNotice('Ваш ответ сохранён. Обновить данные заявки пока не удалось; проверьте их чуть позже.');
    } finally { setBusy(''); }
  };

  const loadMore = async () => {
    clearMessages();
    setBusy('list');
    try { await loadApplications(applications.length); }
    catch (failure) { reportError(failure); }
    finally { setBusy(''); }
  };

  const currentPayload = payloadFromForm(form);
  const editableFields = numericFields.concat(['productId', 'purpose', 'purposeDescription']);
  const hasUnsavedChanges = screen === 'application' && selected?.status === 'draft' && editableFields
    .some((field) => currentPayload[field] !== selected[field]);
  const baselinePayload = payloadFromForm(newFormBaseline);
  const hasNewChanges = screen === 'new' && editableFields.some((field) => currentPayload[field] !== baselinePayload[field]);
  const confirmLeaveForm = () => !(hasUnsavedChanges || hasNewChanges || conflictedForm)
    || window.confirm('Введённые изменения не сохранены. Покинуть эту форму?');
  const bankRelationship = accountPath(company?.bankRelationship);
  const selectedProduct = products.find((product) => product.id === selected?.productId) || null;
  const formProduct = products.find((product) => product.id === form.productId) || null;
  const checklist = getSubmitChecklist(selected?.status === 'draft' ? selected : null, documents, details, selectedProduct, bankRelationship);
  const journeyStage = selected ? getJourneyStage(selected, timeline, creditDecision) : null;
  const nextAction = selected ? getNextAction(selected, timeline, documents, details, selectedProduct, bankRelationship, creditDecision) : null;
  const canSubmit = selected?.status === 'draft' && !hasUnsavedChanges && checklist.readyToSubmit;
  const draftToContinue = applications.filter((item) => item.status === 'draft')
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt))[0];
  const showApplicationDetails = screen === 'new' || screen === 'application' || Boolean(recommendations);

  useEffect(() => {
    if (authStage !== 'ready' || !(hasUnsavedChanges || hasNewChanges || conflictedForm)) return undefined;
    const warnBeforeLeave = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [authStage, hasUnsavedChanges, hasNewChanges, conflictedForm]);

  useEffect(() => {
    if (authStage === 'ready' && panelContentRef.current) panelContentRef.current.scrollTop = 0;
  }, [authStage, screen, selected?.applicationId]);

  const panelTitle = screen === 'list' ? 'Мои заявки' : screen === 'new' ? 'Новая заявка'
    : selected?.status === 'draft' ? 'Черновик заявки' : 'Статус заявки';
  const panelDescription = screen === 'list'
    ? 'Продолжайте черновики и следите за уже отправленными заявками.'
    : screen === 'new'
      ? 'Укажите задачу бизнеса — покажем подходящие варианты и следующие шаги.'
      : selected?.status === 'draft'
        ? 'Проверьте данные, приложите документы и отправьте заявку.'
        : 'Здесь видны этап проверки и история вашей заявки.';

  if (authStage !== 'ready') return <div className="credit-cabinet credit-cabinet-auth">
    <div className="cabinet-eyebrow"><span>КРЕДИТНЫЙ КАБИНЕТ</span><span>ВХОД</span></div>
    {authStage === 'phone' ? <>
      <h3>Войдите в кабинет</h3>
      <p className="cabinet-lede">Введите номер, чтобы начать новую заявку или проверить статус уже отправленной.</p>
      <form className="cabinet-phone-form" onSubmit={submitPhone}>
        <Input className="cabinet-auth-input" label="Номер телефона" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 999 000-00-00" value={phone} onChange={(_, data) => { setPhone(data?.value ?? ''); setChosenProfile(null); clearMessages(); }} />
        <Button className="cabinet-primary-button" view="primary" type="submit" disabled={Boolean(busy) || profiles.length === 0}>{busy === 'otp-request' ? 'Запрашиваем код…' : 'Получить код'}</Button>
      </form>
      {profiles.some((profile) => profile.role === 'CLIENT') && <details className="cabinet-demo-access"><summary>Доступные компании для входа</summary><p>Можно войти по номеру компании или открыть её кабинет сразу.</p><div className="cabinet-demo-list">{profiles.filter((profile) => profile.role === 'CLIENT').map((profile) => <div className="cabinet-demo-row" key={profile.id}><div><strong>{profile.companyName}</strong><small>{profile.phone}{accountPath(profile.bankRelationship) === 'external_account' ? ' · Без счёта в Альфе' : ''}</small></div><Button view="secondary" onClick={() => continueAsCompany(profile)} disabled={Boolean(busy)}>{busy === 'quick-sign-in' && chosenProfile?.id === profile.id ? 'Открываем…' : 'Открыть ↗'}</Button></div>)}</div></details>}
      {busy === 'profiles' && <LoadingCard title="Загружаем компании" detail="Подключаемся к сервису." />}
      {profiles.length === 0 && !busy && <Button view="secondary" onClick={() => window.location.reload()}>Повторить загрузку</Button>}
      <ErrorNotice error={error} details={details} />
      <p className="cabinet-fineprint">Вход по номеру пока доступен для указанных компаний. SMS в этом сценарии не отправляется.</p>
      {busy === 'quick-sign-in' && <LoadingCard title="Открываем кабинет" detail="Загружаем данные компании и заявки." />}
    </> : <>
      <h3>Подтвердите вход</h3>
      <p className="cabinet-lede">Код доступа для <strong>{otpRequest?.maskedPhone}</strong>. После входа откроется кабинет {chosenProfile?.companyName}.</p>
      <form onSubmit={verifyCode} className="cabinet-code-form">
        <Input className="cabinet-auth-input" label="Код доступа" type="password" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(_, data) => { setCode(data?.value ?? ''); clearMessages(); }} />
        <ErrorNotice error={error} details={details} />
        <Button className="cabinet-primary-button" view="primary" type="submit" disabled={Boolean(busy)}>{busy === 'otp-verify' ? 'Проверяем код…' : 'Войти в кабинет'}</Button>
      </form>
      {notice && <p className="cabinet-notice" role="status">{notice}</p>}
      <div className="cabinet-code-actions"><button className="cabinet-text-button" type="button" onClick={() => requestCode(chosenProfile, { resend: true })} disabled={Boolean(busy)}>Запросить новый код</button><button className="cabinet-text-button" type="button" onClick={() => { setAuthStage('phone'); setOtpRequest(null); setCode(''); clearMessages(); }} disabled={Boolean(busy)}>Изменить номер</button></div>
      <p className="cabinet-fineprint">Автоматическая отправка SMS пока не подключена. Используйте код тестового окружения; он действует 5 минут.</p>
    </>}
  </div>;

  return <div className="credit-cabinet credit-cabinet-dashboard">
    <aside className="cabinet-sidebar" aria-label="Компания и разделы">
    <div className="cabinet-account"><div><span className="cabinet-account-kicker">ВАША КОМПАНИЯ</span><h3>{company?.name}</h3><p>{user?.name} · ИНН {company?.inn}</p></div></div>
    <div className="cabinet-tabs" role="navigation" aria-label="Разделы кабинета">
      <button type="button" className={screen === 'new' ? 'active' : ''} onClick={beginNew} disabled={Boolean(busy)}>Новая заявка</button>
      <button type="button" className={screen === 'list' || screen === 'application' ? 'active' : ''} onClick={goToList} disabled={Boolean(busy)}>Мои заявки <span>{applicationsTotal}</span></button>
    </div>
    {bankRelationship !== 'unknown' && <details className="cabinet-account-details"><summary>Данные о счёте</summary><div className={`cabinet-account-path is-${bankRelationship}`}><strong>{bankRelationship === 'alfa_account' ? 'Счёт в Альфа-Банке уже есть' : 'Счёта в Альфа-Банке пока нет'}</strong><p>{bankRelationship === 'alfa_account'
      ? 'Данные об оборотах подставлены из профиля компании. Проверьте их перед отправкой заявки.'
      : 'Заявку можно подать без счёта в Альфе. Для оборотного кредита нужна выписка из другого банка. Если кредит одобрят, счёт потребуется перед выдачей.'}</p></div></details>}
    <button className="cabinet-signout" type="button" onClick={signOut} disabled={Boolean(busy)}>Выйти из кабинета</button>
    </aside>
    <section className="cabinet-main-panel" aria-label={panelTitle}>
      <header className="cabinet-panel-header"><div><h2>{panelTitle}</h2><p>{panelDescription}</p></div><span className="cabinet-panel-count">Заявок: {applicationsTotal}</span></header>
      <div className="cabinet-panel-content" ref={panelContentRef} aria-busy={busy === 'opening'}>
    {error && <ErrorNotice error={error} details={details} />}
    {notice && <p className="cabinet-notice" role="status">{notice}</p>}

    {screen === 'list' && <div className="cabinet-list">
      <div className="cabinet-section-head"><div><h4>Ваши заявки</h4><p className="cabinet-list-hint">Откройте черновик, чтобы продолжить, или проверьте статус отправленной заявки.</p></div><Button view="secondary" onClick={beginNew} disabled={Boolean(busy)}>Новая заявка +</Button></div>
      {draftToContinue && <div className="cabinet-resume"><div><span>МОЖНО ПРОДОЛЖИТЬ</span><strong>{draftToContinue.productName || 'Черновик кредитной заявки'}</strong><p>Сохранён {formatDate(draftToContinue.updatedAt || draftToContinue.createdAt)}. Данные останутся в этой заявке до отправки.</p></div><Button className="cabinet-primary-button" view="primary" onClick={() => chooseApplication(draftToContinue.applicationId)} disabled={Boolean(busy)}>Продолжить заявку ↗</Button></div>}
      {applications.length === 0 ? <div className="cabinet-empty"><strong>Заявок пока нет</strong><p>Начните с цели и сохраните первый черновик.</p></div> : applications.map((application) => <button key={application.applicationId} type="button" className="cabinet-application-row" onClick={() => chooseApplication(application.applicationId)} disabled={Boolean(busy)}>
        <span className="cabinet-row-icon" aria-hidden="true">↗</span>
        <span><strong>{application.productName || 'Черновик без продукта'}</strong><small>№ {shortId(application.applicationId)} · {formatDate(application.updatedAt)}</small></span>
        <span><b>{formatRub(application.requestedAmountRub)}</b><small className={`cabinet-status status-${application.status}`}>{STATUS_NAMES[application.status] || application.status}</small></span>
      </button>)}
      {applications.length < applicationsTotal && <Button view="secondary" onClick={loadMore} disabled={Boolean(busy)}>{busy === 'list' ? 'Загружаем…' : 'Показать ещё'}</Button>}
    </div>}

    {(screen === 'new' || (screen === 'application' && selected?.status === 'draft')) && <div className="cabinet-workflow">
      {selected && <div className="cabinet-draft-bar"><span>Черновик № {shortId(selected.applicationId)} · версия {selected.version}</span><button type="button" onClick={goToList} disabled={Boolean(busy)}>К списку ↑</button></div>}
      {selected && journeyStage && <JourneyProgress stage={journeyStage} />}
      {conflictedForm && <div className="cabinet-conflict" role="alert"><strong>Ваш ввод сохранён на этой странице</strong><p>С сервера загружена новая версия черновика. Восстановите свои значения, проверьте их и снова сохраните.</p><div><Button view="secondary" onClick={() => { setForm(conflictedForm); setConflictedForm(null); clearMessages(); setNotice('Ваш ввод восстановлен. Проверьте данные и сохраните изменения.'); }}>Восстановить мой ввод</Button><button type="button" className="cabinet-text-button" onClick={() => { setConflictedForm(null); clearMessages(); }}>Оставить версию сервера</button></div></div>}
      <h4>{selected ? 'Редактирование черновика' : 'Для чего нужны средства?'}</h4>
      <p className="cabinet-description">Опишите задачу и проверьте финансовые данные. Подбор покажет возможные варианты, а черновик можно сохранить и продолжить позже.</p>
      <form onSubmit={calculate} className="cabinet-form" ref={formRef}>
        <fieldset className="cabinet-goals" disabled={Boolean(busy)}><legend>Цель финансирования</legend><div>{GOALS.map(([id, label]) => <label key={id} className={form.purpose === id ? 'selected' : ''}><input type="radio" name="purpose" checked={form.purpose === id} onChange={() => updateField('purpose', id)} /><span>{label}</span></label>)}</div>{fieldError('purpose') && <small className="cabinet-inline-error" role="alert">{fieldError('purpose')}</small>}</fieldset>
        {form.purpose === 'other' && <label className="cabinet-textarea-label">Опишите задачу<textarea value={form.purposeDescription} maxLength={300} disabled={Boolean(busy)} onChange={(event) => updateField('purposeDescription', event.target.value)} placeholder="Например, открыть ещё одну точку" /></label>}
        {form.purpose === 'other' && <p className="cabinet-limitation">Такую задачу можно сохранить в черновике. Для отправки пока выберите одну из пяти поддерживаемых целей.</p>}
        <div className="cabinet-input-grid">
          <div><Input className="cabinet-finance-input" label="Сумма, ₽" name="requestedAmountRub" type="number" min="1" disabled={Boolean(busy)} value={form.requestedAmountRub} onChange={(_, data) => updateField('requestedAmountRub', data?.value ?? '')} />{fieldError('requestedAmountRub') && <small className="cabinet-inline-error" role="alert">{fieldError('requestedAmountRub')}</small>}</div>
          <div><Input className="cabinet-finance-input" label="Срок, мес." name="termMonths" type="number" min="1" max="120" disabled={Boolean(busy)} value={form.termMonths} onChange={(_, data) => updateField('termMonths', data?.value ?? '')} />{fieldError('termMonths') && <small className="cabinet-inline-error" role="alert">{fieldError('termMonths')}</small>}</div>
          <div><Input className="cabinet-finance-input" label="Выручка в месяц, ₽" name="monthlyRevenueRub" type="number" min="0" disabled={Boolean(busy)} value={form.monthlyRevenueRub} onChange={(_, data) => updateField('monthlyRevenueRub', data?.value ?? '')} />{fieldError('monthlyRevenueRub') && <small className="cabinet-inline-error" role="alert">{fieldError('monthlyRevenueRub')}</small>}</div>
          <div><Input className="cabinet-finance-input" label="Расходы в месяц, ₽" name="monthlyExpensesRub" type="number" min="0" disabled={Boolean(busy)} value={form.monthlyExpensesRub} onChange={(_, data) => updateField('monthlyExpensesRub', data?.value ?? '')} />{fieldError('monthlyExpensesRub') && <small className="cabinet-inline-error" role="alert">{fieldError('monthlyExpensesRub')}</small>}</div>
        </div>
        <p className="cabinet-helper">{bankRelationship === 'alfa_account'
          ? 'Выручка и расходы подставлены из профиля компании. Проверьте их и при необходимости измените.'
          : bankRelationship === 'external_account'
            ? 'Банк пока не видит обороты по вашему счёту в другом банке. Укажите месячную выручку и расходы; для оборотного кредита понадобится выписка.'
            : 'Укажите месячную выручку и расходы. Источник оборотов пока не подтверждён.'}</p>
        <Button view="secondary" type="submit" disabled={Boolean(busy)}>{busy === 'recommendations' ? 'Считаем варианты…' : 'Рассчитать варианты ↗'}</Button>
      </form>

      {recommendations && <section className="cabinet-recommendations" aria-label="Предварительный подбор">
        <div className="cabinet-section-head"><div><span>ПРЕДВАРИТЕЛЬНЫЙ ПОДБОР</span><h4>Что подходит сейчас</h4></div><span className="cabinet-budget">Бюджет платежа {formatRub(recommendations.paymentBudgetRub)} / мес.</span></div>
        <div className="cabinet-product-list">{recommendations.products.map((item) => {
          const canSelect = item.eligible === true;
          return <article key={item.product.id} className={`cabinet-product ${form.productId === item.product.id ? 'chosen' : ''}`}>
            <div className="cabinet-product-heading"><div><small>{item.product.id === recommendations.recommendedProductId ? 'РЕКОМЕНДУЕМ' : 'ВАРИАНТ'}</small><h5>{item.product.name}</h5></div><span>{item.product.annualRatePercent}%*</span></div>
            <div className="cabinet-product-metrics"><div><span>Платёж в месяц</span><strong>{formatRub(item.monthlyPaymentRub)}</strong></div><div><span>Предварительно доступно</span><strong>{formatRub(item.preliminaryAvailableAmountRub)}</strong></div></div>
            {item.reasons?.length > 0 && <ul className="cabinet-reasons">{item.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
            {item.limitations?.length > 0 && <ul className="cabinet-limitations">{item.limitations.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
            {item.adjustments?.length > 0 && <div className="cabinet-adjustments"><strong>Можно попробовать другие параметры:</strong>{item.adjustments.map((option, index) => <button type="button" key={index} onClick={() => applyAdjustment(option)} disabled={Boolean(busy)}>{formatRub(option.amountRub)} на {option.termMonths} мес. <span>↗</span></button>)}</div>}
            <Button className="cabinet-select-product" view={form.productId === item.product.id ? 'primary' : 'secondary'} type="button" disabled={!canSelect || Boolean(busy)} onClick={() => updateField('productId', item.product.id)}>{form.productId === item.product.id ? 'Выбрано для заявки' : canSelect ? 'Выбрать для заявки' : 'Сейчас не подходит'}</Button>
          </article>;
        })}</div>
        <p className="cabinet-helper">* Ставка и платёж иллюстративные. Подбор не является решением по кредиту или офертой.</p>
      </section>}

      {showApplicationDetails && !recommendations && products.length > 0 && <div className="cabinet-product-picker"><label htmlFor="cabinet-product-select">Продукт для черновика</label><select id="cabinet-product-select" value={form.productId || ''} disabled={Boolean(busy)} onChange={(event) => updateField('productId', event.target.value || null)}><option value="">Пока не выбран</option>{products.filter((product) => product.purposes.includes(form.purpose)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>{fieldError('productId') && <small className="cabinet-inline-error" role="alert">{fieldError('productId')}</small>}<small>Условия продукта и требования к документам проверяются при отправке.</small></div>}
      {showApplicationDetails && formProduct && <div className="cabinet-product-terms"><strong>Условия выбранного продукта</strong><span>Сумма: {formatRub(formProduct.minAmountRub)}–{formatRub(formProduct.maxAmountRub)}</span><span>Срок: {formProduct.minTermMonths}–{formProduct.maxTermMonths} мес.</span><span>Стаж бизнеса: от {formProduct.minBusinessAgeMonths} мес.</span></div>}
      {showApplicationDetails && <div className="cabinet-document-plan"><strong>Что подготовить для отправки</strong><p>{form.productId === 'investment' ? 'Для кредита на оборудование понадобится счёт на оборудование. Загрузить его можно после сохранения черновика.' : form.productId === 'turnover' ? bankRelationship === 'external_account' ? 'Для проверки оборотов понадобится выписка из другого банка. Загрузить её можно после сохранения черновика.' : 'Выписка по счёту может понадобиться, если банку не хватит данных об оборотах. Если она нужна, сервис уточнит это при отправке.' : 'Выберите продукт: после этого покажем известные требования к документам.'}</p></div>}
      {showApplicationDetails && <div className="cabinet-primary-actions"><Button className="cabinet-primary-button" view="primary" type="button" onClick={saveDraft} disabled={Boolean(busy)}>{busy === 'saving' ? 'Сохраняем…' : selected ? 'Сохранить изменения' : 'Сохранить черновик'}</Button>{selected && hasUnsavedChanges && <span>Сохраните изменения перед отправкой.</span>}</div>}

      {selected && <SubmitChecklist checklist={checklist} />}
      {selected && nextAction && <div className="cabinet-next-action" aria-live="polite"><div><span>СЛЕДУЮЩЕЕ ДЕЙСТВИЕ</span><strong>{nextAction.label}</strong><p>{nextAction.description}</p></div>{['complete_draft', 'upload_document', 'review_and_submit'].includes(nextAction.kind) && <Button view="secondary" onClick={scrollToNextAction}>Перейти ↗</Button>}</div>}

      {selected && <div className="cabinet-documents" ref={documentsRef}><div className="cabinet-section-head"><div><span>ДОКУМЕНТЫ</span><h4>Файлы заявки</h4></div><small>PDF, PNG или JPEG · до 5 МБ</small></div>
        <form className="cabinet-upload" onSubmit={upload}><label>Тип документа<select value={documentType} disabled={Boolean(busy)} onChange={(event) => setDocumentType(event.target.value)}><option value="BANK_STATEMENT">{bankRelationship === 'external_account' ? 'Выписка из другого банка' : 'Выписка по счёту'}</option><option value="EQUIPMENT_INVOICE">Счёт на оборудование</option></select></label><label>Файл<input ref={fileInputRef} type="file" disabled={Boolean(busy)} accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><Button view="secondary" type="submit" disabled={Boolean(busy) || !file}>{busy === 'uploading' ? 'Загружаем…' : 'Загрузить файл'}</Button></form>
        {details.filter((item) => item.field?.startsWith('documents.')).map((item, index) => <p className="cabinet-inline-error" key={`${item.field}-${index}`} role="alert">{item.message}</p>)}
        <DocumentList documents={documents} download={download} busy={busy} bankRelationship={bankRelationship} />
      </div>}

      {selected && <div className="cabinet-submit" ref={submitRef}><div><strong>Готовы отправить?</strong><p>После отправки банк увидит эту заявку и начнёт проверки. Остальные черновики сохранятся отдельно.</p>{!canSubmit && <p>{hasUnsavedChanges ? 'Сначала сохраните изменения.' : 'Исправьте пункты в списке готовности выше.'}</p>}</div><Button className="cabinet-primary-button" view="primary" type="button" onClick={submit} disabled={!canSubmit || Boolean(busy)}>{busy === 'submitting' ? 'Отправляем…' : 'Отправить заявку ↗'}</Button></div>}
    </div>}

    {screen === 'application' && selected && selected.status !== 'draft' && <div className="cabinet-status-view">
      <div className="cabinet-draft-bar"><span>Заявка № {shortId(selected.applicationId)}</span><button type="button" onClick={goToList} disabled={Boolean(busy)}>К списку ↑</button></div>
      {journeyStage && <JourneyProgress stage={journeyStage} />}
      <span className={`cabinet-status status-${selected.status}`}>{STATUS_NAMES[selected.status] || selected.status}</span>
      <h4>{journeyStage?.title || STATUS_NAMES[selected.status] || 'Статус заявки'}</h4>
      <p className="cabinet-description">{journeyStage?.description}</p>
      {nextAction && <div className="cabinet-next-action"><div><span>{nextAction.kind === 'wait' ? 'СЕЙЧАС ДЕЙСТВУЕТ БАНК' : 'СЛЕДУЮЩИЙ ШАГ'}</span><strong>{nextAction.label}</strong><p>{nextAction.description}</p></div></div>}
      <div className="cabinet-summary"><div><span>Компания</span><strong>{company?.name}</strong></div><div><span>Продукт</span><strong>{selected.productName || '—'}</strong></div><div><span>Сумма</span><strong>{formatRub(selected.requestedAmountRub)}</strong></div><div><span>Срок</span><strong>{selected.termMonths ? `${selected.termMonths} мес.` : '—'}</strong></div><div><span>Отправлена</span><strong>{formatDate(selected.submittedAt)}</strong></div></div>
      <DecisionPanel decision={creditDecision} bankRelationship={bankRelationship} choice={offerChoice} onChoose={setOfferChoice} onConfirm={answerOffer} busy={busy} />
      {isAwaitingDecision(selected.status) && <div className="cabinet-processing-note" role="status"><span className="cabinet-spinner" aria-hidden="true" /><span>Статус обновляется каждые 5 секунд. {selected.status === 'manual_review' ? 'Заявка находится на рассмотрении сотрудника банка.' : 'Окончательное решение пока не опубликовано.'}</span></div>}
      <div className="cabinet-section-head"><h4>История заявки</h4><Button view="secondary" type="button" onClick={async () => { setBusy('refresh'); try { await refreshSelected(selected.applicationId); } catch (failure) { reportError(failure); } finally { setBusy(''); } }} disabled={Boolean(busy)}>{busy === 'refresh' ? 'Обновляем…' : 'Обновить'}</Button></div>
      {timeline.length === 0 ? <p className="cabinet-helper">События пока не появились.</p> : <ol className="cabinet-timeline">{timeline.map((event) => <li key={event.eventId}><span className="cabinet-timeline-dot" aria-hidden="true" /><div><strong>{event.title}</strong><time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time></div></li>)}</ol>}
      <div className="cabinet-documents"><div className="cabinet-section-head"><h4>Документы</h4></div><DocumentList documents={documents} download={download} busy={busy} bankRelationship={bankRelationship} /></div>
    </div>}
    {busy === 'opening' && <div className="cabinet-opening-overlay"><LoadingCard title="Открываем заявку" detail="Загружаем актуальные данные и историю." /></div>}
      </div>
    </section>
  </div>;
}

function DocumentList({ documents, download, busy, bankRelationship }) {
  if (documents.length === 0) return <p className="cabinet-helper">Документов пока нет.</p>;
  return <ul className="cabinet-document-list">{documents.map((document) => <li key={document.documentId}><span className="cabinet-document-icon" aria-hidden="true">↧</span><span><strong>{document.fileName}</strong><small>{document.documentType === 'BANK_STATEMENT' && bankRelationship === 'external_account' ? 'Выписка из другого банка' : DOCUMENT_NAMES[document.documentType] || document.documentType} · {formatDate(document.uploadedAt)}</small></span><button type="button" onClick={() => download(document)} disabled={Boolean(busy)} aria-label={`Скачать ${document.fileName}`}>{busy === `download-${document.documentId}` ? '...' : 'Скачать'}</button></li>)}</ul>;
}
