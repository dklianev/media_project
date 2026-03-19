import { useEffect, useRef, useState } from 'react';
import { Filter, Package, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { api } from '../../utils/api';
import AdminPagination from '../../components/AdminPagination';
import { formatDate, formatMoney } from '../../utils/formatters';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { useToastContext } from '../../context/ToastContext';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';

const emptyForm = {
  name: '',
  description: '',
  production_id: '',
  required_count: '',
  discounted_count: '',
  price: '',
  starts_at: '',
  ends_at: '',
  is_active: true,
};

export default function ManageBundles() {
  const [bundles, setBundles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [productions, setProductions] = useState([]);
  const { showToast } = useToastContext();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteId, setDeleteId] = useState(null);
  const fetchSeq = useRef(0);
  const [form, setForm] = useState({ ...emptyForm });

  const [initialFormState, setInitialFormState] = useState(JSON.stringify(form));
  const isDirty = JSON.stringify(form) !== initialFormState;
  useUnsavedChanges(isDirty);

  useEffect(() => {
    api.get('/productions')
      .then((data) => {
        const list = data.items || data.productions || data || [];
        setProductions(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
  }, []);

  const fetchData = () => {
    const seq = ++fetchSeq.current;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    params.set('sort_by', sortBy);
    params.set('sort_dir', sortDir);
    if (search.trim()) params.set('q', search.trim());
    if (activeFilter !== 'all') params.set('is_active', activeFilter);

    setLoading(true);
    api.get(`/bundles/admin?${params.toString()}`)
      .then((data) => {
        if (seq !== fetchSeq.current) return;
        setBundles(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || data.total_pages || 1);
      })
      .catch((err) => {
        if (seq !== fetchSeq.current) return;
        showToast(err.message || 'Неуспешно зареждане на пакетите', 'error');
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });
  };

  useEffect(() => {
    const timer = window.setTimeout(fetchData, 220);
    return () => window.clearTimeout(timer);
  }, [page, pageSize, search, activeFilter, sortBy, sortDir]);

  const resetForm = () => {
    const initial = { ...emptyForm };
    setForm(initial);
    setInitialFormState(JSON.stringify(initial));
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (bundle) => {
    setEditing(bundle.id);
    setShowForm(true);
    const newState = {
      name: bundle.name || '',
      description: bundle.description || '',
      production_id: bundle.production_id ? String(bundle.production_id) : '',
      required_count: bundle.required_count != null ? String(bundle.required_count) : '',
      discounted_count: bundle.discounted_count != null ? String(bundle.discounted_count) : '',
      price: bundle.price != null ? String(bundle.price) : '',
      starts_at: bundle.starts_at ? bundle.starts_at.slice(0, 10) : '',
      ends_at: bundle.ends_at ? bundle.ends_at.slice(0, 10) : '',
      is_active: !!bundle.is_active,
    };
    setForm(newState);
    setInitialFormState(JSON.stringify(newState));
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Името на пакета е задължително', 'error');
      return;
    }
    if (!form.production_id) {
      showToast('Изберете продукция', 'error');
      return;
    }
    if (!form.required_count || !form.discounted_count) {
      showToast('Необходим и намален брой са задължителни', 'error');
      return;
    }
    if (!form.price) {
      showToast('Цената е задължителна', 'error');
      return;
    }

    const data = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      production_id: Number(form.production_id),
      required_count: Number(form.required_count),
      discounted_count: Number(form.discounted_count),
      price: Number(form.price),
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      is_active: form.is_active,
    };

    try {
      if (editing) {
        await api.put(`/bundles/admin/${editing}`, data);
        showToast('Пакетът е обновен');
      } else {
        await api.post('/bundles/admin', data);
        showToast('Пакетът е създаден');
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
      await api.delete(`/bundles/admin/${deleteId}`);
      showToast('Пакетът е изтрит');
      setDeleteId(null);
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const productionName = (prodId) => {
    const p = productions.find((pr) => pr.id === prodId);
    return p ? p.title : '-';
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <h1 className="text-2xl font-bold">Управление на пакети</h1>
        {!showForm && (
          <button onClick={openCreateForm} className="btn-gold flex items-center gap-2">
            <Plus className="w-4 h-4" /> Нов пакет
          </button>
        )}
      </div>

      {showForm && (
        <div className="glass-card p-5 sm:p-6 mb-8">
          <h2 className="text-lg font-semibold mb-6">{editing ? 'Редактирай пакет' : 'Нов пакет'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Име</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="напр. Пакет 5+1"
                className="input-dark"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Продукция</label>
              <select
                value={form.production_id}
                onChange={(e) => setForm({ ...form, production_id: e.target.value })}
                className="input-dark"
              >
                <option value="">-- Изберете продукция --</option>
                {productions.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-[var(--text-muted)] block mb-1">Описание <span className="text-xs opacity-70">(по желание)</span></label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Кратко описание на пакета..."
                rows={2}
                className="input-dark"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Необходим брой</label>
              <input
                value={form.required_count}
                onChange={(e) => setForm({ ...form, required_count: e.target.value })}
                placeholder="напр. 5"
                type="number"
                min="1"
                className="input-dark"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Намален брой <span className="text-xs opacity-70">(безплатни)</span></label>
              <input
                value={form.discounted_count}
                onChange={(e) => setForm({ ...form, discounted_count: e.target.value })}
                placeholder="напр. 1"
                type="number"
                min="0"
                className="input-dark"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Цена</label>
              <input
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="напр. 25.00"
                type="number"
                min="0"
                step="0.01"
                className="input-dark"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Начална дата <span className="text-xs opacity-70">(по желание)</span></label>
              <input
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                type="date"
                className="input-dark text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">Крайна дата <span className="text-xs opacity-70">(по желание)</span></label>
              <input
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                type="date"
                className="input-dark text-sm"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                Активен пакет
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} className="btn-gold flex items-center gap-2">
              <Save className="w-4 h-4" /> {editing ? 'Запази' : 'Създай'}
            </button>
            <button onClick={resetForm} className="btn-outline flex items-center gap-2">
              <X className="w-4 h-4" /> Откажи
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 mb-4 sticky top-[72px] bg-[var(--bg-primary)]/90 backdrop-blur z-30 py-3 border-b border-white/5 mx-[-16px] px-[16px]">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Търси по име на пакет..."
            className="input-dark pl-11"
          />
        </div>

        <select
          value={activeFilter}
          onChange={(e) => {
            setPage(1);
            setActiveFilter(e.target.value);
          }}
          className="input-dark py-1.5 px-3 text-sm w-auto"
        >
          <option value="all">Всички</option>
          <option value="1">Активни</option>
          <option value="0">Неактивни</option>
        </select>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[var(--text-muted)]" />
          <select
            value={sortBy}
            onChange={(e) => {
              setPage(1);
              setSortBy(e.target.value);
            }}
            className="input-dark py-1.5 px-3 text-sm w-auto"
          >
            <option value="created_at">По дата</option>
            <option value="name">По име</option>
            <option value="price">По цена</option>
          </select>
          <select
            value={sortDir}
            onChange={(e) => {
              setPage(1);
              setSortDir(e.target.value);
            }}
            className="input-dark py-1.5 px-3 text-sm w-auto"
          >
            <option value="desc">Низходящо</option>
            <option value="asc">Възходящо</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>
      ) : bundles.length === 0 ? (
        <div className="glass-card p-10 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-4 text-[var(--text-muted)]">
            <Package className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold mb-2">Няма намерени пакети</h3>
          <p className="text-[var(--text-muted)] max-w-sm">
            Все още няма добавени пакети или не са намерени резултати за вашето търсене.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Име</th>
                <th>Продукция</th>
                <th>Необходим / Намален</th>
                <th>Цена</th>
                <th>Начало</th>
                <th>Край</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bundles.map((b) => (
                <tr key={b.id}>
                  <td>
                    <span className="font-semibold text-[var(--accent-gold)]">{b.name}</span>
                    {b.description && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">{b.description}</p>
                    )}
                  </td>
                  <td>{b.production_title || productionName(b.production_id)}</td>
                  <td className="text-center">{b.required_count} / {b.discounted_count}</td>
                  <td className="font-semibold">{formatMoney(b.price)}</td>
                  <td className="text-xs">{formatDate(b.starts_at)}</td>
                  <td className="text-xs">{formatDate(b.ends_at)}</td>
                  <td>
                    <span className={b.is_active ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                      {b.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(b)} className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded" aria-label="Редактирай пакет">
                        <Pencil className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      </button>
                      <button onClick={() => setDeleteId(b.id)} className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded" aria-label="Изтрий пакет">
                        <Trash2 className="w-3.5 h-3.5 text-[var(--danger)]" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        title="Изтриване на пакет"
        message="Сигурни ли сте, че искате да изтриете този пакет?"
        confirmLabel="Изтрий"
        cancelLabel="Назад"
        tone="danger"
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
