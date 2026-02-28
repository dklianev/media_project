import { useState, useEffect, useRef } from 'react';
import { Save, Upload } from 'lucide-react';
import { api } from '../../utils/api';
import { useToastContext } from '../../context/ToastContext';
import { invalidatePublicSettingsCache } from '../../utils/settings';

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
  { key: 'nav_label_calendar', label: 'График' },
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

const CALENDAR_FIELDS = [
  { key: 'calendar_title', label: 'Заглавие на графика' },
  { key: 'calendar_subtitle', label: 'Подзаглавие на графика' },
  { key: 'calendar_empty', label: 'Текст при липса на график' },
];

const FAQ_FIELDS = [
  { key: 'faq_title', label: 'Заглавие на FAQ' },
  { key: 'faq_description', label: 'Описание под заглавието на FAQ' },
  { key: 'faq_discord_link', label: 'Текст на бутона за Discord' },
  { key: 'faq_discord_url', label: 'URL линк към Discord сървъра' },
];

const COMMENTS_FIELDS = [
  { key: 'comments_title', label: 'Заглавие на дискусията' },
  { key: 'comments_placeholder', label: 'Placeholder на текстовото поле' },
  { key: 'comments_empty', label: 'Текст при липса на коментари' },
];

const NOTIFICATIONS_FIELDS = [
  { key: 'notifications_title', label: 'Заглавие на известията' },
  { key: 'notifications_mark_read', label: 'Бутон за маркиране като прочетени' },
  { key: 'notifications_empty', label: 'Текст при липса на известия' },
  { key: 'notifications_view', label: 'Бутон за преглед на известието' },
];

const PROFILE_STAT_FIELDS = [
  { key: 'profile_stat_time', label: 'Заглавие: Гледано време' },
  { key: 'profile_stat_episodes', label: 'Заглавие: Започнати епизоди' },
  { key: 'profile_stat_recent', label: 'Заглавие: Последно гледани' },
];

export default function ManageSettings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('general');
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
      invalidatePublicSettingsCache(true);
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
      invalidatePublicSettingsCache(true);
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
      invalidatePublicSettingsCache(true);
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

  const renderFields = (fieldsArray) => (
    <div className="space-y-3">
      {fieldsArray.map((field) => (
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
  );

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.24))]">
      {/* Header section with sticky Save button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Настройки</h1>
        <button onClick={handleSave} disabled={saving} className="btn-gold flex items-center justify-center gap-2 px-6 shadow-premium-md">
          <Save className="w-5 h-5" />
          {saving ? 'Запазване...' : 'Запази промените'}
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-[var(--danger)]/45 bg-[var(--danger)]/10 p-3 text-sm text-[#ffc9c9]">
          {error}
        </p>
      )}

      {/* Tabs Layout */}
      <div className="flex bg-[var(--bg-secondary)] border-b border-[var(--border)] gap-1 mb-6 rounded-t-xl px-2 pt-2 overflow-x-auto hide-scrollbar">
        {[
          { id: 'general', label: 'Общи настройки' },
          { id: 'design', label: 'Дизайн & Начална' },
          { id: 'auth', label: 'Вход & Профил' },
          { id: 'subs', label: 'Абонаменти & Каталог' },
          { id: 'live', label: 'Live Стрийм' },
          { id: 'community', label: 'Общност & Разни' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === tab.id
              ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] border-t border-x border-[var(--border)] -mb-[1px]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-y-auto pr-2 pb-12 space-y-6">

        {/* --- TAB: GENERAL --- */}
        {activeTab === 'general' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Основни</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Име на платформата</label>
                  <input value={settings.site_name || ''} onChange={(e) => updateField('site_name', e.target.value)} className="input-dark" />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Подзаглавие в навигацията</label>
                  <input value={settings.site_tagline || ''} onChange={(e) => updateField('site_tagline', e.target.value)} className="input-dark" />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Текст на лайв индикатора</label>
                  <input value={settings.live_badge_text || ''} onChange={(e) => updateField('live_badge_text', e.target.value)} className="input-dark" />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Лого (навигация)</label>
                  {settings.site_logo && (
                    <img src={settings.site_logo} alt="Текущо лого" className="w-16 h-16 object-cover rounded-lg mb-2" />
                  )}
                  <div className="flex gap-2">
                    <input type="file" ref={logoRef} accept="image/*" className="input-dark text-sm flex-1" />
                    <button onClick={() => handleImageUpload(logoRef, '/settings/site-logo', 'site_logo', 'Логото')} className="btn-outline flex items-center gap-2">
                      <Upload className="w-4 h-4" /> Качи
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Favicon</label>
                  {settings.site_favicon && (
                    <img src={settings.site_favicon} alt="Текущ favicon" className="w-8 h-8 object-cover rounded mb-2" />
                  )}
                  <div className="flex gap-2">
                    <input type="file" ref={faviconRef} accept="image/*" className="input-dark text-sm flex-1" />
                    <button onClick={() => handleImageUpload(faviconRef, '/settings/site-favicon', 'site_favicon', 'Favicon')} className="btn-outline flex items-center gap-2">
                      <Upload className="w-4 h-4" /> Качи
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Навигация</h2>
              {renderFields(NAV_FIELDS)}
            </div>

            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Известие (банер)</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={settings.announcement_enabled === 'true'} onChange={(e) => updateField('announcement_enabled', e.target.checked ? 'true' : 'false')} className="sr-only peer" />
                    <div className="w-11 h-6 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border)] peer-checked:bg-[var(--accent-gold)]/30 peer-checked:border-[var(--accent-gold)]/50 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5" />
                  </label>
                  <span className="text-sm font-medium">
                    {settings.announcement_enabled === 'true' ? 'Включен' : 'Изключен'}
                  </span>
                </div>
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Текст на известието</label>
                  <input value={settings.announcement_text || ''} onChange={(e) => updateField('announcement_text', e.target.value)} className="input-dark" placeholder="Напр. Планирана поддръжка утре от 14:00." />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Тип</label>
                  <select value={settings.announcement_type || 'info'} onChange={(e) => updateField('announcement_type', e.target.value)} className="input-dark">
                    <option value="info">Информация (синьо)</option>
                    <option value="warning">Предупреждение (жълто)</option>
                    <option value="success">Успех (зелено)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="glass-card p-5 border-[var(--danger)]/30">
              <h2 className="text-lg font-semibold mb-3 text-[var(--danger)]">Режим поддръжка</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={settings.maintenance_mode === 'true'} onChange={(e) => updateField('maintenance_mode', e.target.checked ? 'true' : 'false')} className="sr-only peer" />
                    <div className="w-11 h-6 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border)] peer-checked:bg-[var(--danger)]/50 peer-checked:border-[var(--danger)]/80 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5" />
                  </label>
                  <span className="text-sm font-medium">
                    {settings.maintenance_mode === 'true' ? 'Включен' : 'Изключен'}
                  </span>
                </div>
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Съобщение при поддръжка</label>
                  <textarea value={settings.maintenance_message || ''} onChange={(e) => updateField('maintenance_message', e.target.value)} className="input-dark" rows={2} />
                </div>
                {settings.maintenance_mode === 'true' && (
                  <p className="text-xs text-[var(--warning)] rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 p-2">
                    Внимание: Всички потребители (без админи) ще виждат страница за поддръжка.
                  </p>
                )}
              </div>
            </div>

            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Футър</h2>
              <div>
                <label className="text-sm text-[var(--text-muted)] block mb-1">Основен текст във футър</label>
                <input value={settings.footer_note || ''} onChange={(e) => updateField('footer_note', e.target.value)} className="input-dark mb-3" />
              </div>
              {renderFields(FOOTER_FIELDS)}
            </div>
          </div>
        )}

        {/* --- TAB: DESIGN & HOME --- */}
        {activeTab === 'design' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Hero секция (Начална страница)</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Hero изображение</label>
                  {settings.hero_image && (
                    <img src={settings.hero_image} alt="Текущо hero изображение" className="w-full max-w-[300px] h-40 object-cover rounded-lg mb-2" />
                  )}
                  <div className="flex gap-2">
                    <input type="file" ref={heroImageRef} accept="image/*" className="input-dark text-sm flex-1 max-w-sm" />
                    <button onClick={handleHeroUpload} className="btn-outline flex items-center gap-2">
                      <Upload className="w-4 h-4" /> Качи
                    </button>
                  </div>
                </div>
                {renderFields(HOME_FIELDS.slice(0, 6))}
              </div>
            </div>

            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Kатегории & Секции (Начало)</h2>
              {renderFields(HOME_FIELDS.slice(6))}
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                {renderFields(HOME_EXTRA_FIELDS)}
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: AUTH & PROFILE --- */}
        {activeTab === 'auth' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Екран за вход (Landing Page)</h2>
              {renderFields(LANDING_FIELDS)}
            </div>

            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Профилна Страница</h2>
              {renderFields(PROFILE_FIELDS)}
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <h3 className="text-sm font-medium mb-3">Настройка на Псевдоним</h3>
                {renderFields(CHARACTER_NAME_FIELDS)}
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: SUBS & CATALOG --- */}
        {activeTab === 'subs' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Плащания (Банков превод)</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">IBAN (за банкови преводи)</label>
                  <input value={settings.iban || ''} onChange={(e) => updateField('iban', e.target.value)} placeholder="BG..." className="input-dark font-mono bg-[#0f121a] text-[var(--accent-gold)] text-lg" />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Инструкция за плащане</label>
                  <textarea value={settings.payment_info || ''} onChange={(e) => updateField('payment_info', e.target.value)} className="input-dark min-h-[100px]" />
                </div>
              </div>
            </div>

            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Страница „Абонаменти“</h2>
              {renderFields(SUBSCRIBE_FIELDS)}
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                {renderFields(SUBSCRIBE_EXTRA_FIELDS)}
              </div>
            </div>

            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Каталог Продукции</h2>
              {renderFields(CATALOG_FIELDS)}
            </div>

            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Етикети за ниво на достъп (Badges)</h2>
              {renderFields(ACCESS_LABEL_FIELDS)}
            </div>
          </div>
        )}

        {/* --- TAB: LIVE STREAM --- */}
        {activeTab === 'live' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Стрийминг на живо</h2>
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 flex items-center justify-between">
                  <div>
                    <h3 className="text-[var(--danger)] font-medium mb-1">Глобален Live Статус</h3>
                    <p className="text-sm text-[var(--text-muted)]">Включете това, когато стриймвате, за да обновите баджа на сайта и страницата!</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={settings.stream_is_live === 'true'} onChange={(e) => updateField('stream_is_live', e.target.checked ? 'true' : 'false')} className="sr-only peer" />
                    <div className="w-14 h-8 rounded-full bg-black/40 border border-[var(--border)] peer-checked:bg-[var(--danger)] peer-checked:border-[var(--danger)]/80 transition-colors after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-transform peer-checked:after:translate-x-6 shadow-inner" />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-[var(--text-muted)] block mb-1">Платформа</label>
                    <select value={settings.stream_platform || 'twitch'} onChange={(e) => updateField('stream_platform', e.target.value)} className="input-dark">
                      <option value="twitch">Twitch</option>
                      <option value="kick">Kick</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-[var(--text-muted)] block mb-1">Име на канал</label>
                    <input value={settings.stream_channel || ''} onChange={(e) => updateField('stream_channel', e.target.value)} className="input-dark" placeholder="напр. username" />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Съобщение при офлайн статус</label>
                  <textarea value={settings.stream_offline_message || ''} onChange={(e) => updateField('stream_offline_message', e.target.value)} className="input-dark" rows={2} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: COMMUNITY --- */}
        {activeTab === 'community' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">График (Календар)</h2>
              {renderFields(CALENDAR_FIELDS)}
            </div>

            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Често задавани въпроси (FAQ)</h2>
              {renderFields(FAQ_FIELDS)}
            </div>

            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Секция Коментари</h2>
              {renderFields(COMMENTS_FIELDS)}
            </div>

            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Известия (Нотификации)</h2>
              {renderFields(NOTIFICATIONS_FIELDS)}
            </div>

            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold mb-3">Профилна статистика</h2>
              {renderFields(PROFILE_STAT_FIELDS)}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
