import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ImagePlus, Pencil, Save, Search, Trash2, X, Eye, EyeOff } from 'lucide-react';
import { api } from '../../utils/api';
import AdminPagination from '../../components/AdminPagination';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import MediaPickerModal from '../../components/MediaPickerModal';
import { useToastContext } from '../../context/ToastContext';
import { useUploadActivity } from '../../context/UploadActivityContext';
import { getProductionAccessGroup } from '../../utils/accessGroups';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';

const ACCESS_OPTIONS = [
  { value: 'free', label: 'Безплатно' },
  { value: 'trailer', label: 'Трейлър' },
  { value: 'subscription', label: 'С абонамент' },
];

function accessLabel(value) {
  return ACCESS_OPTIONS.find((item) => item.value === value)?.label || 'С абонамент';
}

export default function ManageProductions() {
  const [productions, setProductions] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToastContext();
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteId, setDeleteId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [mediaTarget, setMediaTarget] = useState(null);
  const [thumbnailUploadPreview, setThumbnailUploadPreview] = useState('');
  const [coverUploadPreview, setCoverUploadPreview] = useState('');
  const thumbnailRef = useRef();
  const coverRef = useRef();
  const fetchSeq = useRef(0);
  const { isUploading, runWithUploadLock } = useUploadActivity();
  const [form, setForm] = useState({
    title: '',
    description: '',
    genres: '',
    access_group: 'free',
    required_tier: '1',
    sort_order: '0',
    is_active: true,
    thumbnail_url: '',
    cover_image_url: '',
  });

  const [initialFormState, setInitialFormState] = useState(JSON.stringify(form));
  const hasPendingUploads = Boolean(
    thumbnailRef.current?.files?.length
    || coverRef.current?.files?.length
  );
  const isDirty = JSON.stringify(form) !== initialFormState || hasPendingUploads;
  useUnsavedChanges(isDirty);

  useEffect(() => () => {
    if (thumbnailUploadPreview) URL.revokeObjectURL(thumbnailUploadPreview);
    if (coverUploadPreview) URL.revokeObjectURL(coverUploadPreview);
  }, [thumbnailUploadPreview, coverUploadPreview]);

  const updatePreviewUrl = (setter, currentValue, file) => {
    if (currentValue) URL.revokeObjectURL(currentValue);
    setter(file ? URL.createObjectURL(file) : '');
  };

  const thumbnailPreviewSrc = thumbnailUploadPreview || form.thumbnail_url || null;
  const coverPreviewSrc = coverUploadPreview || form.cover_image_url || null;
  const isActionLocked = saving || isUploading;

  const fetchData = () => {
    const seq = ++fetchSeq.current;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    params.set('sort_by', 'sort_order');
    params.set('sort_dir', 'asc');
    if (search.trim()) params.set('q', search.trim());
    if (groupFilter !== 'all') params.set('access_group', groupFilter);
    if (activeFilter !== 'all') params.set('is_active', activeFilter);

    setLoading(true);
    api.get(`/productions/admin/all?${params.toString()}`)
      .then((data) => {
        if (seq !== fetchSeq.current) return;
        setProductions(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
      })
      .catch((err) => {
        if (seq !== fetchSeq.current) return;
        showToast(err.message || 'Неуспешно зареждане на продукциите', 'error');
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });
  };

  useEffect(() => {
    const timer = window.setTimeout(fetchData, 220);
    return () => window.clearTimeout(timer);
  }, [page, pageSize, search, groupFilter, activeFilter]);

  const resetForm = () => {
    const initialState = {
      title: '',
      description: '',
      genres: '',
      access_group: 'free',
      required_tier: '1',
      sort_order: '0',
      is_active: true,
      thumbnail_url: '',
      cover_image_url: '',
    };
    setForm(initialState);
    setInitialFormState(JSON.stringify(initialState));
    setEditing(null);
    if (thumbnailRef.current) thumbnailRef.current.value = '';
    if (coverRef.current) coverRef.current.value = '';
    updatePreviewUrl(setThumbnailUploadPreview, thumbnailUploadPreview, null);
    updatePreviewUrl(setCoverUploadPreview, coverUploadPreview, null);
  };

  const startEdit = (production) => {
    setEditing(production.id);
    const newState = {
      title: production.title,
      description: production.description || '',
      genres: (() => {
        try {
          const parsed = JSON.parse(production.genres || '[]');
          return Array.isArray(parsed) ? parsed.join(', ') : '';
        } catch {
          return '';
        }
      })(),
      access_group: getProductionAccessGroup(production),
      required_tier: String(production.required_tier || 1),
      sort_order: String(production.sort_order || 0),
      is_active: !!production.is_active,
      thumbnail_url: production.thumbnail_url || '',
      cover_image_url: production.cover_image_url || '',
    };
    setForm(newState);
    setInitialFormState(JSON.stringify(newState));

    if (thumbnailRef.current) thumbnailRef.current.value = '';
    if (coverRef.current) coverRef.current.value = '';
    updatePreviewUrl(setThumbnailUploadPreview, thumbnailUploadPreview, null);
    updatePreviewUrl(setCoverUploadPreview, coverUploadPreview, null);
  };

  const handleSave = async () => {
    const fd = new FormData();
    fd.append('title', form.title);
    fd.append('description', form.description);
    fd.append('access_group', form.access_group);
    fd.append('required_tier', form.access_group === 'subscription' ? form.required_tier : '0');
    fd.append('sort_order', form.sort_order);
    fd.append('is_active', String(form.is_active));
    fd.append('thumbnail_url', form.thumbnail_url || '');
    fd.append('cover_image_url', form.cover_image_url || '');
    fd.append(
      'genres',
      JSON.stringify(
        form.genres
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
    if (thumbnailRef.current?.files[0]) fd.append('thumbnail', thumbnailRef.current.files[0]);
    if (coverRef.current?.files[0]) fd.append('cover_image', coverRef.current.files[0]);

    setSaving(true);
    try {
      await runWithUploadLock(
        () => (editing ? api.upload(`/productions/admin/${editing}`, fd, 'PUT') : api.upload('/productions/admin', fd)),
        'Обработваме изображенията за продукцията...'
      );
      showToast(editing ? 'Продукцията е обновена' : 'Продукцията е създадена');
      resetForm();
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/productions/admin/${deleteId}`);
      showToast('Продукцията е изтрита');
      setDeleteId(null);
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const reorderProduction = async (id, direction) => {
    try {
      await api.put(`/productions/admin/${id}/reorder`, { direction });
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div>
      <motion.h1
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="text-2xl font-bold mb-8"
      >
        Продукции
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="glass-card p-5 sm:p-6 mb-8"
      >
        <h2 className="text-lg font-semibold mb-6">{editing ? 'Редактирай продукция' : 'Нова продукция'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Заглавие</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Въведете заглавие"
              className="input-dark"
            />
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Ниво на достъп</label>
            <select
              value={form.access_group}
              onChange={(e) => setForm({ ...form, access_group: e.target.value })}
              className="input-dark"
            >
              {ACCESS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Подреждане <span className="text-xs opacity-70">(0 = най-отпред)</span></label>
            <input
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              placeholder="напр. 0, 1, 2..."
              type="number"
              className="input-dark"
            />
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Необходимо ниво <span className="text-xs opacity-70">(само за абонамент)</span></label>
            <input
              value={form.required_tier}
              onChange={(e) => setForm({ ...form, required_tier: e.target.value })}
              placeholder="напр. 1, 2, 3..."
              type="number"
              min="1"
              disabled={form.access_group !== 'subscription'}
              className="input-dark disabled:opacity-55"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-[var(--text-muted)] block mb-1">Описание</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Въведете описание на продукцията..."
              className="input-dark"
              rows={2}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-[var(--text-muted)] block mb-1">Жанрове</label>
            <input
              value={form.genres}
              onChange={(e) => setForm({ ...form, genres: e.target.value })}
              placeholder="Напр. Реалити, Драма, Комедия (разделени със запетая)"
              className="input-dark"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1 flex items-center justify-between">
              Корица в каталог
              {thumbnailPreviewSrc && <span className="text-[10px] text-[var(--accent-primary)]">Preview</span>}
            </label>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                {thumbnailPreviewSrc && (
                  <img src={thumbnailPreviewSrc} alt="Thumbnail preview" className="w-16 h-10 object-cover rounded shadow-sm" />
                )}
                <input
                  type="file"
                  ref={thumbnailRef}
                  accept="image/*"
                  disabled={isActionLocked}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    updatePreviewUrl(setThumbnailUploadPreview, thumbnailUploadPreview, file);
                    if (file) {
                      setForm((current) => ({ ...current, thumbnail_url: '' }));
                    }
                  }}
                  className="input-dark text-sm flex-1"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMediaTarget('thumbnail')}
                  disabled={isActionLocked}
                  className="btn-outline inline-flex items-center gap-2 !px-3 !py-2 text-xs disabled:opacity-50"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  От библиотеката
                </button>
                {thumbnailPreviewSrc && (
                  <button
                    type="button"
                    onClick={() => {
                      if (thumbnailRef.current) thumbnailRef.current.value = '';
                      updatePreviewUrl(setThumbnailUploadPreview, thumbnailUploadPreview, null);
                      setForm((current) => ({ ...current, thumbnail_url: '' }));
                    }}
                    disabled={isActionLocked}
                    className="btn-outline !px-3 !py-2 text-xs disabled:opacity-50"
                  >
                    Изчисти
                  </button>
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1 flex items-center justify-between">
              Голямо изображение
              {coverPreviewSrc && <span className="text-[10px] text-[var(--accent-primary)]">Preview</span>}
            </label>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                {coverPreviewSrc && (
                  <img src={coverPreviewSrc} alt="Cover preview" className="w-16 h-10 object-cover rounded shadow-sm" />
                )}
                <input
                  type="file"
                  ref={coverRef}
                  accept="image/*"
                  disabled={isActionLocked}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    updatePreviewUrl(setCoverUploadPreview, coverUploadPreview, file);
                    if (file) {
                      setForm((current) => ({ ...current, cover_image_url: '' }));
                    }
                  }}
                  className="input-dark text-sm flex-1"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMediaTarget('cover')}
                  disabled={isActionLocked}
                  className="btn-outline inline-flex items-center gap-2 !px-3 !py-2 text-xs disabled:opacity-50"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  От библиотеката
                </button>
                {coverPreviewSrc && (
                  <button
                    type="button"
                    onClick={() => {
                      if (coverRef.current) coverRef.current.value = '';
                      updatePreviewUrl(setCoverUploadPreview, coverUploadPreview, null);
                      setForm((current) => ({ ...current, cover_image_url: '' }));
                    }}
                    disabled={isActionLocked}
                    className="btn-outline !px-3 !py-2 text-xs disabled:opacity-50"
                  >
                    Изчисти
                  </button>
                )}
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Активна
          </label>
        </div>
        <div className="flex gap-2 mt-4">
          <motion.button
            onClick={handleSave}
            disabled={isActionLocked}
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="btn-gold flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? 'Запазване...' : editing ? 'Запази' : 'Създай'}
          </motion.button>
          {editing && (
            <motion.button
              onClick={resetForm}
              disabled={isActionLocked}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="btn-outline flex items-center gap-2 disabled:opacity-50"
            >
              <X className="w-4 h-4" /> Откажи
            </motion.button>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 mb-4 sticky top-[72px] bg-[var(--bg-primary)]/90 backdrop-blur z-30 py-3 border-b border-white/5 mx-[-16px] px-[16px]">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Търси продукция..."
            className="input-dark pl-11"
          />
        </div>
        <select
          value={groupFilter}
          onChange={(e) => {
            setPage(1);
            setGroupFilter(e.target.value);
          }}
          className="input-dark py-1.5 px-3 text-sm w-auto"
        >
          <option value="all">Всички категории</option>
          <option value="free">Безплатно</option>
          <option value="trailer">Трейлър</option>
          <option value="subscription">С абонамент</option>
        </select>
        <select
          value={activeFilter}
          onChange={(e) => {
            setPage(1);
            setActiveFilter(e.target.value);
          }}
          className="input-dark py-1.5 px-3 text-sm w-auto"
        >
          <option value="all">Всички статуси</option>
          <option value="1">Активни</option>
          <option value="0">Скрити</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-20 rounded-lg" />)}</div>
      ) : productions.length === 0 ? (
        <div className="glass-card p-10 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-4 text-[var(--text-muted)]">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold mb-2">Няма намерени продукции</h3>
          <p className="text-[var(--text-muted)] max-w-sm">
            Все още няма добавени продукции или не са намерени резултати за вашето търсене.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {productions.map((production, index) => (
            <motion.div
              key={production.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="glass-card p-4 flex items-center gap-4"
            >
              {production.thumbnail_url && (
                <img
                  src={production.thumbnail_url}
                  alt={production.title ? `Корица на ${production.title}` : 'Корица на продукция'}
                  loading="lazy"
                  decoding="async"
                  className="w-16 h-10 rounded object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold truncate">{production.title}</h3>
                  <span className="badge badge-gold text-[10px]">{accessLabel(getProductionAccessGroup(production))}</span>
                  {getProductionAccessGroup(production) === 'subscription' && (
                    <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Ниво {production.required_tier}</span>
                  )}
                  {!production.is_active && <span className="badge bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30 text-[10px]">Скрита</span>}
                </div>
                <p className="text-xs text-[var(--text-muted)]">/{production.slug}</p>
              </div>
              <div className="flex items-center gap-1">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={async () => {
                    try {
                      await api.put(`/productions/admin/${production.id}/status`, {
                        is_active: !production.is_active,
                      });
                      fetchData();
                      showToast(production.is_active ? 'Продукцията е скрита' : 'Продукцията е активна', 'success');
                    } catch (err) {
                      showToast(err.message, 'error');
                    }
                  }}
                  disabled={isActionLocked}
                  className={`admin-icon-btn ${production.is_active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
                  title={production.is_active ? 'Скрий' : 'Покажи'}
                >
                  {production.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </motion.button>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => reorderProduction(production.id, 'up')} disabled={isActionLocked} className="admin-icon-btn disabled:opacity-50" title="Нагоре">
                  <ArrowUp className="w-4 h-4" />
                </motion.button>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => reorderProduction(production.id, 'down')} disabled={isActionLocked} className="admin-icon-btn disabled:opacity-50" title="Надолу">
                  <ArrowDown className="w-4 h-4" />
                </motion.button>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => startEdit(production)} disabled={isActionLocked} className="admin-icon-btn disabled:opacity-50" title="Редактирай">
                  <Pencil className="w-4 h-4" />
                </motion.button>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setDeleteId(production.id)} disabled={isActionLocked} className="admin-icon-btn disabled:opacity-50" aria-label="Изтрий продукция">
                  <Trash2 className="w-4 h-4 text-[var(--danger)]" />
                </motion.button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(nextSize) => {
          setPage(1);
          setPageSize(nextSize);
        }}
      />

      <ConfirmActionModal
        open={Boolean(deleteId)}
        title="Изтриване на продукция"
        message="Сигурни ли сте, че искате да изтриете тази продукция?"
        confirmLabel="Изтрий"
        cancelLabel="Назад"
        tone="danger"
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
      />

      <MediaPickerModal
        open={Boolean(mediaTarget)}
        title={mediaTarget === 'cover' ? 'Избери голямо изображение' : 'Избери корица за каталог'}
        value={mediaTarget === 'cover' ? form.cover_image_url : form.thumbnail_url}
        onClose={() => setMediaTarget(null)}
        onConfirm={(url) => {
          if (mediaTarget === 'cover') {
            if (coverRef.current) coverRef.current.value = '';
            updatePreviewUrl(setCoverUploadPreview, coverUploadPreview, null);
            setForm((current) => ({ ...current, cover_image_url: url }));
            return;
          }
          if (thumbnailRef.current) thumbnailRef.current.value = '';
          updatePreviewUrl(setThumbnailUploadPreview, thumbnailUploadPreview, null);
          setForm((current) => ({ ...current, thumbnail_url: url }));
        }}
      />


    </div>
  );
}
