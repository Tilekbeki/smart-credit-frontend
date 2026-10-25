const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/;
function email(value) {
  const normalized = String(value).trim();
  if (new TextEncoder().encode(normalized).length > 254 || !/^[^\s<>@]+@[^\s<>@]+$/.test(normalized) || controlCharacters.test(normalized)) {
    throw new Error('Проверьте email: укажите адрес без имени и пробелов.');
  }
  return normalized;
}

export function userContactPatch(user, value) {
  return { version: user.version, additionalEmail: value.trim() ? email(value) : null };
}

export function companyContactPatch(company, values) {
  const contact = {};
  for (const field of ['phone', 'email', 'address']) {
    const value = String(values[field] ?? '').trim();
    if (value === company.contact[field]) continue;
    if (!value || controlCharacters.test(value)) throw new Error('Заполните изменённые контакты. Пустые значения и переносы строк не допускаются.');
    if (field === 'phone' && !/^\+[1-9][0-9]{7,14}$/.test(value)) throw new Error('Контактный телефон: знак + и от 8 до 15 цифр.');
    if (field === 'email') contact[field] = email(value);
    else if (field === 'address' && [...value].length > 300) throw new Error('Адрес должен содержать не больше 300 символов.');
    else contact[field] = value;
  }
  if (!Object.keys(contact).length) throw new Error('Контактные данные не изменились.');
  return { version: company.version, contact };
}
