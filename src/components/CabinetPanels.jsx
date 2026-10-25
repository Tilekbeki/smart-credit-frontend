import { Button } from '@alfalab/core-components/button';
import { DOCUMENT_NAMES } from '../config/credit';
import { formatRub, formatDate } from '../utils/format';

export function ErrorNotice({ error, details }) {
  if (!error) return null;
  return <div className="cabinet-error" role="alert"><strong>{error}</strong>{details?.length > 0 && <ul>{details.map((item, index) => <li key={`${item.field}-${index}`}>{item.message}</li>)}</ul>}</div>;
}

export function LoadingCard({ title, detail }) {
  return <div className="cabinet-loading" role="status" aria-live="polite"><span className="cabinet-spinner" aria-hidden="true" /><strong>{title}</strong><p>{detail}</p></div>;
}

export function DecisionPanel({ decision, bankRelationship, choice, onChoose, onConfirm, busy }) {
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
      {(decision.customerExplanation || reasons.length > 0) && <div className="cabinet-decision-reasons"><strong>Почему принято такое решение</strong>{decision.customerExplanation && <p>{decision.customerExplanation}</p>}{reasons.filter((reason) => reason !== decision.customerExplanation).length > 0 && <ul>{reasons.filter((reason) => reason !== decision.customerExplanation).map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul>}</div>}
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

export function JourneyProgress({ stage }) {
  return <section className="cabinet-journey" aria-label="Этапы заявки">
    <div className="cabinet-journey-heading"><span>ТЕКУЩИЙ ЭТАП</span><strong>{stage.title}</strong></div>
    <ol>{stage.steps.map((step, index) => <li key={step.id} className={`is-${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}><span aria-hidden="true">{step.state === 'done' ? '✓' : index + 1}</span><small>{step.label}</small></li>)}</ol>
    <p>{stage.description}</p>
  </section>;
}

export function SubmitChecklist({ checklist }) {
  const done = checklist.items.filter((item) => item.state === 'done').length;
  const conditional = checklist.items.filter((item) => item.state === 'conditional').length;
  return <section className="cabinet-checklist" aria-label="Проверка перед отправкой">
    <div className="cabinet-section-head"><div><span>ПЕРЕД ОТПРАВКОЙ</span><h4>Что уже готово</h4></div><small>{done} готово{conditional > 0 ? ` · ${conditional} по запросу` : ''}</small></div>
    <ul>{checklist.items.map((item) => <li key={item.id} className={`is-${item.state}`}><span className="cabinet-check-icon" aria-hidden="true">{item.state === 'done' ? '✓' : item.state === 'conditional' ? '?' : '•'}</span><div><strong>{item.label}</strong>{item.message && <small>{item.message}</small>}</div></li>)}</ul>
    <p>Это предварительная проверка. Окончательные требования к продукту и документам проверит сервис при отправке.</p>
  </section>;
}


export function DocumentList({ documents, download, busy, bankRelationship }) {
  if (documents.length === 0) return <p className="cabinet-helper">Документов пока нет.</p>;
  return <ul className="cabinet-document-list">{documents.map((document) => <li key={document.documentId}><span className="cabinet-document-icon" aria-hidden="true">↧</span><span><strong>{document.fileName}</strong><small>{document.documentType === 'BANK_STATEMENT' && bankRelationship === 'external_account' ? 'Выписка из другого банка' : DOCUMENT_NAMES[document.documentType] || document.documentType} · {formatDate(document.uploadedAt)}</small></span><button type="button" onClick={() => download(document)} disabled={Boolean(busy)} aria-label={`Скачать ${document.fileName}`}>{busy === `download-${document.documentId}` ? '...' : 'Скачать'}</button></li>)}</ul>;
}
