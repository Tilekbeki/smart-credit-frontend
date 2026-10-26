import './styles.css';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';
import { accountPath } from '../../../company/services/account-preference.js';
import { ErrorNotice, LoadingCard } from '../../../../shared/ui/Feedback/index.jsx';

export function CabinetSignIn({ authStage, phone, code, profiles, profilesLoading, profilesError,
  otpRequest, chosenProfile, busy, error, details, notice, onBack, onChangeNumber,
  onPhoneChange, onCodeChange, submitPhone, verifyCode, requestCode, retryProfiles }) {
  return <div className="credit-cabinet credit-cabinet-auth">
    <div className="cabinet-eyebrow"><span>КРЕДИТНЫЙ КАБИНЕТ</span><span>ВХОД</span></div>
    <button className="cabinet-text-button cabinet-back-to-chat" type="button" onClick={onBack} disabled={Boolean(busy)}>Вернуться в чат</button>
    {authStage === 'phone' ? <>
      <h3>Войдите в кабинет</h3>
      <p className="cabinet-lede">Войдите по номеру телефона. Клиенту откроются его заявки, сотруднику — рабочий кабинет банка.</p>
      <form className="cabinet-phone-form" onSubmit={submitPhone}>
        <Input className="cabinet-auth-input" label="Номер телефона" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 999 000-00-00" value={phone} onChange={(_, data) => onPhoneChange(data?.value ?? '')} />
        <Button className="cabinet-primary-button" view="primary" type="submit" disabled={Boolean(busy) || profilesLoading || profiles.length === 0}>{busy === 'otp-request' ? 'Запрашиваем код…' : 'Получить код'}</Button>
      </form>
      {profiles.length > 0 && <details className="cabinet-demo-access"><summary>Доступные профили для входа</summary><p>Выберите профиль, затем подтвердите вход кодом из SMS.</p><div className="cabinet-demo-list">{profiles.filter((profile) => ['CLIENT', 'BANK_EMPLOYEE'].includes(profile.role)).map((profile) => <div className="cabinet-demo-row" key={profile.id}><div><strong>{profile.role === 'BANK_EMPLOYEE' ? `${profile.name} · Сотрудник банка` : profile.companyName}</strong><small>{profile.phone}{accountPath(profile.bankRelationship) === 'external_account' ? ' · Без счёта в Альфе' : ''}</small></div><Button view="secondary" onClick={() => requestCode(profile)} disabled={Boolean(busy) || profilesLoading}>Получить код</Button></div>)}</div></details>}
      {profilesLoading && <LoadingCard title="Загружаем компании" detail="Подключаемся к сервису." />}
      {profiles.length === 0 && !profilesLoading && !busy && <Button view="secondary" onClick={retryProfiles}>Повторить загрузку</Button>}
      <ErrorNotice error={profilesError} />
      <ErrorNotice error={error} details={details} />
      <p className="cabinet-fineprint">Вход для пользователей, зарегистрированных сотрудником банка. Используйте номер телефона, указанный при регистрации</p>
    </> : <>
      <h3>Подтвердите вход</h3>
      <p className="cabinet-lede">Введите код из SMS для <strong>{otpRequest?.maskedPhone}</strong>. {chosenProfile?.role === 'BANK_EMPLOYEE' ? 'После входа откроется рабочий кабинет сотрудника банка.' : `После входа откроется кабинет ${chosenProfile?.companyName}.`}</p>
      <form onSubmit={verifyCode} className="cabinet-code-form">
        <Input className="cabinet-auth-input" label="Код из SMS" type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={code} onChange={(_, data) => onCodeChange((data?.value ?? '').replace(/\D/g, '').slice(0, 4))} />
        <ErrorNotice error={error} details={details} />
        <Button className="cabinet-primary-button" view="primary" type="submit" disabled={Boolean(busy)}>{busy === 'otp-verify' ? 'Проверяем код…' : 'Войти в кабинет'}</Button>
      </form>
      {notice && <p className="cabinet-notice" role="status">{notice}</p>}
      <div className="cabinet-code-actions"><button className="cabinet-text-button" type="button" onClick={() => requestCode(chosenProfile, { resend: true })} disabled={Boolean(busy)}>Запросить новый код</button><button className="cabinet-text-button" type="button" onClick={onChangeNumber} disabled={Boolean(busy)}>Изменить номер</button></div>
      <p className="cabinet-fineprint">Автоматическая отправка SMS пока не подключена. Используйте код тестового окружения; он действует 5 минут.</p>
    </>}
  </div>;

}
