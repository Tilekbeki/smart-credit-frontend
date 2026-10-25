import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';
import * as api from './api';
import { getJourneyStage, getNextAction, getSubmitChecklist } from './journey';
import GuestChat from './GuestChat';
import ContactSettings from './ContactSettings';
import { fetchVisibleApplications } from './list-window';
import { sendChatApplication } from './services/chat-applications';
import { initialForm, formFromApplication, payloadFromForm, numericFields, selectedLandingPurpose, initialFormAfterSignIn, validateForm, recommendationInput } from './application-form';
import { normalizePhone } from './utils/phone';
import { GOALS } from './config/credit';
import { formatRub, formatDate, shortId } from './utils/format';
import { accountPath, storedAccountPath, saveAccountPath } from './services/account-preference';
import { ErrorNotice, LoadingCard, DecisionPanel, JourneyProgress, SubmitChecklist, DocumentList } from './components/CabinetPanels';
import { CabinetSignIn } from './components/CabinetSignIn';
import { ModuleBoundary } from './components/ModuleBoundary';
import { useLoginProfiles } from './hooks/useLoginProfiles';
import { useSavedSession } from './hooks/useSavedSession';
import { loadCabinetSession } from './services/cabinet-session';
import './cabinet.css';

const BankCabinet = lazy(() => import('./BankCabinet'));

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
const isAwaitingDecision = (status) => ['submitted', 'processing', 'manual_review'].includes(status);
const withNewerDecisionStatus = (application, decision) => decision?.applicationId === application.applicationId
  && decision.version > application.version
  ? { ...application, status: decision.status, version: decision.version }
  : application;
export default function CreditCabinet() {
  const [authStage, setAuthStage] = useState('intro');
  const { profiles, loading: profilesLoading, error: profilesError, retry: retryProfiles } = useLoginProfiles(authStage === 'phone');
  const [guestProgress, setGuestProgress] = useState(null);
  const [chatForm, setChatForm] = useState(initialForm);
  const [chatHistory, setChatHistory] = useState(null);
  const chatReturnScreen = useRef('list');
  const chatSending = useRef(false);
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
  const [form, setForm] = useState(() => ({ ...initialForm(), purpose: selectedLandingPurpose(window.location.search) || 'stock' }));
  const [newFormBaseline, setNewFormBaseline] = useState(initialForm());
  const [recommendations, setRecommendations] = useState(null);
  const [screen, setScreen] = useState('new');
  const [documentType, setDocumentType] = useState('BANK_STATEMENT');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [details, setDetails] = useState([]);
  const [notice, setNotice] = useState('');
  const [conflictedForm, setConflictedForm] = useState(null);
  const [contactsDirty, setContactsDirty] = useState(false);
  const [bankRelationship, setBankRelationship] = useState('unknown');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [draftLimitReached, setDraftLimitReached] = useState(false);
  const [savedNewForm, setSavedNewForm] = useState(null);
  const [listRefreshNotice, setListRefreshNotice] = useState('');
  const documentsRef = useRef(null);
  const fileInputRef = useRef(null);
  const formRef = useRef(null);
  const submitRef = useRef(null);
  const panelContentRef = useRef(null);
  const offerActionRef = useRef(null);
  const guestPrefillRef = useRef(null);

  const reportError = (failure, fallback = 'Не удалось выполнить действие.') => {
    setError(failure?.message || fallback);
    setDetails(Array.isArray(failure?.details) ? failure.details : []);
  };
  const clearMessages = () => { setError(''); setDetails([]); setNotice(''); };
  const fieldError = (field) => details.find((item) => item.field === field)?.message;

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
      setForm(initialForm());
      setNewFormBaseline(initialForm());
      setRecommendations(null);
      setFile(null);
      setChosenProfile(null);
      setOtpRequest(null);
      setCode('');
      setPhone('');
      setAuthStage('phone');
      setScreen('new');
      guestPrefillRef.current = null;
      setGuestProgress(null);
      setChatForm(initialForm()); setChatHistory(null);
      setConflictedForm(null);
      setContactsDirty(false); setBankRelationship('unknown'); setDeleteTarget(null); setSavedNewForm(null); setDraftLimitReached(false);
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

  useEffect(() => {
    if (authStage !== 'ready' || user?.role !== 'CLIENT' || screen !== 'list' || busy) return undefined;
    let active = true;
    let pending = false;
    const timer = window.setInterval(async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const page = await fetchVisibleApplications(api.listApplications, applications.length);
        if (active) { setApplications(page.items); setApplicationsTotal(page.total); setListRefreshNotice(''); }
      } catch (failure) { if (active && failure.status !== 401) setListRefreshNotice('Не удалось обновить список автоматически. Повторим попытку.'); }
      finally { pending = false; }
    }, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [authStage, user?.role, screen, busy, applications.length]);

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
      setPhone(profile.phone);
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
    if (profilesLoading || busy) return;
    if (!normalized) {
      setError('Введите номер телефона в формате +7 999 000-00-00.');
      return;
    }
    const profile = profiles.find((item) => ['CLIENT', 'BANK_EMPLOYEE'].includes(item.role) && normalizePhone(item.phone) === normalized);
    if (!profile) {
      setError('Этот номер пока не подключён. Используйте номер из раздела «Доступные профили для входа».');
      return;
    }
    requestCode(profile);
  };

  const applySession = useCallback((snapshot) => {
    api.setAccessToken(snapshot.accessToken);
    setUser(snapshot.user);
    setCompany(snapshot.company);
    setBankRelationship(snapshot.company ? storedAccountPath(snapshot.company.id) : 'unknown');
    setProducts(snapshot.products);
    setApplications(snapshot.applications);
    setApplicationsTotal(snapshot.total);
    const startingForm = initialFormAfterSignIn(snapshot.products, window.location.search);
    const guestPrefill = snapshot.user.role === 'CLIENT' ? guestPrefillRef.current : null;
    setForm(startingForm); setNewFormBaseline(startingForm);
    setChatForm(guestPrefill ? { ...startingForm, ...guestPrefill.form, productId: null } : initialForm());
    setChatHistory(guestPrefill?.progress || null);
    chatReturnScreen.current = 'list';
    guestPrefillRef.current = null; setGuestProgress(null);
    setSelected(null); setCreditDecision(null); setOfferChoice(null); offerActionRef.current = null;
    setDocuments([]); setTimeline([]); setRecommendations(null); setFile(null);
    setScreen('list'); setConflictedForm(null); setContactsDirty(false); setDeleteTarget(null);
    setSavedNewForm(null); setDraftLimitReached(false);
    setAuthStage('ready'); setOtpRequest(null); setCode('');
    setError(''); setDetails([]); setNotice('');
  }, []);

  const savedSession = useSavedSession(applySession);

  useEffect(() => {
    if (savedSession.status !== 'expired') return;
    setAuthStage('phone');
    setError('Сессия истекла. Войдите по номеру телефона, чтобы продолжить.');
  }, [savedSession.status]);

  const completeSignIn = async (session) => {
    const snapshot = await loadCabinetSession(api, session.accessToken);
    applySession(snapshot);
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
    if (savedNewForm && !window.confirm('Ввод новой заявки ещё не сохранён на сервере. Выйти из кабинета?')) return;
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
    setForm(initialForm());
    setNewFormBaseline(initialForm());
    setFile(null);
    setRecommendations(null);
    setAuthStage('intro');
    setScreen('new');
    guestPrefillRef.current = null;
    setGuestProgress(null);
    setChatForm(initialForm()); setChatHistory(null);
    setChosenProfile(null);
    setOtpRequest(null);
    setCode('');
    setPhone('');
    setConflictedForm(null);
    setContactsDirty(false); setBankRelationship('unknown'); setDeleteTarget(null); setSavedNewForm(null); setDraftLimitReached(false);
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
    const startingForm = initialForm();
    setForm(savedNewForm || startingForm);
    setSavedNewForm(null);
    setNewFormBaseline(startingForm);
    setRecommendations(null);
    setFile(null);
    setConflictedForm(null);
    setContactsDirty(false); setDeleteTarget(null);
    setScreen('new');
  };

  const goToList = () => {
    if (!confirmLeaveForm()) return;
    clearMessages();
    setConflictedForm(null);
    setContactsDirty(false); setDeleteTarget(null);
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
      const response = await api.getRecommendations(recommendationInput(form));
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
      const response = await api.getRecommendations(recommendationInput(next));
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
      if (wasNew) { setDraftLimitReached(false); setSavedNewForm(null); }
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
      } else {
        if (failure.code === 'draft_limit_reached') setDraftLimitReached(true);
        reportError(failure);
      }
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

  const manageDraftLimit = async () => {
    setSavedNewForm({ ...form }); setDraftLimitReached(false); setScreen('list'); clearMessages(); setBusy('list');
    try { await loadApplications(0); }
    catch (failure) { reportError(failure, 'Не удалось загрузить черновики. Ввод новой заявки остался на странице.'); }
    finally { setBusy(''); }
  };

  const removeDraft = async () => {
    if (!deleteTarget) return;
    clearMessages(); setBusy('deleting');
    try {
      await api.deleteApplication(deleteTarget.applicationId, deleteTarget.version);
      setApplications((previous) => previous.filter((item) => item.applicationId !== deleteTarget.applicationId));
      setApplicationsTotal((previous) => Math.max(0, previous - 1));
      setSelected(null); setCreditDecision(null); setDocuments([]); setTimeline([]); setRecommendations(null);
      setForm(initialForm()); setNewFormBaseline(initialForm()); setDeleteTarget(null); setDraftLimitReached(false); setScreen('list');
      setNotice('Черновик удалён. Можно продолжить другую заявку или создать новую.');
      try { await loadApplications(0); } catch { setNotice('Черновик удалён. Обновить список пока не удалось.'); }
    } catch (failure) {
      if (failure.code === 'version_conflict' || failure.code === 'invalid_status') {
        setDeleteTarget(null);
        try { const latest = await refreshSelected(deleteTarget.applicationId); setForm(formFromApplication(latest)); } catch { /* Keep the original conflict visible. */ }
      }
      reportError(failure);
    } finally { setBusy(''); }
  };

  const openContacts = () => {
    if (!confirmLeaveForm()) return;
    clearMessages(); setContactsDirty(false); setScreen('contacts'); setDeleteTarget(null);
  };

  const useProfileFinancials = () => {
    if (!confirmLeaveForm()) return;
    if (savedNewForm && !window.confirm('На странице есть несохранённый ввод новой заявки. Заменить его данными профиля?')) return;
    const starting = initialForm();
    setForm({ ...starting, monthlyRevenueRub: String(company.financials.monthlyRevenueRub), monthlyExpensesRub: String(company.financials.monthlyExpensesRub) });
    setNewFormBaseline(starting); setSelected(null); setDocuments([]); setTimeline([]); setRecommendations(null); setCreditDecision(null); setConflictedForm(null); setContactsDirty(false); setSavedNewForm(null); setDeleteTarget(null); setScreen('new');
    clearMessages(); setNotice('Выручка и расходы подставлены из профиля. Проверьте их перед сохранением заявки.');
  };

  const openChat = () => {
    if (!confirmLeaveForm()) return;
    clearMessages();
    chatReturnScreen.current = screen;
    setScreen('chat');
  };

  const sendFromChat = async (productId, answers) => {
    if (chatSending.current || user?.role !== 'CLIENT') return;
    recommendationInput(answers);
    chatSending.current = true;
    setBusy('chat-submit');
    clearMessages();
    try {
      const outcome = await sendChatApplication(api, payloadFromForm({ ...answers, productId }));
      const saved = outcome.application;
      setApplications((previous) => [saved, ...previous.filter((item) => item.applicationId !== saved.applicationId)]);
      setApplicationsTotal((previous) => previous + 1);
      setSelected(saved); setCreditDecision(null); setOfferChoice(null); offerActionRef.current = null;
      setForm(formFromApplication(saved)); setDocuments([]); setTimeline([]); setRecommendations(null);
      setFile(null); setConflictedForm(null); setContactsDirty(false); setDeleteTarget(null); setDraftLimitReached(false);
      const missingDocument = outcome.failure?.details?.find((item) => item.field?.startsWith('documents.'));
      setDocumentType(missingDocument ? missingDocument.field.split('.')[1] : productId === 'investment' ? 'EQUIPMENT_INVOICE' : 'BANK_STATEMENT');
      setScreen('application');
      // Clear completed chat input so reopening the chat cannot resubmit this application.
      setChatHistory(null); setChatForm(initialForm());
      setNotice(outcome.submitted
        ? 'Заявка отправлена на согласование. Следите за решением и дальнейшими действиями здесь.'
        : missingDocument
          ? 'Черновик сохранён. Загрузите нужный документ и отправьте заявку на согласование.'
          : 'Заявка сохранена в кабинете. Проверьте её статус перед повторной отправкой.');
      if (missingDocument) setDetails(outcome.failure.details);
      else if (outcome.failure) reportError(outcome.failure);
      try {
        await refreshSelected(saved.applicationId);
        await loadApplications(0);
      } catch {
        setNotice(outcome.submitted ? 'Заявка отправлена. Обновить историю пока не удалось; проверьте её чуть позже.' : 'Черновик сохранён. Обновить данные пока не удалось; откройте заявку из списка.');
      }
      if (missingDocument) window.requestAnimationFrame(() => {
        documentsRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
        fileInputRef.current?.focus({ preventScroll: true });
      });
    } catch (failure) {
      if (failure.code === 'draft_limit_reached') {
        setForm({ ...answers, productId }); setNewFormBaseline(initialForm()); setSelected(null);
        setCreditDecision(null); setDocuments([]); setTimeline([]); setRecommendations(null);
        setConflictedForm(null); setContactsDirty(false); setDeleteTarget(null); setFile(null);
        setDraftLimitReached(true); setScreen('new'); reportError(failure);
      } else {
        throw failure;
      }
    } finally { chatSending.current = false; setBusy(''); }
  };

  const currentPayload = payloadFromForm(form);
  const editableFields = numericFields.concat(['productId', 'purpose', 'purposeDescription']);
  const hasUnsavedChanges = screen === 'application' && selected?.status === 'draft' && editableFields
    .some((field) => currentPayload[field] !== selected[field]);
  const baselinePayload = payloadFromForm(newFormBaseline);
  const hasNewChanges = screen === 'new' && editableFields.some((field) => currentPayload[field] !== baselinePayload[field]);
  const confirmLeaveForm = () => !(hasUnsavedChanges || hasNewChanges || conflictedForm || contactsDirty)
    || window.confirm('Введённые изменения не сохранены. Покинуть эту форму?');
  const selectedProduct = products.find((product) => product.id === selected?.productId) || null;
  const formProduct = products.find((product) => product.id === form.productId) || null;
  const checklist = getSubmitChecklist(selected?.status === 'draft' ? selected : null, documents, details, selectedProduct, bankRelationship);
  const journeyStage = selected ? getJourneyStage(selected, timeline, creditDecision) : null;
  const nextAction = selected ? getNextAction(selected, timeline, documents, details, selectedProduct, bankRelationship, creditDecision) : null;
  const canSubmit = selected?.status === 'draft' && !hasUnsavedChanges && checklist.readyToSubmit;
  const draftToContinue = applications.filter((item) => item.status === 'draft')
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt))[0];
  const showApplicationDetails = screen === 'new' || screen === 'application';

  useEffect(() => {
    if (authStage !== 'ready' || !(hasUnsavedChanges || hasNewChanges || conflictedForm || contactsDirty || savedNewForm)) return undefined;
    const warnBeforeLeave = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [authStage, hasUnsavedChanges, hasNewChanges, conflictedForm, contactsDirty, savedNewForm]);

  useEffect(() => {
    if (authStage === 'ready' && panelContentRef.current) panelContentRef.current.scrollTop = 0;
  }, [authStage, screen, selected?.applicationId]);

  const panelTitle = screen === 'contacts' ? 'Контакты и данные' : screen === 'list' ? 'Мои заявки' : screen === 'new' ? 'Новая заявка'
    : selected?.status === 'draft' ? 'Черновик заявки' : 'Статус заявки';
  const panelDescription = screen === 'contacts' ? 'Обновляйте контактные данные и проверяйте сведения компании.' : screen === 'list'
    ? 'Продолжайте черновики и следите за уже отправленными заявками.'
    : screen === 'new'
      ? 'Укажите задачу бизнеса — покажем подходящие варианты и следующие шаги.'
      : selected?.status === 'draft'
        ? 'Проверьте данные, приложите документы и отправьте заявку.'
        : 'Здесь видны этап проверки и история вашей заявки.';

  if (savedSession.status === 'loading') return <LoadingCard title="Восстанавливаем вход" detail="Проверяем сессию и загружаем ваш кабинет." />;
  if (savedSession.status === 'error') return <div className="credit-cabinet credit-cabinet-auth">
    <h3>Не удалось открыть кабинет</h3><ErrorNotice error={savedSession.error} />
    <p className="cabinet-description">Сохранённая сессия остаётся в браузере. Повторите загрузку, когда соединение восстановится.</p>
    <Button className="cabinet-primary-button" view="primary" onClick={savedSession.retry}>Повторить загрузку кабинета</Button>
    <button className="cabinet-text-button" type="button" onClick={() => { savedSession.dismiss(); setAuthStage('phone'); clearMessages(); }}>Войти по другому номеру</button>
  </div>;

  if (authStage === 'intro') return <GuestChat
    form={form}
    onFieldChange={updateField}
    initialProgress={guestProgress}
    onProgressChange={setGuestProgress}
    onContinue={() => { guestPrefillRef.current = { form: { ...form }, progress: guestProgress }; clearMessages(); setAuthStage('phone'); }}
    onSignIn={() => { guestPrefillRef.current = null; clearMessages(); setAuthStage('phone'); }}
  />;

  if (authStage !== 'ready') return <CabinetSignIn
    authStage={authStage} phone={phone} code={code} profiles={profiles}
    profilesLoading={profilesLoading} profilesError={profilesError} retryProfiles={retryProfiles}
    otpRequest={otpRequest} chosenProfile={chosenProfile} busy={busy} error={error} details={details} notice={notice}
    submitPhone={submitPhone} verifyCode={verifyCode} requestCode={requestCode}
    onBack={() => { setAuthStage('intro'); setOtpRequest(null); setCode(''); clearMessages(); }}
    onChangeNumber={() => { setAuthStage('phone'); setOtpRequest(null); setCode(''); clearMessages(); }}
    onPhoneChange={(value) => { setPhone(value); setChosenProfile(null); clearMessages(); }}
    onCodeChange={(value) => { setCode(value); clearMessages(); }}
  />;

  if (user?.role === 'BANK_EMPLOYEE') return <ModuleBoundary><Suspense fallback={<LoadingCard title="Открываем рабочий кабинет" detail="Загружаем инструменты сотрудника." />}><BankCabinet user={user} onSignOut={signOut} /></Suspense></ModuleBoundary>;

  if (screen === 'chat') return <GuestChat
    key="authenticated-chat" authenticated company={company} form={chatForm}
    onFieldChange={(field, value) => setChatForm((previous) => ({ ...previous, [field]: value, ...(field === 'purpose' && value !== 'other' ? { purposeDescription: '' } : {}) }))}
    initialProgress={chatHistory} onProgressChange={setChatHistory}
    onRecommend={api.getRecommendations} onSubmitApplication={sendFromChat}
    onBackToCabinet={() => setScreen(chatReturnScreen.current)} busy={Boolean(busy)}
  />;

  return <div className="credit-cabinet credit-cabinet-dashboard">
    <aside className="cabinet-sidebar" aria-label="Компания и разделы">
    <div className="cabinet-account"><div><span className="cabinet-account-kicker">ВАША КОМПАНИЯ</span><h3>{company?.name}</h3><p>{user?.name} · ИНН {company?.inn}</p></div></div>
    <div className="cabinet-tabs" role="navigation" aria-label="Разделы кабинета">
      <button type="button" className={screen === 'new' ? 'active' : ''} onClick={beginNew} disabled={Boolean(busy)}>Новая заявка</button>
      <button type="button" className={screen === 'list' || screen === 'application' ? 'active' : ''} onClick={goToList} disabled={Boolean(busy)}>Мои заявки <span>{applicationsTotal}</span></button>
      <button type="button" onClick={openChat} disabled={Boolean(busy)}>Подобрать в чате</button>
      <button type="button" className={screen === 'contacts' ? 'active' : ''} onClick={openContacts} disabled={Boolean(busy)}>Контакты и данные</button>
    </div>
    <details className="cabinet-account-details"><summary>Данные о счёте</summary><div className="cabinet-account-preference"><label htmlFor="account-relationship">Где открыт счёт бизнеса?</label><select id="account-relationship" value={bankRelationship} disabled={Boolean(busy)} onChange={(event) => { const value = accountPath(event.target.value); setBankRelationship(value); saveAccountPath(company.id, value); }}><option value="unknown">Укажу позже</option><option value="alfa_account">В Альфа-Банке</option><option value="external_account">В другом банке</option></select><p>Ваш выбор сохраняется в этом браузере и помогает с подсказками. Нужные документы банк проверит при отправке заявки.</p></div></details>
    <button className="cabinet-signout" type="button" onClick={signOut} disabled={Boolean(busy)}>Выйти из кабинета</button>
    </aside>
    <section className="cabinet-main-panel" aria-label={panelTitle}>
      <header className="cabinet-panel-header"><div><h2>{panelTitle}</h2><p>{panelDescription}</p></div><span className="cabinet-panel-count">Заявок: {applicationsTotal}</span></header>
      <div className="cabinet-panel-content" ref={panelContentRef} aria-busy={busy === 'opening'}>
    {error && <ErrorNotice error={error} details={details} />}
    {notice && <p className="cabinet-notice" role="status">{notice}</p>}
    {draftLimitReached && <div className="cabinet-draft-limit"><p>Удалите ненужный черновик или отправьте готовую заявку. Введённые данные новой заявки можно оставить на этой странице.</p><Button view="secondary" onClick={manageDraftLimit} disabled={Boolean(busy)}>Перейти к черновикам</Button></div>}
    {screen === 'contacts' && <ContactSettings user={user} company={company} onUserChange={setUser} onCompanyChange={setCompany} onDirtyChange={setContactsDirty} onBusyChange={(value) => setBusy(value ? 'contacts' : '')} onUseFinancials={useProfileFinancials} />}

    {screen === 'list' && <div className="cabinet-list">
      {chatHistory?.history?.length > 0 && <div className="cabinet-resume"><div><strong>Ответы из чата сохранены</strong><p>Продолжите подбор с того места, где остановились.</p></div><Button view="secondary" onClick={openChat} disabled={Boolean(busy)}>Продолжить подбор</Button></div>}
      <p className="cabinet-helper" role="status">{listRefreshNotice || 'Список обновляется автоматически каждые 10 секунд.'}</p>
      {savedNewForm && <div className="cabinet-resume"><div><strong>Ввод новой заявки остался на странице</strong><p>После освобождения места вернитесь к заполнению.</p></div><Button view="secondary" onClick={beginNew} disabled={Boolean(busy)}>Вернуться к новой заявке</Button></div>}
      <div className="cabinet-section-head"><div><h4>Ваши заявки</h4><p className="cabinet-list-hint">Откройте черновик, чтобы продолжить, или проверьте статус отправленной заявки.</p></div><Button view="secondary" onClick={beginNew} disabled={Boolean(busy)}>Новая заявка +</Button></div>
      {draftToContinue && <div className="cabinet-resume"><div><span>МОЖНО ПРОДОЛЖИТЬ</span><strong>{draftToContinue.productName || 'Черновик кредитной заявки'}</strong><p>Сохранён {formatDate(draftToContinue.updatedAt || draftToContinue.createdAt)}. Данные останутся в этой заявке до отправки.</p></div><Button className="cabinet-primary-button" view="primary" onClick={() => chooseApplication(draftToContinue.applicationId)} disabled={Boolean(busy)}>Продолжить заявку</Button></div>}
      {applications.length === 0 ? <div className="cabinet-empty"><strong>Заявок пока нет</strong><p>Начните с цели и сохраните первый черновик.</p></div> : applications.map((application) => <button key={application.applicationId} type="button" className="cabinet-application-row" onClick={() => chooseApplication(application.applicationId)} disabled={Boolean(busy)}>
        <span><strong>{application.productName || 'Черновик без продукта'}</strong><small>№ {shortId(application.applicationId)} · {formatDate(application.updatedAt)}</small></span>
        <span><b>{formatRub(application.requestedAmountRub)}</b><small className={`cabinet-status status-${application.status}`}>{STATUS_NAMES[application.status] || application.status}</small></span>
      </button>)}
      {applications.length < applicationsTotal && <Button view="secondary" onClick={loadMore} disabled={Boolean(busy)}>{busy === 'list' ? 'Загружаем…' : 'Показать ещё'}</Button>}
    </div>}

    {(screen === 'new' || (screen === 'application' && selected?.status === 'draft')) && <div className="cabinet-workflow">
      {selected && <div className="cabinet-draft-bar"><span>Черновик № {shortId(selected.applicationId)} · версия {selected.version}</span><button type="button" onClick={goToList} disabled={Boolean(busy)}>К списку</button></div>}
      {selected?.availableActions?.includes('delete') && <div className="cabinet-delete-draft">{deleteTarget ? <div className="cabinet-conflict" role="group" aria-label="Удаление черновика"><strong>Удалить этот черновик?</strong><p>Заявка и её документы станут недоступны в кабинете. Отправленные заявки не изменятся.</p><div><Button view="primary" className="cabinet-primary-button" disabled={Boolean(busy)} onClick={removeDraft}>{busy === 'deleting' ? 'Удаляем…' : 'Да, удалить черновик'}</Button><button className="cabinet-text-button" type="button" disabled={Boolean(busy)} onClick={() => setDeleteTarget(null)}>Отмена</button></div></div> : <button className="cabinet-text-button" type="button" disabled={Boolean(busy)} onClick={() => setDeleteTarget({ applicationId: selected.applicationId, version: selected.version })}>Удалить черновик</button>}</div>}
      {selected && journeyStage && <JourneyProgress stage={journeyStage} />}
      {conflictedForm && <div className="cabinet-conflict" role="alert"><strong>Ваш ввод сохранён на этой странице</strong><p>С сервера загружена новая версия черновика. Восстановите свои значения, проверьте их и снова сохраните.</p><div><Button view="secondary" onClick={() => { setForm(conflictedForm); setConflictedForm(null); clearMessages(); setNotice('Ваш ввод восстановлен. Проверьте данные и сохраните изменения.'); }}>Восстановить мой ввод</Button><button type="button" className="cabinet-text-button" onClick={() => { setConflictedForm(null); clearMessages(); }}>Оставить версию сервера</button></div></div>}
      <h4>{selected ? 'Редактирование черновика' : 'Для чего нужны средства?'}</h4>
      <p className="cabinet-description">Опишите задачу и проверьте финансовые данные. Подбор покажет возможные варианты, а черновик можно сохранить и продолжить позже.</p>
      <form onSubmit={calculate} className="cabinet-form" ref={formRef}>
        <fieldset className="cabinet-goals" disabled={Boolean(busy)}><legend>Цель финансирования</legend><div>{GOALS.map(([id, label]) => <label key={id} className={form.purpose === id ? 'selected' : ''}><input type="radio" name="purpose" checked={form.purpose === id} onChange={() => updateField('purpose', id)} /><span>{label}</span></label>)}</div>{fieldError('purpose') && <small className="cabinet-inline-error" role="alert">{fieldError('purpose')}</small>}</fieldset>
        {form.purpose === 'other' && <label className="cabinet-textarea-label">Опишите задачу<textarea value={form.purposeDescription} maxLength={600} disabled={Boolean(busy)} onChange={(event) => updateField('purposeDescription', event.target.value)} placeholder="Например, открыть ещё одну точку" /></label>}
        {form.purpose === 'other' && <p className="cabinet-limitation">Такую задачу можно сохранить в черновике. Для отправки пока выберите одну из пяти поддерживаемых целей.</p>}
        <div className="cabinet-input-grid">
          <div><Input className="cabinet-finance-input" label="Сумма, ₽" name="requestedAmountRub" type="number" min="1" disabled={Boolean(busy)} value={form.requestedAmountRub} onChange={(_, data) => updateField('requestedAmountRub', data?.value ?? '')} />{fieldError('requestedAmountRub') && <small className="cabinet-inline-error" role="alert">{fieldError('requestedAmountRub')}</small>}</div>
          <div><Input className="cabinet-finance-input" label="Срок, мес." name="termMonths" type="number" min="1" max="120" disabled={Boolean(busy)} value={form.termMonths} onChange={(_, data) => updateField('termMonths', data?.value ?? '')} />{fieldError('termMonths') && <small className="cabinet-inline-error" role="alert">{fieldError('termMonths')}</small>}</div>
          <div><Input className="cabinet-finance-input" label="Выручка в месяц, ₽" name="monthlyRevenueRub" type="number" min="0" disabled={Boolean(busy)} value={form.monthlyRevenueRub} onChange={(_, data) => updateField('monthlyRevenueRub', data?.value ?? '')} />{fieldError('monthlyRevenueRub') && <small className="cabinet-inline-error" role="alert">{fieldError('monthlyRevenueRub')}</small>}</div>
          <div><Input className="cabinet-finance-input" label="Расходы в месяц, ₽" name="monthlyExpensesRub" type="number" min="0" disabled={Boolean(busy)} value={form.monthlyExpensesRub} onChange={(_, data) => updateField('monthlyExpensesRub', data?.value ?? '')} />{fieldError('monthlyExpensesRub') && <small className="cabinet-inline-error" role="alert">{fieldError('monthlyExpensesRub')}</small>}</div>
        </div>
        <p className="cabinet-helper">{bankRelationship === 'alfa_account'
          ? 'Данные из профиля можно подставить через раздел «Контакты и данные». Проверьте показатели перед отправкой заявки.'
          : bankRelationship === 'external_account'
            ? 'Укажите месячную выручку и расходы. Выписку из другого банка можно подготовить заранее; сервис проверит необходимость документа при отправке.'
            : 'Укажите месячную выручку и расходы. Источник оборотов пока не подтверждён.'}</p>
        <Button view="secondary" type="submit" disabled={Boolean(busy)}>{busy === 'recommendations' ? 'Считаем варианты…' : 'Рассчитать варианты'}</Button>
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
            {item.adjustments?.length > 0 && <div className="cabinet-adjustments"><strong>Можно попробовать другие параметры:</strong>{item.adjustments.map((option, index) => <button type="button" key={index} onClick={() => applyAdjustment(option)} disabled={Boolean(busy)}>{formatRub(option.amountRub)} на {option.termMonths} мес. </button>)}</div>}
            <Button className="cabinet-select-product" view={form.productId === item.product.id ? 'primary' : 'secondary'} type="button" disabled={!canSelect || Boolean(busy)} onClick={() => updateField('productId', item.product.id)}>{form.productId === item.product.id ? 'Выбрано для заявки' : canSelect ? 'Выбрать для заявки' : 'Сейчас не подходит'}</Button>
          </article>;
        })}</div>
        <p className="cabinet-helper">* Ставка и платёж иллюстративные. Подбор не является решением по кредиту или офертой.</p>
      </section>}

      {showApplicationDetails && !recommendations && products.length > 0 && <div className="cabinet-product-picker"><label htmlFor="cabinet-product-select">Продукт для черновика</label><select id="cabinet-product-select" value={form.productId || ''} disabled={Boolean(busy)} onChange={(event) => updateField('productId', event.target.value || null)}><option value="">Пока не выбран</option>{products.filter((product) => product.purposes.includes(form.purpose)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>{fieldError('productId') && <small className="cabinet-inline-error" role="alert">{fieldError('productId')}</small>}<small>Условия продукта и требования к документам проверяются при отправке.</small></div>}
      {showApplicationDetails && formProduct && <div className="cabinet-product-terms"><strong>Условия выбранного продукта</strong><span>Сумма: {formatRub(formProduct.minAmountRub)}–{formatRub(formProduct.maxAmountRub)}</span><span>Срок: {formProduct.minTermMonths}–{formProduct.maxTermMonths} мес.</span><span>Стаж бизнеса: от {formProduct.minBusinessAgeMonths} мес.</span></div>}
      {showApplicationDetails && <div className="cabinet-document-plan"><strong>Что подготовить для отправки</strong><p>{form.productId === 'investment' ? 'Для кредита на оборудование понадобится счёт на оборудование. Загрузить его можно после сохранения черновика.' : form.productId === 'turnover' ? bankRelationship === 'external_account' ? 'Подготовьте выписку из другого банка. Её можно загрузить после сохранения черновика; необходимость документа проверится при отправке.' : 'Выписка по счёту может понадобиться, если банку не хватит данных об оборотах. Если она нужна, сервис уточнит это при отправке.' : 'Выберите продукт: после этого покажем известные требования к документам.'}</p></div>}
      {showApplicationDetails && <div className="cabinet-primary-actions"><Button className="cabinet-primary-button" view="primary" type="button" onClick={saveDraft} disabled={Boolean(busy)}>{busy === 'saving' ? 'Сохраняем…' : selected ? 'Сохранить изменения' : 'Сохранить черновик'}</Button>{selected && hasUnsavedChanges && <span>Сохраните изменения перед отправкой.</span>}</div>}

      {selected && <SubmitChecklist checklist={checklist} />}
      {selected && nextAction && <div className="cabinet-next-action" aria-live="polite"><div><span>СЛЕДУЮЩЕЕ ДЕЙСТВИЕ</span><strong>{nextAction.label}</strong><p>{nextAction.description}</p></div>{['complete_draft', 'upload_document', 'review_and_submit'].includes(nextAction.kind) && <Button view="secondary" onClick={scrollToNextAction}>Перейти</Button>}</div>}

      {selected && <div className="cabinet-documents" ref={documentsRef}><div className="cabinet-section-head"><div><span>ДОКУМЕНТЫ</span><h4>Файлы заявки</h4></div><small>PDF, PNG или JPEG · до 5 МБ</small></div>
        <form className="cabinet-upload" onSubmit={upload}><label>Тип документа<select value={documentType} disabled={Boolean(busy)} onChange={(event) => setDocumentType(event.target.value)}><option value="BANK_STATEMENT">{bankRelationship === 'external_account' ? 'Выписка из другого банка' : 'Выписка по счёту'}</option><option value="EQUIPMENT_INVOICE">Счёт на оборудование</option></select></label><label>Файл<input ref={fileInputRef} type="file" disabled={Boolean(busy)} accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><Button view="secondary" type="submit" disabled={Boolean(busy) || !file}>{busy === 'uploading' ? 'Загружаем…' : 'Загрузить файл'}</Button></form>
        {details.filter((item) => item.field?.startsWith('documents.')).map((item, index) => <p className="cabinet-inline-error" key={`${item.field}-${index}`} role="alert">{item.message}</p>)}
        <DocumentList documents={documents} download={download} busy={busy} bankRelationship={bankRelationship} />
      </div>}

      {selected && <div className="cabinet-submit" ref={submitRef}><div><strong>Готовы отправить?</strong><p>После отправки банк увидит эту заявку и начнёт проверки. Остальные черновики сохранятся отдельно.</p>{!canSubmit && <p>{hasUnsavedChanges ? 'Сначала сохраните изменения.' : 'Исправьте пункты в списке готовности выше.'}</p>}</div><Button className="cabinet-primary-button" view="primary" type="button" onClick={submit} disabled={!canSubmit || Boolean(busy)}>{busy === 'submitting' ? 'Отправляем…' : 'Отправить заявку'}</Button></div>}
    </div>}

    {screen === 'application' && selected && selected.status !== 'draft' && <div className="cabinet-status-view">
      <div className="cabinet-draft-bar"><span>Заявка № {shortId(selected.applicationId)}</span><button type="button" onClick={goToList} disabled={Boolean(busy)}>К списку</button></div>
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
