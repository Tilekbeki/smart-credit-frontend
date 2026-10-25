import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';
import * as api from './api';
import { BANK_STATUSES, canReview, prepareBankDecision } from './bank-review';
import { fetchVisibleApplications } from './list-window';
import './bank-cabinet.css';

const rub = (value) => value == null ? '—' : `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const date = (value) => value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const idLabel = (value) => value?.slice(0, 8).toUpperCase();
const goal = { stock: 'Товары и сырьё', expenses: 'Текущие расходы', seasonal: 'Сезонный спрос', equipment: 'Оборудование', upgrade: 'Модернизация', other: 'Другая задача' };
const documentNames = { BANK_STATEMENT: 'Выписка по счёту', EQUIPMENT_INVOICE: 'Счёт на оборудование' };
const riskNames = { LOW: 'Низкий', MEDIUM: 'Средний', HIGH: 'Высокий' };
const percent = (value) => value == null ? 'Нет данных' : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value * 100)}%`;
const factorRub = (value) => value == null ? 'Нет данных' : rub(value);
const Status = ({ value }) => <span className={`cabinet-status status-${value}`}>{BANK_STATUSES[value] || value}</span>;

function ErrorNotice({ error }) {
  return error && <div className="cabinet-error" role="alert"><strong>{error.message}</strong>{error.details?.length > 0 && <ul>{error.details.map((item, i) => <li key={i}>{item.message}</li>)}</ul>}</div>;
}

function Assessment({ value, reviewer }) {
  if (!value) return null;
  const history = value.creditHistory;
  return <section className="bank-section" aria-label="Результаты проверок">
    <h4>Проверки и оценка</h4>
    {value.processing && <p className="bank-processing" role="status">{value.processing.message || 'Проверка ещё выполняется.'}{value.processing.retryAt && ` Повтор: ${date(value.processing.retryAt)}`}</p>}
    <div className="bank-checks">
      <article><span>Компания</span><strong>{value.companyCheck ? value.companyCheck.status === 'passed' ? 'Проверка пройдена' : 'Есть замечания' : 'Результат ещё не получен'}</strong>{value.companyCheck?.problems?.map((item, i) => <p key={i}>{item.message}</p>)}</article>
      <article><span>Кредитная история</span><strong>{history ? `Просрочек: ${history.overdueCount}` : 'Результат ещё не получен'}</strong>{history && <p>Долг: {rub(history.existingDebtRub)}<br />Платежи: {rub(history.existingMonthlyPaymentsRub)} / мес.</p>}</article>
      <article><span>Скоринг</span><strong>{value.scoring ? `${value.scoring.score} / 100` : 'Результат ещё не получен'}</strong><p>{value.riskLevel && `Риск: ${riskNames[value.riskLevel] || value.riskLevel}. `}Оценка учитывается при рассмотрении заявки.</p></article>
    </div>
    {value.scoring && <div className="bank-assessment-source"><h5>Рекомендация модели Python</h5><p>{value.scoring.decision ? BANK_STATUSES[value.scoring.decision] || value.scoring.decision : 'Рекомендация не получена'}{value.scoring.approvedAmountRub != null && ` · ${rub(value.scoring.approvedAmountRub)}`}</p><small>Рекомендация модели учитывается при рассмотрении. Действующее предложение клиенту формирует банк.</small>{value.scoring.reasons?.length > 0 && <ul>{value.scoring.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>}{value.scoring.factors && <details className="bank-factor-details"><summary>Факторы скоринга</summary><dl className="bank-facts">{[
      ['Операционный денежный поток', factorRub(value.scoring.factors.operating_cash_flow)],
      ['Операционная маржа', percent(value.scoring.factors.operating_margin)],
      ['Расчётный новый платёж', factorRub(value.scoring.factors.estimated_new_monthly_payment)],
      ['Доля платежей в денежном потоке', percent(value.scoring.factors.debt_service_share)],
      ['Долг к годовой выручке', percent(value.scoring.factors.existing_debt_to_annual_revenue)],
      ['Число просрочек', value.scoring.factors.overdue_count == null ? 'Нет данных' : value.scoring.factors.overdue_count],
    ].map(([label, detail]) => <div key={label}><dt>{label}</dt><dd>{detail}</dd></div>)}</dl></details>}</div>}
    <div className="bank-assessment-source"><h5>Автоматический результат Go</h5>{value.goDecision ? <><p><strong>{BANK_STATUSES[value.goDecision.decision] || value.goDecision.decision}</strong> · {value.goDecision.score} / 100 · Риск: {riskNames[value.goDecision.riskLevel] || value.goDecision.riskLevel}</p><ul>{value.goDecision.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul><small>{date(value.goDecision.assessedAt)}. После ручного рассмотрения здесь сохраняется исходный автоматический результат.</small></> : <p className="cabinet-description">Автоматический результат ещё не получен.</p>}</div>
    {value.manualReviewReasons?.length > 0 && <div className="bank-review-reasons"><strong>Почему требуется сотрудник</strong><ul>{value.manualReviewReasons.map((item, i) => <li key={i}>{item.message}</li>)}</ul></div>}
    {value.recommendations?.map((item, i) => <div className="bank-review-reasons" key={i}><strong>Результат автоматической проверки: {BANK_STATUSES[item.decision] || item.decision}</strong><ul>{item.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>{item.offer && <p>{rub(item.offer.amountRub)} · {item.offer.termMonths} мес.</p>}</div>)}
    {value.manualDecision && <div className="bank-audit"><strong>Решение сотрудника: {BANK_STATUSES[value.manualDecision.decision]}</strong><p><b>Внутренний комментарий:</b> {value.manualDecision.internalComment || value.manualDecision.comment}</p>{value.manualDecision.customerExplanation && <p><b>Пояснение клиенту:</b> {value.manualDecision.customerExplanation}</p>}<small>{date(value.manualDecision.reviewedAt)} · {value.manualDecision.reviewedBy === reviewer?.id ? reviewer.name : `Сотрудник ${value.manualDecision.reviewedBy}`}</small></div>}
  </section>;
}

function ReviewForm({ application, onSave, busy, onDirtyChange }) {
  const [form, setForm] = useState({ decision: 'approved', internalComment: '', customerExplanation: '', amountRub: String(application.requestedAmountRub), termMonths: String(application.termMonths) });
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const change = (field, value) => { setForm((previous) => ({ ...previous, [field]: value })); onDirtyChange(true); setPending(null); setError(null); };
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const review = (event) => {
    event.preventDefault();
    try { setPending(prepareBankDecision(application, form)); setError(null); }
    catch (failure) { setError(failure); }
  };
  return <section className="bank-section bank-manual-review" aria-label="Ручное решение">
    <h4>Результат рассмотрения</h4>
    <p className="cabinet-description">Проверьте сведения и документы. После подтверждения клиент увидит результат в своём кабинете.</p>
    <form onSubmit={review}>
      <fieldset disabled={busy}><legend>Решение</legend><div className="bank-decision-options">{[['approved', 'Одобрить'], ['counter_offer', 'Другие условия'], ['rejected', 'Отказать']].map(([value, label]) => <label key={value}><input type="radio" name="bank-decision" value={value} checked={form.decision === value} onChange={() => change('decision', value)} /><span>{label}</span></label>)}</div></fieldset>
      {form.decision === 'counter_offer' && <div className="cabinet-input-grid"><Input className="cabinet-finance-input" label="Сумма предложения, ₽" type="number" min={application.productTerms?.minAmountRub || 1} max={application.requestedAmountRub} value={form.amountRub} disabled={busy} onChange={(_, data) => change('amountRub', data?.value ?? '')} /><Input className="cabinet-finance-input" label="Срок предложения, мес." type="number" min={application.productTerms?.minTermMonths || 1} max={application.productTerms?.maxTermMonths} value={form.termMonths} disabled={busy} onChange={(_, data) => change('termMonths', data?.value ?? '')} /></div>}
      {form.decision === 'approved' && <p className="bank-original-terms">Исходные условия: <strong>{rub(application.requestedAmountRub)} · {application.termMonths} мес.</strong></p>}
      <label className="cabinet-textarea-label">Внутренний комментарий<textarea value={form.internalComment} maxLength={1000} required disabled={busy} onChange={(event) => change('internalComment', event.target.value)} placeholder="Укажите основания принятого решения" /></label>
      <small className="cabinet-helper">Комментарий сохранится для банка и не попадёт в клиентские пояснения. Ставку и платёж рассчитывает сервис.</small>
      <label className="cabinet-textarea-label">Пояснение клиенту<textarea value={form.customerExplanation} maxLength={1000} disabled={busy} onChange={(event) => change('customerExplanation', event.target.value)} placeholder="Объясните результат понятным языком" /></label>
      <small className="cabinet-helper">Клиент увидит этот текст в решении. Если оставить поле пустым, банк сохранит стандартную формулировку.</small>
      <ErrorNotice error={error} />
      {!pending && <Button view="primary" className="cabinet-primary-button" type="submit" disabled={busy}>Проверить решение</Button>}
      {pending && <div className="bank-confirm" role="group" aria-label="Подтверждение решения"><strong>Подтвердить {({ approved: 'одобрение заявки', counter_offer: 'предложение других условий', rejected: 'отказ по заявке' })[pending.decision]}?</strong>{pending.offer && <p>{rub(pending.offer.amountRub)} · {pending.offer.termMonths} мес.</p>}<p>Пояснение клиенту: {pending.customerExplanation || 'Стандартная формулировка банка.'}</p><p>Результат сохранится в заявке и станет доступен клиенту.</p><div><Button type="button" view="primary" className="cabinet-primary-button" disabled={busy} onClick={() => onSave(pending)}>{busy ? 'Сохраняем…' : 'Подтвердить решение'}</Button><button className="cabinet-text-button" type="button" disabled={busy} onClick={() => setPending(null)}>Вернуться к проверке</button></div></div>}
    </form>
  </section>;
}

export default function BankCabinet({ user, onSignOut }) {
  const [filter, setFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [companies, setCompanies] = useState([]);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState('');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [selection, setSelection] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [busy, setBusy] = useState('list');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const listRequest = useRef(0);
  const selectionRequest = useRef(0);
  const decisionAction = useRef(null);
  const contentRef = useRef(null);
  const mounted = useRef(true);
  const visibleCount = useRef(20);
  visibleCount.current = Math.max(20, items.length);
  const pollAction = useRef(null);
  const reviewDirtyRef = useRef(false);
  reviewDirtyRef.current = reviewDirty;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; listRequest.current++; selectionRequest.current++; }; }, []);

  const loadList = useCallback(async (offset = 0) => {
    const sequence = ++listRequest.current;
    const query = { status: filter || undefined, companyId: companyFilter || undefined };
    const page = offset
      ? await api.listBankApplications({ ...query, limit: 20, offset })
      : await fetchVisibleApplications((pagination) => api.listBankApplications({ ...query, ...pagination }), visibleCount.current);
    if (sequence !== listRequest.current) return;
    setItems((previous) => offset ? [...previous, ...page.items] : page.items);
    setTotal(page.total);
  }, [filter, companyFilter]);

  useEffect(() => {
    let active = true;
    const discover = async () => {
      const found = new Map();
      let offset = 0;
      while (active) {
        const page = await api.listBankApplications({ limit: 100, offset });
        if (!active) return;
        page.items.forEach((item) => { if (!found.has(item.company.id)) found.set(item.company.id, item.company); });
        setCompanies([...found.values()]);
        offset += page.items.length;
        if (!page.items.length || offset >= page.total) break;
      }
    };
    discover().catch((failure) => { if (active && failure.status !== 401) setRefreshNotice('Не удалось загрузить список компаний. Обновите страницу для повторной загрузки.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setBusy('list'); setError(null);
    loadList().catch((failure) => { if (active) setError(failure); })
      .finally(() => { if (active) setBusy(''); });
    return () => { active = false; listRequest.current++; };
  }, [loadList]);

  const readSelection = async (id, { background = false } = {}) => {
    const sequence = ++selectionRequest.current;
    const [application, checks, uploaded] = await Promise.all([
      api.getBankApplication(id), api.getBankAssessment(id), api.listDocuments(id),
    ]);
    if (sequence !== selectionRequest.current || (background && reviewDirtyRef.current)) return;
    // The two read requests can straddle a pipeline update. Use the later status;
    // never present an action based on a stale manual_review snapshot.
    const latest = checks.version > application.version
      ? { ...application, status: checks.status, version: checks.version, availableActions: checks.status === 'manual_review' ? ['decide'] : [] }
      : application;
    setSelection(latest); setAssessment(checks); setDocuments(uploaded.items || []);
  };

  const open = async (id) => {
    setBusy('detail'); setError(null); setNotice('');
    try { await readSelection(id); }
    catch (failure) { if (mounted.current) setError(failure); }
    finally { if (mounted.current) setBusy(''); }
  };

  const refresh = async (more = false) => {
    if (reviewDirty && !more && !window.confirm('Обновить карточку? Несохранённый текст решения может измениться при обновлении заявки.')) return;
    setBusy('list'); setError(null);
    try { if (selection) await readSelection(selection.applicationId); await loadList(more ? items.length : 0); }
    catch (failure) { if (mounted.current) setError(failure); }
    finally { if (mounted.current) setBusy(''); }
  };

  const saveDecision = async (payload) => {
    const id = selection.applicationId;
    const signature = JSON.stringify([id, payload]);
    if (decisionAction.current?.signature !== signature) decisionAction.current = { signature, key: window.crypto.randomUUID() };
    setBusy('decision'); setError(null); setNotice('');
    try {
      await api.makeBankDecision(id, payload, decisionAction.current.key);
      if (!mounted.current) return;
      // Disable the action immediately, even if the follow-up read is unavailable.
      setSelection((previous) => ({ ...previous, status: payload.decision, availableActions: [] }));
      setAssessment((previous) => previous ? { ...previous, manualReviewReasons: [] } : null);
      setNotice('Решение сохранено. Клиент увидит результат в своём кабинете.');
      setReviewDirty(false);
      try { await readSelection(id); await loadList(); }
      catch { if (mounted.current) setNotice('Решение сохранено. Обновите карточку, чтобы увидеть актуальные данные.'); }
    } catch (failure) {
      if (!mounted.current) return;
      setError(failure);
      if (failure.status === 409) {
        try { await readSelection(id); await loadList(); }
        catch { /* Keep the original conflict and allow an explicit refresh. */ }
      }
    } finally { if (mounted.current) setBusy(''); }
  };

  const download = async (document) => {
    setBusy('download'); setError(null);
    try {
      const blob = await api.downloadDocument(selection.applicationId, document.documentId);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url; link.download = document.fileName; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (failure) { if (mounted.current) setError(failure); }
    finally { if (mounted.current) setBusy(''); }
  };

  const showList = (status = filter) => {
    if (reviewDirty && !window.confirm('Решение ещё не сохранено. Вернуться к списку?')) return;
    selectionRequest.current++;
    setSelection(null); setAssessment(null); setDocuments([]); setFilter(status); setError(null); setNotice('');
    setReviewDirty(false);
  };
  pollAction.current = async () => {
    if (busy || reviewDirty || document.hidden) return;
    if (selection) await readSelection(selection.applicationId, { background: true });
    await loadList();
  };
  useEffect(() => {
    let active = true;
    let pending = false;
    const timer = window.setInterval(async () => {
      if (pending) return;
      pending = true;
      try { await pollAction.current?.(); if (active) setRefreshNotice(''); }
      catch (failure) { if (active && failure.status !== 401) setRefreshNotice('Не удалось обновить данные автоматически. Повторим попытку.'); }
      finally { pending = false; }
    }, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!reviewDirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [reviewDirty]);
  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, [selection?.applicationId, filter, companyFilter]);

  return <div className="credit-cabinet credit-cabinet-dashboard bank-cabinet">
    <aside className="cabinet-sidebar" aria-label="Сотрудник и разделы">
      <div className="cabinet-account"><div><span className="cabinet-account-kicker">СОТРУДНИК БАНКА</span><h3>{user.name}</h3><p>{user.phone}</p></div></div>
      <nav className="cabinet-tabs" aria-label="Банковские заявки"><button type="button" className={!filter ? 'active' : ''} disabled={Boolean(busy)} onClick={() => showList('')}>Все заявки</button><button type="button" className={filter === 'manual_review' ? 'active' : ''} disabled={Boolean(busy)} onClick={() => showList('manual_review')}>Ручное рассмотрение</button></nav>
      <p className="bank-scope-note">Здесь видны отправленные заявки компаний. Черновики остаются у клиентов.</p>
      <button className="cabinet-signout" type="button" disabled={Boolean(busy)} onClick={() => { if (!reviewDirty || window.confirm('Решение ещё не сохранено. Выйти из кабинета?')) onSignOut(); }}>Выйти из кабинета</button>
    </aside>
    <section className="cabinet-main-panel" aria-label="Рабочий кабинет банка">
      <header className="cabinet-panel-header"><h2>{selection ? `Заявка № ${idLabel(selection.applicationId)}` : filter === 'manual_review' ? 'Ручное рассмотрение' : 'Заявки компаний'}</h2><p>{selection ? selection.company?.name : 'Проверяйте данные, изучайте документы и рассматривайте переданные банку заявки.'}</p><span className="cabinet-panel-count">{selection ? BANK_STATUSES[selection.status] : `Заявок: ${total}`}</span></header>
      <div className="cabinet-panel-content" ref={contentRef} aria-busy={Boolean(busy)}>
        <div className="bank-toolbar">{selection ? <button className="cabinet-text-button" type="button" disabled={Boolean(busy)} onClick={() => showList()}>← К списку заявок</button> : <div className="bank-filters"><label>Статус<select aria-label="Фильтр по статусу" value={filter} disabled={Boolean(busy)} onChange={(event) => showList(event.target.value)}><option value="">Все статусы</option>{Object.entries(BANK_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Компания<select aria-label="Фильтр по компании" value={companyFilter} disabled={Boolean(busy)} onChange={(event) => setCompanyFilter(event.target.value)}><option value="">Все компании</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label></div>}<Button view="secondary" type="button" disabled={Boolean(busy)} onClick={() => refresh()}>{busy ? 'Загрузка…' : 'Обновить'}</Button></div>
        <p className="cabinet-helper" role="status">{refreshNotice || (reviewDirty ? 'Автообновление карточки приостановлено, пока вы заполняете решение.' : 'Данные обновляются автоматически каждые 10 секунд.')}</p>
        <ErrorNotice error={error} />{notice && <p className="cabinet-notice" role="status">{notice}</p>}
        {busy === 'detail' && <p role="status" className="bank-loading">Загружаем анкету, проверки и документы…</p>}
        {!selection && <div className="bank-application-list">{items.map((item) => <button key={item.applicationId} type="button" className="bank-application-row" disabled={Boolean(busy)} onClick={() => open(item.applicationId)}><div><strong>{item.company.name}</strong><span>ИНН {item.company.inn} · № {idLabel(item.applicationId)}</span><small>{item.product.name} · {date(item.submittedAt)}</small></div><div><strong>{rub(item.requestedAmountRub)}</strong><small>{item.termMonths} мес.</small><Status value={item.status} /></div></button>)}{!busy && items.length === 0 && <div className="cabinet-empty"><h4>Заявок пока нет</h4><p>{filter ? 'В выбранном статусе нет заявок. Измените фильтр или обновите список.' : 'Отправленные клиентами заявки появятся здесь.'}</p></div>}{items.length < total && <Button view="secondary" type="button" disabled={Boolean(busy)} onClick={() => refresh(true)}>Показать ещё</Button>}</div>}
        {selection && <>
          <section className="bank-section"><div className="bank-section-heading"><h4>Анкета компании</h4><Status value={selection.status} /></div><dl className="bank-facts">{[
            ['Компания', selection.company?.name], ['ИНН', selection.company?.inn], ['Руководитель', selection.company?.directorName], ['Продукт', selection.product?.name], ['Цель', goal[selection.purpose]], ['Сумма', rub(selection.requestedAmountRub)], ['Срок', `${selection.termMonths} мес.`], ['Выручка в месяц', rub(selection.monthlyRevenueRub)], ['Расходы в месяц', rub(selection.monthlyExpensesRub)], ['Подана', date(selection.submittedAt)],
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>{selection.purposeDescription && <p className="cabinet-description">{selection.purposeDescription}</p>}</section>
          <Assessment value={assessment} reviewer={user} />
          <section className="bank-section"><h4>Документы</h4>{documents.length ? documents.map((document) => <div key={document.documentId} className="bank-document"><div><strong>{documentNames[document.documentType] || document.documentType}</strong><span>{document.fileName}</span></div><Button view="secondary" type="button" disabled={Boolean(busy)} onClick={() => download(document)}>Скачать</Button></div>) : <p className="cabinet-description">К заявке не приложены документы.</p>}</section>
          {canReview(selection) && <ReviewForm key={`${selection.applicationId}:${selection.version}`} application={selection} busy={Boolean(busy)} onSave={saveDecision} onDirtyChange={setReviewDirty} />}
        </>}
      </div>
    </section>
  </div>;
}
