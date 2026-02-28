import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Pencil, Save, Search, Trash2, X } from 'lucide-react';
import { api } from '../../utils/api';
import AdminPagination from '../../components/AdminPagination';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { useToastContext } from '../../context/ToastContext';

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
  const thumbnailRef = useRef();
  const coverRef = useRef();
  const fetchSeq = useRef(0);
  const [form, setForm] = useState({
    title: '',
    description: '',
    genres: '',
    access_group: 'free',
    required_tier: '1',
    sort_order: '0',
    is_active: true,
  });

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
    setForm({
      title: '',
      description: '',
      genres: '',
      access_group: 'free',
      required_tier: '1',
      sort_order: '0',
      is_active: true,
    });
    setEditing(null);
    if (thumbnailRef.current) thumbnailRef.current.value = '';
    if (coverRef.current) coverRef.current.value = '';
  };

  const startEdit = (production) => {
    setEditing(production.id);
    setForm({
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
      access_group: production.access_group || (production.required_tier > 0 ? 'subscription' : 'free'),
      required_tier: String(production.required_tier || 1),
      sort_order: String(production.sort_order || 0),
      is_active: !!production.is_active,
    });
    if (thumbnailRef.current) thumbnailRef.current.value = '';
    if (coverRef.current) coverRef.current.value = '';
  };

  const handleSave = async () => {
    const fd = new FormData();
    fd.append('title', form.title);
    fd.append('description', form.description);
    fd.append('access_group', form.access_group);
    fd.append('required_tier', form.access_group === 'subscription' ? form.required_tier : '0');
    fd.append('sort_order', form.sort_order);
    fd.append('is_active', String(form.is_active));
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

    try {
      if (editing) {
        await api.upload(`/productions/admin/${editing}`, fd, 'PUT');
        showToast('Продукцията е обновена');
      } else {
        await api.upload('/productions/admin', fd);
        showToast('Продукцията е създадена');
      }
      resetForm();
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
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
        className="text-2xl font-bold mb-6"
      >
        Продукции
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="glass-card p-5 mb-6"
      >
        <h2 className="text-lg font-semibold mb-4">{editing ? 'Редактирай продукция' : 'Нова продукция'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Заглавие"
            className="input-dark"
          />
          <select
            value={form.access_group}
            onChange={(e) => setForm({ ...form, access_group: e.target.value })}
            className="input-dark"
          >
            {ACCESS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input
            value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
            placeholder="Подреждане"
            type="number"
            className="input-dark"
          />
          <input
            value={form.required_tier}
            onChange={(e) => setForm({ ...form, required_tier: e.target.value })}
            placeholder="Необходимо ниво (за абонамент)"
            type="number"
            min="1"
            disabled={form.access_group !== 'subscription'}
            className="input-dark disabled:opacity-55"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Описание"
            className="input-dark md:col-span-2"
            rows={2}
          />
          <input
            value={form.genres}
            onChange={(e) => setForm({ ...form, genres: e.target.value })}
            placeholder="Жанрове (напр. Реалити, Драма, Комедия)"
            className="input-dark md:col-span-2"
          />
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Корица в каталог</label>
            <input type="file" ref={thumbnailRef} accept="image/*" className="input-dark text-sm" />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Голямо изображение</label>
            <input type="file" ref={coverRef} accept="image/*" className="input-dark text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Активна
          </label>
        </div>
        <div className="flex gap-2 mt-4">
          <motion.button
            onClick={handleSave}
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="btn-gold flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> {editing ? 'Запази' : 'Създай'}
          </motion.button>
          {editing && (
            <motion.button
              onClick={resetForm}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="btn-outline flex items-center gap-2"
            >
              <X className="w-4 h-4" /> Откажи
            </motion.button>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 mb-4">
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
        <p className="text-[var(--text-muted)] text-center py-10">Няма продукции</p>
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
                  <span className="badge badge-gold text-[10px]">{accessLabel(production.access_group)}</span>
                  {(production.access_group || 'free') === 'subscription' && (
                    <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Ниво {production.required_tier}</span>
                  )}
                  {!production.is_active && <span className="badge bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30 text-[10px]">Скрита</span>}
                </div>
                <p className="text-xs text-[var(--text-muted)]">/{production.slug}</p>
              </div>
              <div className="flex items-center gap-1">
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => reorderProduction(production.id, 'up')} className="admin-icon-btn" title="Нагоре">
                  <ArrowUp className="w-4 h-4" />
                </motion.button>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => reorderProduction(production.id, 'down')} className="admin-icon-btn" title="Надолу">
                  <ArrowDown className="w-4 h-4" />
                </motion.button>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => startEdit(production)} className="admin-icon-btn" aria-label="Редактирай продукция">
                  <Pencil className="w-4 h-4" />
                </motion.button>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setDeleteId(production.id)} className="admin-icon-btn" aria-label="Изтрий продукция">
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


    </div>
  );
}
