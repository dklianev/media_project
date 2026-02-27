import { getPublicSettings } from './settings';

const DEFAULTS = {
  free: 'Безплатно',
  trailer: 'Трейлър',
  subscription: 'Абонамент',
};

const SETTING_MAP = {
  free: 'access_label_free',
  trailer: 'access_label_trailer',
  subscription: 'access_label_subscription',
};

let _cached = null;

export async function getAccessLabels() {
  const s = await getPublicSettings();
  _cached = {
    free: s.access_label_free || DEFAULTS.free,
    trailer: s.access_label_trailer || DEFAULTS.trailer,
    subscription: s.access_label_subscription || DEFAULTS.subscription,
  };
  return _cached;
}

export function getAccessLabelSync(group) {
  if (_cached && _cached[group]) return _cached[group];
  return DEFAULTS[group] || group;
}

export function getAccessLabelsSync() {
  return _cached || { ...DEFAULTS };
}

export function getAccessOptionsSync(includeInherit = false) {
  const labels = _cached || DEFAULTS;
  const options = [];
  if (includeInherit) {
    options.push({ value: 'inherit', label: 'Наследи от продукция' });
  }
  options.push(
    { value: 'free', label: labels.free },
    { value: 'trailer', label: labels.trailer },
    { value: 'subscription', label: labels.subscription },
  );
  return options;
}
