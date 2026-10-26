import './styles.css';
export function ErrorNotice({ error, details }) {
  if (!error) return null;
  return <div className="cabinet-error" role="alert"><strong>{error}</strong>{details?.length > 0 && <ul>{details.map((item, index) => <li key={`${item.field}-${index}`}>{item.message}</li>)}</ul>}</div>;
}

export function LoadingCard({ title, detail }) {
  return <div className="cabinet-loading" role="status" aria-live="polite"><span className="cabinet-spinner" aria-hidden="true" /><strong>{title}</strong><p>{detail}</p></div>;
}

