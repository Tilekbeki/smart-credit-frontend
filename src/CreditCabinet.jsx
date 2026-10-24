import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';
import * as api from './api';
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
const isProcessing = (status) => status === 'submitted' || status === 'processing';
const initialForm = (company) => ({
  productId: null,
  purpose: 'stock',
  purposeDescription: '',
  requestedAmountRub: '1000000',
  termMonths: '24',
  monthlyRevenueRub: String(company?.financials?.monthlyRevenueRub ?? ''),
  monthlyExpensesRub: String(company?.financials?.monthlyExpensesRub ?? ''),
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

export default function CreditCabinet() {
  const [profiles, setProfiles] = useState([]);
  const [authStage, setAuthStage] = useState('profiles');
  const [chosenProfile, setChosenProfile] = useState(null);
  const [otpRequest, setOtpRequest] = useState(null);
  const [code, setCode] = useState('');
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [products, setProducts] = useState([]);
  const [applications, setApplications] = useState([]);
  const [applicationsTotal, setApplicationsTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [form, setForm] = useState(initialForm(null));
  const [recommendations, setRecommendations] = useState(null);
  const [screen, setScreen] = useState('new');
  const [documentType, setDocumentType] = useState('BANK_STATEMENT');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [details, setDetails] = useState([]);
  const [notice, setNotice] = useState('');

  const reportError = (failure, fallback = 'Не удалось выполнить действие.') => {
    setError(failure?.message || fallback);
    setDetails(Array.isArray(failure?.details) ? failure.details : []);
  };
  const clearMessages = () => { setError(''); setDetails([]); setNotice(''); };

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
      setApplications([]);
      setAuthStage('profiles');
      setScreen('new');
      setBusy('');
      setError('Сессия истекла. Войдите снова.');
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
    const [application, events, uploaded] = await Promise.all([
      api.getApplication(applicationId),
      api.getApplicationTimeline(applicationId),
      api.listDocuments(applicationId),
    ]);
    setSelected(application);
    setTimeline([...(events.items || [])].sort((a, b) => a.sequence - b.sequence));
    setDocuments(uploaded.items || []);
    return application;
  }, []);

  useEffect(() => {
    if (!selected?.applicationId || !isProcessing(selected.status)) return undefined;
    let active = true;
    let polling = false;
    const timer = window.setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const [application, events] = await Promise.all([
          api.getApplication(selected.applicationId),
          api.getApplicationTimeline(selected.applicationId),
        ]);
        if (!active) return;
        setSelected(application);
        setTimeline([...(events.items || [])].sort((a, b) => a.sequence - b.sequence));
        if (!isProcessing(application.status)) await loadApplications(0);
      } catch (failure) {
        if (active && failure.status !== 401) reportError(failure, 'Не удалось обновить статус.');
      } finally { polling = false; }
    }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selected?.applicationId, selected?.status, loadApplications]);

  const requestCode = async (profile) => {
    clearMessages();
    setBusy('otp-request');
    try {
      const request = await api.requestOtp(profile.id);
      setChosenProfile(profile);
      setOtpRequest(request);
      setCode('');
      setAuthStage('code');
    } catch (failure) { reportError(failure); }
    finally { setBusy(''); }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    clearMessages();
    if (!code.trim()) { setError('Введите код доступа.'); return; }
    setBusy('otp-verify');
    let verified = false;
    try {
      const session = await api.verifyOtp(otpRequest.otpRequestId, code.trim());
      verified = true;
      if (session.role !== 'CLIENT' || !session.companyId) {
        setError('Этот кабинет доступен предпринимателям.');
        setAuthStage('profiles');
        return;
      }
      api.setAccessToken(session.accessToken);
      const [currentUser, currentCompany, productList, page] = await Promise.all([
        api.getMe(), api.getCompany(session.companyId), api.getCreditProducts(),
        api.listApplications({ limit: 20, offset: 0 }),
      ]);
      setUser(currentUser);
      setCompany(currentCompany);
      setProducts(productList.items || []);
      setApplications(page.items || []);
      setApplicationsTotal(page.total || 0);
      setForm(initialForm(currentCompany));
      setSelected(null);
      setRecommendations(null);
      setScreen('new');
      setAuthStage('ready');
      setCode('');
    } catch (failure) {
      if (verified) {
        api.setAccessToken(null);
        setAuthStage('profiles');
      }
      if (failure.status !== 401) reportError(failure, 'Не удалось войти.');
    } finally { setBusy(''); }
  };

  const signOut = () => {
    api.setAccessToken(null);
    setUser(null);
    setCompany(null);
    setSelected(null);
    setApplications([]);
    setApplicationsTotal(0);
    setRecommendations(null);
    setAuthStage('profiles');
    setScreen('new');
    setChosenProfile(null);
    setOtpRequest(null);
    setCode('');
    clearMessages();
  };

  const beginNew = () => {
    clearMessages();
    setSelected(null);
    setDocuments([]);
    setTimeline([]);
    setForm(initialForm(company));
    setRecommendations(null);
    setFile(null);
    setScreen('new');
  };

  const chooseApplication = async (applicationId) => {
    clearMessages();
    setBusy('opening');
    try {
      const application = await refreshSelected(applicationId);
      setForm(formFromApplication(application));
      setRecommendations(null);
      setFile(null);
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
    clearMessages();
  };

  const calculate = async (event) => {
    event.preventDefault();
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
      setForm((previous) => ({ ...previous, productId: response.recommendedProductId || null }));
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
      setForm((previous) => ({ ...previous, productId: response.recommendedProductId || null }));
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
      const saved = selected
        ? await api.updateApplication(selected.applicationId, { version: selected.version, ...payload })
        : await api.createApplication(payload);
      const application = await refreshSelected(saved.applicationId);
      await loadApplications(0);
      setForm(formFromApplication(application));
      setDocumentType(application.productId === 'investment' ? 'EQUIPMENT_INVOICE' : 'BANK_STATEMENT');
      setScreen('application');
      setNotice(selected ? 'Изменения сохранены.' : 'Черновик сохранён. К нему можно вернуться позже.');
    } catch (failure) {
      if (failure?.error === 'version_conflict' || failure?.code === 'version_conflict') {
        try {
          const latest = await refreshSelected(selected.applicationId);
          setForm(formFromApplication(latest));
          await loadApplications(0);
          setError('Черновик изменился в другом окне. Загружена свежая версия; проверьте данные и сохраните снова.');
        } catch (reloadError) { reportError(reloadError); }
      } else reportError(failure);
    } finally { setBusy(''); }
  };

  const upload = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    clearMessages();
    if (!file) { setError('Выберите файл.'); return; }
    if (file.size < 1 || file.size > 5242880 || !/\.(pdf|png|jpe?g)$/i.test(file.name)) {
      setError('Подойдёт непустой PDF, PNG или JPEG размером не более 5 МБ.');
      return;
    }
    setBusy('uploading');
    try {
      await api.uploadDocument(selected.applicationId, documentType, file);
      const response = await api.listDocuments(selected.applicationId);
      setDocuments(response.items || []);
      setFile(null);
      formElement.reset();
      setNotice('Документ загружен.');
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
      await api.submitApplication(selected.applicationId);
      await refreshSelected(selected.applicationId);
      await loadApplications(0);
      setNotice('Заявка отправлена. Статус обновляется автоматически.');
    } catch (failure) { reportError(failure); }
    finally { setBusy(''); }
  };

  const loadMore = async () => {
    clearMessages();
    setBusy('list');
    try { await loadApplications(applications.length); }
    catch (failure) { reportError(failure); }
    finally { setBusy(''); }
  };

  const currentPayload = payloadFromForm(form);
  const hasUnsavedChanges = selected?.status === 'draft' && numericFields.concat(['productId', 'purpose', 'purposeDescription'])
    .some((field) => currentPayload[field] !== selected[field]);
  const canSubmit = selected?.status === 'draft' && !hasUnsavedChanges && selected.productId && selected.purpose !== 'other'
    && numericFields.every((field) => selected[field] !== null);

  if (authStage !== 'ready') return <div className="credit-cabinet credit-cabinet-auth">
    <div className="cabinet-eyebrow"><span>КРЕДИТНЫЙ КАБИНЕТ</span><span>ВХОД</span></div>
    {authStage === 'profiles' ? <>
      <h3>Выберите компанию</h3>
      <p className="cabinet-lede">Откройте профиль предпринимателя, чтобы посмотреть его заявки и подобрать финансирование.</p>
      {busy === 'profiles' && <LoadingCard title="Загружаем профили" detail="Подключаемся к сервису." />}
      <div className="cabinet-profiles">
        {profiles.filter((profile) => profile.role === 'CLIENT').map((profile) => <button type="button" className="cabinet-profile" key={profile.id} onClick={() => requestCode(profile)} disabled={Boolean(busy)}>
          <span className="cabinet-profile-icon" aria-hidden="true">↗</span>
          <span><strong>{profile.companyName}</strong><small>{profile.name}</small></span>
          <span aria-hidden="true">→</span>
        </button>)}
      </div>
      {profiles.length === 0 && !busy && <Button view="secondary" onClick={() => window.location.reload()}>Повторить загрузку</Button>}
      <ErrorNotice error={error} details={details} />
      <p className="cabinet-fineprint">Профили и сведения компаний учебные. Действия доступны только внутри этого проекта.</p>
    </> : <>
      <h3>Подтвердите вход</h3>
      <p className="cabinet-lede">Профиль: <strong>{chosenProfile?.companyName}</strong>. Код доступа для {otpRequest?.maskedPhone}.</p>
      <form onSubmit={verifyCode} className="cabinet-code-form">
        <Input label="Код доступа" type="password" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(_, data) => { setCode(data?.value ?? ''); clearMessages(); }} />
        <ErrorNotice error={error} details={details} />
        <Button view="primary" type="submit" disabled={Boolean(busy)}>{busy === 'otp-verify' ? 'Проверяем код…' : 'Войти в кабинет'}</Button>
      </form>
      <button className="cabinet-text-button" type="button" onClick={() => { setAuthStage('profiles'); setOtpRequest(null); clearMessages(); }}>Выбрать другой профиль</button>
      <p className="cabinet-fineprint">В этом сценарии сообщение на телефон не отправляется. Код выдаётся отдельно.</p>
    </>}
  </div>;

  return <div className="credit-cabinet">
    <div className="cabinet-eyebrow"><span>КАБИНЕТ ПРЕДПРИНИМАТЕЛЯ</span><button type="button" onClick={signOut}>Выйти ↗</button></div>
    <div className="cabinet-account"><div><span className="cabinet-account-kicker">ВАША КОМПАНИЯ</span><h3>{company?.name}</h3><p>{user?.name} · ИНН {company?.inn}</p></div><span className="cabinet-account-mark" aria-hidden="true">а.</span></div>
    <div className="cabinet-tabs" role="navigation" aria-label="Разделы кабинета">
      <button type="button" className={screen === 'new' ? 'active' : ''} onClick={beginNew}>Новая заявка</button>
      <button type="button" className={screen === 'list' || screen === 'application' ? 'active' : ''} onClick={() => { clearMessages(); setScreen('list'); }}>Мои заявки <span>{applicationsTotal}</span></button>
    </div>
    {error && <ErrorNotice error={error} details={details} />}
    {notice && <p className="cabinet-notice" role="status">{notice}</p>}
    {busy === 'opening' && <LoadingCard title="Открываем заявку" detail="Загружаем актуальные данные и историю." />}

    {screen === 'list' && busy !== 'opening' && <div className="cabinet-list">
      <div className="cabinet-section-head"><h4>Ваши заявки</h4><Button view="secondary" onClick={beginNew}>Новая заявка +</Button></div>
      {applications.length === 0 ? <div className="cabinet-empty"><strong>Заявок пока нет</strong><p>Начните с цели и сохраните первый черновик.</p></div> : applications.map((application) => <button key={application.applicationId} type="button" className="cabinet-application-row" onClick={() => chooseApplication(application.applicationId)}>
        <span className="cabinet-row-icon" aria-hidden="true">↗</span>
        <span><strong>{application.productName || 'Черновик без продукта'}</strong><small>№ {shortId(application.applicationId)} · {formatDate(application.updatedAt)}</small></span>
        <span><b>{formatRub(application.requestedAmountRub)}</b><small className={`cabinet-status status-${application.status}`}>{STATUS_NAMES[application.status] || application.status}</small></span>
      </button>)}
      {applications.length < applicationsTotal && <Button view="secondary" onClick={loadMore} disabled={Boolean(busy)}>{busy === 'list' ? 'Загружаем…' : 'Показать ещё'}</Button>}
    </div>}

    {(screen === 'new' || (screen === 'application' && selected?.status === 'draft')) && busy !== 'opening' && <div className="cabinet-workflow">
      {selected && <div className="cabinet-draft-bar"><span>Черновик № {shortId(selected.applicationId)} · версия {selected.version}</span><button type="button" onClick={() => setScreen('list')}>К списку ↑</button></div>}
      <h4>{selected ? 'Редактирование черновика' : 'Для чего нужны средства?'}</h4>
      <p className="cabinet-description">Опишите задачу и проверьте финансовые данные. Подбор покажет возможные варианты, а черновик можно сохранить и продолжить позже.</p>
      <form onSubmit={calculate} className="cabinet-form">
        <fieldset className="cabinet-goals"><legend>Цель финансирования</legend><div>{GOALS.map(([id, label]) => <label key={id} className={form.purpose === id ? 'selected' : ''}><input type="radio" name="purpose" checked={form.purpose === id} onChange={() => updateField('purpose', id)} /><span>{label}</span></label>)}</div></fieldset>
        {form.purpose === 'other' && <label className="cabinet-textarea-label">Опишите задачу<textarea value={form.purposeDescription} maxLength={300} onChange={(event) => updateField('purposeDescription', event.target.value)} placeholder="Например, открыть ещё одну точку" /></label>}
        {form.purpose === 'other' && <p className="cabinet-limitation">Такую задачу можно сохранить в черновике. Для отправки пока выберите одну из пяти поддерживаемых целей.</p>}
        <div className="cabinet-input-grid">
          <Input label="Сумма, ₽" type="number" min="1" value={form.requestedAmountRub} onChange={(_, data) => updateField('requestedAmountRub', data?.value ?? '')} />
          <Input label="Срок, мес." type="number" min="1" max="120" value={form.termMonths} onChange={(_, data) => updateField('termMonths', data?.value ?? '')} />
          <Input label="Выручка в месяц, ₽" type="number" min="0" value={form.monthlyRevenueRub} onChange={(_, data) => updateField('monthlyRevenueRub', data?.value ?? '')} />
          <Input label="Расходы в месяц, ₽" type="number" min="0" value={form.monthlyExpensesRub} onChange={(_, data) => updateField('monthlyExpensesRub', data?.value ?? '')} />
        </div>
        <p className="cabinet-helper">Выручка и расходы подставлены из профиля компании. Измените их, если расчёт нужен с другими данными.</p>
        <Button view="secondary" type="submit" disabled={Boolean(busy)}>{busy === 'recommendations' ? 'Считаем варианты…' : 'Рассчитать варианты ↗'}</Button>
      </form>

      {recommendations && <section className="cabinet-recommendations" aria-label="Предварительный подбор">
        <div className="cabinet-section-head"><div><span>ПРЕДВАРИТЕЛЬНЫЙ ПОДБОР</span><h4>Что подходит сейчас</h4></div><span className="cabinet-budget">Бюджет платежа {formatRub(recommendations.paymentBudgetRub)} / мес.</span></div>
        <div className="cabinet-product-list">{recommendations.products.map((item) => {
          const canSelect = item.matches.purpose && item.matches.amount && item.matches.term;
          return <article key={item.product.id} className={`cabinet-product ${form.productId === item.product.id ? 'chosen' : ''}`}>
            <div className="cabinet-product-heading"><div><small>{item.product.id === recommendations.recommendedProductId ? 'РЕКОМЕНДУЕМ' : 'ВАРИАНТ'}</small><h5>{item.product.name}</h5></div><span>{item.product.annualRatePercent}%*</span></div>
            <div className="cabinet-product-metrics"><div><span>Платёж в месяц</span><strong>{formatRub(item.monthlyPaymentRub)}</strong></div><div><span>Предварительно доступно</span><strong>{formatRub(item.preliminaryAvailableAmountRub)}</strong></div></div>
            {item.reasons?.length > 0 && <ul className="cabinet-reasons">{item.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
            {item.limitations?.length > 0 && <ul className="cabinet-limitations">{item.limitations.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
            {item.adjustments?.length > 0 && <div className="cabinet-adjustments"><strong>Можно попробовать другие параметры:</strong>{item.adjustments.map((option, index) => <button type="button" key={index} onClick={() => applyAdjustment(option)} disabled={Boolean(busy)}>{formatRub(option.amountRub)} на {option.termMonths} мес. <span>↗</span></button>)}</div>}
            <Button view={form.productId === item.product.id ? 'primary' : 'secondary'} type="button" disabled={!canSelect || Boolean(busy)} onClick={() => updateField('productId', item.product.id)}>{form.productId === item.product.id ? 'Выбрано' : 'Выбрать для заявки'}</Button>
          </article>;
        })}</div>
        <p className="cabinet-helper">* Ставка и платёж иллюстративные. Подбор не является решением по кредиту или офертой.</p>
      </section>}

      {!recommendations && products.length > 0 && <div className="cabinet-product-picker"><label htmlFor="cabinet-product-select">Продукт для черновика</label><select id="cabinet-product-select" value={form.productId || ''} onChange={(event) => updateField('productId', event.target.value || null)}><option value="">Пока не выбран</option>{products.filter((product) => product.purposes.includes(form.purpose)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><small>Условия продукта и требования к документам проверяются при отправке.</small></div>}
      <div className="cabinet-primary-actions"><Button view="primary" type="button" onClick={saveDraft} disabled={Boolean(busy)}>{busy === 'saving' ? 'Сохраняем…' : selected ? 'Сохранить изменения' : 'Сохранить черновик'}</Button>{selected && hasUnsavedChanges && <span>Сохраните изменения перед отправкой.</span>}</div>

      {selected && <div className="cabinet-documents"><div className="cabinet-section-head"><div><span>ДОКУМЕНТЫ</span><h4>Файлы заявки</h4></div><small>PDF, PNG или JPEG · до 5 МБ</small></div>
        <form className="cabinet-upload" onSubmit={upload}><label>Тип документа<select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="BANK_STATEMENT">Выписка по счёту</option><option value="EQUIPMENT_INVOICE">Счёт на оборудование</option></select></label><label>Файл<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><Button view="secondary" type="submit" disabled={Boolean(busy) || !file}>{busy === 'uploading' ? 'Загружаем…' : 'Загрузить файл'}</Button></form>
        <DocumentList documents={documents} download={download} busy={busy} />
      </div>}

      {selected && <div className="cabinet-submit"><div><strong>Готовы отправить?</strong><p>После отправки черновик станет доступен для обработки. Остальные черновики сохранятся отдельно.</p>{!canSubmit && !hasUnsavedChanges && <p>Для отправки нужны поддерживаемая цель, продукт, сумма, срок, выручка и расходы. Документы проверятся при отправке.</p>}</div><Button view="primary" type="button" onClick={submit} disabled={!canSubmit || Boolean(busy)}>{busy === 'submitting' ? 'Отправляем…' : 'Отправить заявку ↗'}</Button></div>}
    </div>}

    {screen === 'application' && selected && selected.status !== 'draft' && busy !== 'opening' && <div className="cabinet-status-view">
      <div className="cabinet-draft-bar"><span>Заявка № {shortId(selected.applicationId)}</span><button type="button" onClick={() => setScreen('list')}>К списку ↑</button></div>
      <span className={`cabinet-status status-${selected.status}`}>{STATUS_NAMES[selected.status] || selected.status}</span>
      <h4>{selected.status === 'submitted' ? 'Заявка отправлена' : selected.status === 'processing' ? 'Проверка продолжается' : STATUS_NAMES[selected.status] || 'Статус заявки'}</h4>
      <p className="cabinet-description">{selected.status === 'submitted' ? 'Заявка получена. Предварительные проверки начнутся автоматически.' : selected.status === 'processing' ? timeline.some((event) => event.eventType === 'SCORING_COMPLETED') ? 'Результат оценки сохранён. Ожидается кредитное решение.' : timeline.some((event) => event.eventType === 'PRECHECKS_COMPLETED') ? 'Предварительные проверки завершены. Заявка ожидает дальнейшей обработки.' : 'Идут предварительные проверки компании и финансовых данных.' : 'Текущий статус получен с сервера. Следующие действия появятся после завершения обработки.'}</p>
      <div className="cabinet-summary"><div><span>Компания</span><strong>{company?.name}</strong></div><div><span>Продукт</span><strong>{selected.productName || '—'}</strong></div><div><span>Сумма</span><strong>{formatRub(selected.requestedAmountRub)}</strong></div><div><span>Срок</span><strong>{selected.termMonths ? `${selected.termMonths} мес.` : '—'}</strong></div><div><span>Отправлена</span><strong>{formatDate(selected.submittedAt)}</strong></div></div>
      {isProcessing(selected.status) && <div className="cabinet-processing-note" role="status"><span className="cabinet-spinner" aria-hidden="true" /><span>Статус обновляется каждые 5 секунд. Кредитное решение пока не опубликовано.</span></div>}
      <div className="cabinet-section-head"><h4>История заявки</h4><Button view="secondary" type="button" onClick={async () => { setBusy('refresh'); try { await refreshSelected(selected.applicationId); } catch (failure) { reportError(failure); } finally { setBusy(''); } }} disabled={Boolean(busy)}>{busy === 'refresh' ? 'Обновляем…' : 'Обновить'}</Button></div>
      {timeline.length === 0 ? <p className="cabinet-helper">События пока не появились.</p> : <ol className="cabinet-timeline">{timeline.map((event) => <li key={event.eventId}><span className="cabinet-timeline-dot" aria-hidden="true" /><div><strong>{event.title}</strong><time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time></div></li>)}</ol>}
      <div className="cabinet-documents"><div className="cabinet-section-head"><h4>Документы</h4></div><DocumentList documents={documents} download={download} busy={busy} /></div>
    </div>}
  </div>;
}

function DocumentList({ documents, download, busy }) {
  if (documents.length === 0) return <p className="cabinet-helper">Документов пока нет.</p>;
  return <ul className="cabinet-document-list">{documents.map((document) => <li key={document.documentId}><span className="cabinet-document-icon" aria-hidden="true">↧</span><span><strong>{document.fileName}</strong><small>{DOCUMENT_NAMES[document.documentType] || document.documentType} · {formatDate(document.uploadedAt)}</small></span><button type="button" onClick={() => download(document)} disabled={Boolean(busy)} aria-label={`Скачать ${document.fileName}`}>{busy === `download-${document.documentId}` ? '...' : 'Скачать'}</button></li>)}</ul>;
}
