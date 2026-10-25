import React, { useEffect, useState } from 'react';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';
import * as api from './api';
import { userContactPatch, companyContactPatch } from './contacts';
import { formatRub } from './utils/format';

const contactValues = (company) => ({ phone: company.contact.phone, email: company.contact.email, address: company.contact.address });

export default function ContactSettings({ user, company, onUserChange, onCompanyChange, onDirtyChange, onBusyChange, onUseFinancials }) {
  const [email, setEmail] = useState(user.additionalEmail || '');
  const [contact, setContact] = useState(() => contactValues(company));
  const [baseUser, setBaseUser] = useState(user);
  const [baseCompany, setBaseCompany] = useState(company);
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const userDirty = email.trim() !== (baseUser.additionalEmail || '');
  const companyDirty = Object.keys(contact).some((field) => contact[field].trim() !== baseCompany.contact[field]);
  useEffect(() => { onDirtyChange(userDirty || companyDirty); }, [userDirty, companyDirty, onDirtyChange]);
  const save = async (kind, latest) => {
    setError(''); setNotice('');
    setBusy(kind); onBusyChange(true);
    try {
      if (kind === 'user') {
        const saved = await api.updateMe(userContactPatch(latest || baseUser, email));
        setBaseUser(saved); setEmail(saved.additionalEmail || ''); onUserChange(saved);
      } else {
        const saved = await api.updateCompanyContacts(company.id, companyContactPatch(latest || baseCompany, contact));
        setBaseCompany(saved); setContact(contactValues(saved)); onCompanyChange(saved);
      }
      setConflict((previous) => previous?.kind === kind ? null : previous); setNotice('Контактные данные сохранены.');
    } catch (failure) {
      if (failure.code === 'version_conflict') {
        try {
          const current = kind === 'user' ? await api.getMe() : await api.getCompany(company.id);
          setConflict({ kind, latest: current });
          setError('Контакты изменились в другом окне. Сравните актуальные данные с вашим вводом.');
        } catch { setError('Контакты изменились, но загрузить актуальную версию не удалось. Ваш ввод сохранён на странице. Повторите попытку.'); }
      } else setError(failure.message);
    } finally { setBusy(''); onBusyChange(false); }
  };
  const loadCurrent = () => {
    if (conflict.kind === 'user') { setBaseUser(conflict.latest); setEmail(conflict.latest.additionalEmail || ''); onUserChange(conflict.latest); }
    else { setBaseCompany(conflict.latest); setContact(contactValues(conflict.latest)); onCompanyChange(conflict.latest); }
    setConflict(null); setError('');
  };
  return <div className="cabinet-contact-settings">
    {error && <div className="cabinet-error" role="alert">{error}</div>}
    {notice && <p className="cabinet-notice" role="status">{notice}</p>}
    {conflict && <div className="cabinet-conflict"><strong>Актуальные данные</strong><p>{conflict.kind === 'user' ? conflict.latest.additionalEmail || 'Дополнительный email не указан' : Object.values(conflict.latest.contact).join(' · ')}</p><div><Button view="secondary" disabled={Boolean(busy)} onClick={loadCurrent}>Загрузить актуальные</Button><Button view="secondary" disabled={Boolean(busy)} onClick={() => save(conflict.kind, conflict.latest)}>Сохранить мой вариант</Button></div></div>}
    <section className="cabinet-contact-section"><h4>Ваши контакты</h4><p className="cabinet-description">{user.name} · Номер входа {user.phone}. Дополнительный email можно изменить или удалить.</p><form onSubmit={(event) => { event.preventDefault(); save('user'); }}><Input className="cabinet-finance-input" label="Дополнительный email" type="email" value={email} maxLength={254} disabled={Boolean(busy)} onChange={(_, data) => setEmail(data?.value ?? '')} /><Button className="cabinet-primary-button" view="primary" type="submit" disabled={Boolean(busy) || !userDirty || conflict?.kind === 'user'}>{busy === 'user' ? 'Сохраняем…' : 'Сохранить email'}</Button></form></section>
    <section className="cabinet-contact-section"><h4>Контакты компании</h4><p className="cabinet-description">{company.name} · ИНН {company.inn}. Контактный телефон компании не меняет номер входа по SMS.</p><form onSubmit={(event) => { event.preventDefault(); save('company'); }}>{[['phone', 'Контактный телефон', 'tel'], ['email', 'Email компании', 'email'], ['address', 'Адрес для связи', 'text']].map(([field, label, type]) => <Input className="cabinet-finance-input" key={field} label={label} type={type} value={contact[field]} maxLength={field === 'address' ? 300 : field === 'email' ? 254 : 16} disabled={Boolean(busy)} onChange={(_, data) => setContact((previous) => ({ ...previous, [field]: data?.value ?? '' }))} />)}<Button className="cabinet-primary-button" view="primary" type="submit" disabled={Boolean(busy) || !companyDirty || conflict?.kind === 'company'}>{busy === 'company' ? 'Сохраняем…' : 'Сохранить контакты'}</Button></form></section>
    <section className="cabinet-contact-section"><h4>Данные для новой заявки</h4><p className="cabinet-description">В профиле компании есть выручка и расходы. Их можно подставить в новую заявку и проверить перед сохранением.</p><dl className="bank-facts"><div><dt>Выручка в месяц</dt><dd>{formatRub(company.financials.monthlyRevenueRub)}</dd></div><div><dt>Расходы в месяц</dt><dd>{formatRub(company.financials.monthlyExpensesRub)}</dd></div></dl><Button view="secondary" disabled={Boolean(busy)} onClick={onUseFinancials}>Создать заявку с этими данными</Button></section>
  </div>;
}
