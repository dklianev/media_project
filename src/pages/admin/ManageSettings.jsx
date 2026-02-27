import { useState, useEffect, useRef } from 'react';
import { Save, Upload } from 'lucide-react';
import { api } from '../../utils/api';
import { useToastContext } from '../../context/ToastContext';

const LANDING_FIELDS = [
  { key: 'landing_badge_text', label: 'Лента над заглавието' },
  { key: 'landing_title', label: 'Заглавие' },
  { key: 'landing_subtitle', label: 'Подзаглавие' },
  { key: 'landing_description', label: 'Описание' },
  { key: 'landing_disclaimer', label: 'Бележка под бутона' },
  { key: 'landing_button_text', label: 'Текст на бутона за вход' },
  { key: 'landing_feature_1', label: 'Полза 1' },
  { key: 'landing_feature_2', label: 'Полза 2' },
  { key: 'landing_feature_3', label: 'Полза 3' },
  { key: 'landing_reason_title', label: 'Заглавие на дясната секция' },
  { key: 'login_marquee_text', label: 'Маркизен (движещ се) текст' },
  { key: 'login_floating_badge', label: 'Плаващ бадж (Нови епизоди...)' },
  { key: 'login_bottom_text', label: 'Долен текст (Кино изживяване...)' },
];

const HOME_FIELDS = [
  { key: 'hero_title', label: 'Hero заглавие' },
  { key: 'hero_subtitle', label: 'Hero подзаглавие' },
  { key: 'home_hero_pill_1', label: 'Hero бадж 1 (напр. НОВО)' },
  { key: 'home_hero_pill_2', label: 'Hero бадж 2 (напр. ВСЯКА СЕДМИЦА)' },
  { key: 'home_hero_button_1', label: 'Hero бутон 1 (Гледай сега)' },
  { key: 'home_hero_button_2', label: 'Hero бутон 2 (Виж плановете)' },
  { key: 'home_latest_title', label: 'Заглавие: Най-нови епизоди' },
  { key: 'home_free_title', label: 'Заглавие: Безплатна секция' },
  { key: 'home_premium_title', label: 'Заглавие: Премиум секция' },
  { key: 'home_empty_title', label: 'Текст при липса на продукции (Заглавие)' },
  { key: 'home_empty_subtitle', label: 'Текст при липса на продукции (Описание)' },
  { key: 'home_metric_productions', label: 'Име на метриката "Продукции"' },
];

const SUBSCRIBE_FIELDS = [
  { key: 'subscribe_title', label: 'Заглавие на абонаменти' },
  { key: 'subscribe_subtitle', label: 'Подзаглавие на абонаменти' },
];

const NAV_FIELDS = [
  { key: 'nav_label_home', label: 'Начало' },
  { key: 'nav_label_catalog', label: 'Каталог' },
  { key: 'nav_label_subscribe', label: 'Абонаменти' },
  { key: 'nav_label_profile', label: 'Профил' },
  { key: 'nav_label_admin_zone', label: 'Административна зона' },
];

const ACCESS_LABEL_FIELDS = [
  { key: 'access_label_free', label: 'Безплатно' },
  { key: 'access_label_trailer', label: 'Трейлър' },
  { key: 'access_label_subscription', label: 'Абонамент' },
];

const CATALOG_FIELDS = [
  { key: 'catalog_badge_text', label: 'Бадж текст' },
  { key: 'catalog_title', label: 'Заглавие' },
  { key: 'catalog_description', label: 'Описание' },
  { key: 'catalog_search_placeholder', label: 'Placeholder за търсене' },
  { key: 'catalog_empty_title', label: 'Текст при 0 резултата' },
  { key: 'catalog_empty_watchlist', label: 'Текст при празен watchlist' },
];

const PROFILE_FIELDS = [
  { key: 'profile_badge_text', label: 'Бадж текст' },
  { key: 'profile_title', label: 'Заглавие' },
  { key: 'profile_description', label: 'Описание' },
  { key: 'profile_active_plan_label', label: 'Етикет: Активен план' },
  { key: 'profile_manage_label', label: 'Етикет: Управление' },
  { key: 'profile_valid_until_label', label: 'Етикет: Валиден до' },
  { key: 'profile_member_since_label', label: 'Етикет: Член от' },
  { key: 'profile_status_title', label: 'Заглавие: Статус' },
  { key: 'profile_status_description', label: 'Описание на статуса' },
  { key: 'profile_upgrade_button', label: 'Бутон за надграждане' },
];

const SUBSCRIBE_EXTRA_FIELDS = [
  { key: 'subscribe_badge_text', label: 'Бадж текст' },
  { key: 'subscribe_step_plan', label: 'Стъпка: Избери план' },
  { key: 'subscribe_step_promo', label: 'Стъпка: Промо код' },
  { key: 'subscribe_step_payment', label: 'Стъпка: Плащане' },
  { key: 'subscribe_popular_label', label: 'Етикет: Популярен' },
  { key: 'subscribe_tier_prefix', label: 'Префикс за ниво' },
  { key: 'subscribe_promo_placeholder', label: 'Placeholder за промо код' },
  { key: 'subscribe_my_requests_title', label: 'Заглавие: Моите заявки' },
];

const HOME_EXTRA_FIELDS = [
  { key: 'home_continue_watching_title', label: 'Заглавие: Продължи гледането' },
  { key: 'home_trailer_title', label: 'Заглавие: Трейлъри' },
  { key: 'home_empty_free', label: 'Текст при 0 безплатни' },
];

const CHARACTER_NAME_FIELDS = [
  { key: 'character_name_title', label: 'Заглавие' },
  { key: 'character_name_subtitle', label: 'Подзаглавие' },
];

const FOOTER_FIELDS = [
  { key: 'footer_made_with', label: 'Направено с [сърце] ... (напр. "за общността")' },
  { key: 'footer_premium_experience', label: 'Английски текст вдясно отдолу (Premium...)' },
];

const STREAM_FIELDS = [
  { key: 'stream_channel', label: 'Име на канал (напр. username)' },
  { key: 'stream_offline_message', label: 'Съобщение при офлайн' },
];

export default function ManageSettings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToastContext();
  const heroImageRef = useRef();
  const logoRef = useRef();
  const faviconRef = useRef();

  const fetchSettings = () => {
    api.get('/settings')
      .then((data) => {
        setSettings(data);
        setError('');
      })
      .catch((err) => {
        setError(err.message || 'Неуспешно зареждане на настройките');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings', settings);
      showToast('Настройките са запазени');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleHeroUpload = async () => {
    const file = heroImageRef.current?.files[0];
    if (!file) return;

    const fd = new FormData();
    fd.append('image', file);

    try {
      const result = await api.upload('/settings/hero-image', fd);
      setSettings((prev) => ({ ...prev, hero_image: result.url }));
      showToast('Hero изображението е качено');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleImageUpload = async (ref, endpoint, settingKey, label) => {
    const file = ref.current?.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    try {
      const result = await api.upload(endpoint, fd);
      setSettings((prev) => ({ ...prev, [settingKey]: result.url }));
      showToast(`${label} е качено`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const updateField = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return <div className="space-y-4">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Настройки</h1>
      {error && (
        <p className="mb-4 rounded-xl border border-[var(--danger)]/45 bg-[var(--danger)]/10 p-3 text-sm text-[#ffc9c9]">
          {error}
        </p>
      )}

      <div className="space-y-6">
        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Основни</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Име на платформата</label>
              <input
                value={settings.site_name || ''}
                onChange={(e) => updateField('site_name', e.target.value)}
                className="input-dark"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Подзаглавие в навигацията</label>
              <input
                value={settings.site_tagline || ''}
                onChange={(e) => updateField('site_tagline', e.target.value)}
                className="input-dark"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Текст на лайв индикатора</label>
              <input
                value={settings.live_badge_text || ''}
                onChange={(e) => updateField('live_badge_text', e.target.value)}
                className="input-dark"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Текст във футър</label>
              <input
                value={settings.footer_note || ''}
                onChange={(e) => updateField('footer_note', e.target.value)}
                className="input-dark"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Лого (навигация)</label>
              {settings.site_logo && (
                <img src={settings.site_logo} alt="Текущо лого" loading="lazy" decoding="async" className="w-16 h-16 object-cover rounded-lg mb-2" />
              )}
              <div className="flex gap-2">
                <input type="file" ref={logoRef} accept="image/*" className="input-dark text-sm flex-1" />
                <button onClick={() => handleImageUpload(logoRef, '/settings/site-logo', 'site_logo', 'Логото')} className="btn-outline flex items-center gap-2">
                  <Upload className="w-4 h-4" aria-hidden="true" /> Качи
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Favicon</label>
              {settings.site_favicon && (
                <img src={settings.site_favicon} alt="Текущ favicon" loading="lazy" decoding="async" className="w-8 h-8 object-cover rounded mb-2" />
              )}
              <div className="flex gap-2">
                <input type="file" ref={faviconRef} accept="image/*" className="input-dark text-sm flex-1" />
                <button onClick={() => handleImageUpload(faviconRef, '/settings/site-favicon', 'site_favicon', 'Favicon')} className="btn-outline flex items-center gap-2">
                  <Upload className="w-4 h-4" aria-hidden="true" /> Качи
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Режим поддръжка</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.maintenance_mode === 'true'}
                  onChange={(e) => updateField('maintenance_mode', e.target.checked ? 'true' : 'false')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border)] peer-checked:bg-[var(--accent-gold)]/30 peer-checked:border-[var(--accent-gold)]/50 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5" />
              </label>
              <span className="text-sm font-medium">
                {settings.maintenance_mode === 'true' ? 'Включен' : 'Изключен'}
              </span>
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Съобщение при поддръжка</label>
              <textarea
                value={settings.maintenance_message || ''}
                onChange={(e) => updateField('maintenance_message', e.target.value)}
                className="input-dark"
                rows={2}
              />
            </div>
            {settings.maintenance_mode === 'true' && (
              <p className="text-xs text-[var(--warning)] rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 p-2">
                Внимание: Всички потребители (без админи) ще виждат страница за поддръжка.
              </p>
            )}
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Стрийминг на живо (Live)</h2>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.stream_is_live === 'true'}
                    onChange={(e) => updateField('stream_is_live', e.target.checked ? 'true' : 'false')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border)] peer-checked:bg-[var(--danger)]/50 peer-checked:border-[var(--danger)]/80 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5" />
                </label>
                <span className="text-sm font-medium">
                  {settings.stream_is_live === 'true' ? 'В момента сме НА ЖИВО' : 'Офлайн сме'}
                </span>
              </div>
            </div>

            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Платформа</label>
              <select
                value={settings.stream_platform || 'twitch'}
                onChange={(e) => updateField('stream_platform', e.target.value)}
                className="input-dark"
              >
                <option value="twitch">Twitch</option>
                <option value="kick">Kick</option>
              </select>
            </div>

            {STREAM_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-sm text-[var(--text-muted)] block mb-1">{field.label}</label>
                <input
                  value={settings[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="input-dark"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Известие (банер)</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.announcement_enabled === 'true'}
                  onChange={(e) => updateField('announcement_enabled', e.target.checked ? 'true' : 'false')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border)] peer-checked:bg-[var(--accent-gold)]/30 peer-checked:border-[var(--accent-gold)]/50 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5" />
              </label>
              <span className="text-sm font-medium">
                {settings.announcement_enabled === 'true' ? 'Включен' : 'Изключен'}
              </span>
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Текст на известието</label>
              <input
                value={settings.announcement_text || ''}
                onChange={(e) => updateField('announcement_text', e.target.value)}
                className="input-dark"
                placeholder="Напр. Планирана поддръжка утре от 14:00."
              />
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Тип</label>
              <select
                value={settings.announcement_type || 'info'}
                onChange={(e) => updateField('announcement_type', e.target.value)}
                className="input-dark"
              >
                <option value="info">Информация (синьо)</option>
                <option value="warning">Предупреждение (жълто)</option>
                <option value="success">Успех (зелено)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Плащания</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">IBAN (за банкови преводи)</label>
              <input
                value={settings.iban || ''}
                onChange={(e) => updateField('iban', e.target.value)}
                placeholder="BG..."
                className="input-dark font-mono"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Инструкция за плащане</label>
              <textarea
                value={settings.payment_info || ''}
                onChange={(e) => updateField('payment_info', e.target.value)}
                className="input-dark"
                rows={3}
              />
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Начална страница</h2>
          <div className="space-y-3">
            {HOME_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-sm text-[var(--text-muted)] block mb-1">{field.label}</label>
                <input
                  value={settings[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="input-dark"
                />
              </div>
            ))}
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Hero изображение</label>
              {settings.hero_image && (
                <img
                  src={settings.hero_image}
                  alt="Текущо hero изображение"
                  loading="lazy"
                  decoding="async"
                  className="w-full max-w-md h-32 object-cover rounded-lg mb-2"
                />
              )}
              <div className="flex gap-2">
                <input type="file" ref={heroImageRef} accept="image/*" className="input-dark text-sm flex-1" />
                <button onClick={handleHeroUpload} className="btn-outline flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Качи
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Екран за вход</h2>
          <div className="space-y-3">
            {LANDING_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-sm text-[var(--text-muted)] block mb-1">{field.label}</label>
                <input
                  value={settings[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="input-dark"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">{"Страница \u201EАбонаменти\u201C"}</h2>
          <div className="space-y-3">
            {SUBSCRIBE_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-sm text-[var(--text-muted)] block mb-1">{field.label}</label>
                <input
                  value={settings[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="input-dark"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Абонаменти — допълнителни</h2>
          <div className="space-y-3">
            {SUBSCRIBE_EXTRA_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-sm text-[var(--text-muted)] block mb-1">{field.label}</label>
                <input
                  value={settings[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="input-dark"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Навигация</h2>
          <div className="space-y-3">
            {NAV_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-sm text-[var(--text-muted)] block mb-1">{field.label}</label>
                <input
                  value={settings[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="input-dark"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Етикети за достъп</h2>
          <div className="space-y-3">
            {ACCESS_LABEL_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-sm text-[var(--text-muted)] block mb-1">{field.label}</label>
                <input
                  value={settings[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="input-dark"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Каталог</h2>
          <div className="space-y-3">
            {CATALOG_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-sm text-[var(--text-muted)] block mb-1">{field.label}</label>
                <input
                  value={settings[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="input-dark"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Профил</h2>
          <div className="space-y-3">
            {PROFILE_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-sm text-[var(--text-muted)] block mb-1">{field.label}</label>
                <input
                  value={settings[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="input-dark"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Начална — допълнителни</h2>
          <div className="space-y-3">
            {HOME_EXTRA_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-sm text-[var(--text-muted)] block mb-1">{field.label}</label>
                <input
                  value={settings[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="input-dark"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Профилно име</h2>
          <div className="space-y-3">
            {CHARACTER_NAME_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-sm text-[var(--text-muted)] block mb-1">{field.label}</label>
                <input
                  value={settings[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="input-dark"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold mb-3">Футър — допълнителни</h2>
          <div className="space-y-3">
            {FOOTER_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-sm text-[var(--text-muted)] block mb-1">{field.label}</label>
                <input
                  value={settings[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="input-dark"
                />
              </div>
            ))}
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-gold flex items-center gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Запазване...' : 'Запази настройките'}
        </button>
      </div>


    </div>
  );
}
