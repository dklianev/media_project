import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Save, Search, Trash2, X, Eye, EyeOff } from 'lucide-react';
import { api } from '../../utils/api';
import AdminPagination from '../../components/AdminPagination';
import { formatMoney } from '../../utils/formatters';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { useToastContext } from '../../context/ToastContext';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';

export default function ManagePlans() {
  const [plans, setPlans] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToastContext();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteId, setDeleteId] = useState(null);
  const fetchSeq = useRef(0);
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    tier_level: '1',
    features: '',
    sort_order: '0',
    is_active: true,
    is_popular: false,
  });

  const [initialFormState, setInitialFormState] = useState(JSON.stringify(form));
  const isDirty = JSON.stringify(form) !== initialFormState;
  useUnsavedChanges(isDirty);

  const fetchPlans = () => {
    const seq = ++fetchSeq.current;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    params.set('sort_by', 'sort_order');
    params.set('sort_dir', 'asc');
    if (search.trim()) params.set('q', search.trim());
    if (activeFilter !== 'all') params.set('is_active', activeFilter);

    setLoading(true);
    api.get(`/plans/admin/all?${params.toString()}`)
      .then((data) => {
        if (seq !== fetchSeq.current) return;
        setPlans(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
      })
      .catch((err) => {
        if (seq !== fetchSeq.current) return;
        showToast(err.message || 'Неуспешно зареждане на плановете', 'error');
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });
  };

  useEffect(() => {
    const timer = window.setTimeout(fetchPlans, 220);
    return () => window.clearTimeout(timer);
  }, [page, pageSize, search, activeFilter]);

  const resetForm = () => {
    const initialState = {
      name: '',
      description: '',
      price: '',
      tier_level: '1',
      features: '',
      sort_order: '0',
      is_active: true,
      is_popular: false,
    };
    setForm(initialState);
    setInitialFormState(JSON.stringify(initialState));
    setEditing(null);
  };

  const startEdit = (plan) => {
    setEditing(plan.id);
    const newState = {
      name: plan.name,
      description: plan.description || '',
      price: String(plan.price),
      tier_level: String(plan.tier_level),
      features: (plan.features || []).join('\n'),
      sort_order: String(plan.sort_order),
      is_active: !!plan.is_active,
      is_popular: !!plan.is_popular,
    };
    setForm(newState);
    setInitialFormState(JSON.stringify(newState));
  };

  const handleSave = async () => {
    const data = {
      ...form,
      price: Number.parseFloat(form.price),
      tier_level: Number.parseInt(form.tier_level, 10),
      sort_order: Number.parseInt(form.sort_order, 10),
      features: form.features.split('\n').map((feature) => feature.trim()).filter(Boolean),
    };

    try {
      if (editing) {
        await api.put(`/plans/admin/${editing}`, data);
        showToast('Планът е обновен');
      } else {
        await api.post('/plans/admin', data);
        showToast('Планът е създаден');
      }
      resetForm();
      fetchPlans();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/plans/admin/${deleteId}`);
      showToast('Планът е изтрит');
      setDeleteId(null);
      fetchPlans();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const reorderPlan = async (id, direction) => {
    try {
      await api.put(`/plans/admin/${id}/reorder`, { direction });
      fetchPlans();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Абонаментни планове</h1>

      <div className="glass-card p-5 sm:p-6 mb-8">
        <h2 className="text-lg font-semibold mb-6">
          {editing ? 'Редактирай план' : 'Нов план'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Име на плана</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="напр. Златен" className="input-dark" />
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Цена (в BGN)</label>
            <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="напр. 9.99" type="number" className="input-dark" />
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Ниво на достъп <span className="text-xs opacity-70">(1, 2, 3...)</span></label>
            <input value={form.tier_level} onChange={(e) => setForm({ ...form, tier_level: e.target.value })}
              placeholder="напр. 1" type="number" className="input-dark" />
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Подреждане <span className="text-xs opacity-70">(0 = най-отпред)</span></label>
            <input value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              placeholder="напр. 0, 1, 2..." type="number" className="input-dark" />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-[var(--text-muted)] block mb-1">Описание</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Кратко описание на плана..." className="input-dark" rows={2} />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-[var(--text-muted)] block mb-1">Функции <span className="text-xs opacity-70">(въвеждайте по една на ред)</span></label>
            <textarea value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })}
              placeholder="- Достъп до всички епизоди\n- Без реклами\n- 4K качество" className="input-dark" rows={3} />
          </div>
          <label className="flex items-center gap-2 text-sm mt-2">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Активен
          </label>
          <label className="flex items-center gap-2 text-sm mt-2">
            <input type="checkbox" checked={form.is_popular} onChange={(e) => setForm({ ...form, is_popular: e.target.checked })} />
            Популярен
          </label>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={handleSave} className="btn-gold flex items-center gap-2">
            <Save className="w-4 h-4" /> {editing ? 'Запази' : 'Създай'}
          </button>
          {editing && (
            <button onClick={resetForm} className="btn-outline flex items-center gap-2">
              <X className="w-4 h-4" /> Откажи
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2 mb-4 sticky top-[72px] bg-[var(--bg-primary)]/90 backdrop-blur z-30 py-3 border-b border-white/5 mx-[-16px] px-[16px]">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Търси план..."
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
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-20 rounded-lg" />)}</div>
      ) : plans.length === 0 ? (
        <div className="glass-card p-10 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-4 text-[var(--text-muted)]">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold mb-2">Няма намерени абонаментни планове</h3>
          <p className="text-[var(--text-muted)] max-w-sm">
            Все още няма добавени абонаментни планове или не са намерени резултати за вашето търсене.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <div key={plan.id} className="glass-card p-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{plan.name}</h3>
                  <span className="badge badge-gold">Ниво {plan.tier_level}</span>
                  {plan.is_popular ? <span className="badge bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/30">Популярен</span> : null}
                  {!plan.is_active && <span className="badge bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30">Неактивен</span>}
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  {formatMoney(plan.price)} | {(plan.features || []).length} функции
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={async () => {
                    try {
                      await api.put(`/plans/admin/${plan.id}/status`, {
                        is_active: !plan.is_active,
                      });
                      fetchPlans();
                      showToast(plan.is_active ? 'Планът е деактивиран' : 'Планът е активиран', 'success');
                    } catch (err) {
                      showToast(err.message, 'error');
                    }
                  }}
                  className={`p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors ${plan.is_active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
                  title={plan.is_active ? 'Деактивирай' : 'Активирай'}
                >
                  {plan.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button onClick={() => reorderPlan(plan.id, 'up')} className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors" title="Нагоре">
                  <ArrowUp className="w-4 h-4 text-[var(--text-secondary)]" />
                </button>
                <button onClick={() => reorderPlan(plan.id, 'down')} className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors" title="Надолу">
                  <ArrowDown className="w-4 h-4 text-[var(--text-secondary)]" />
                </button>
                <button onClick={() => startEdit(plan)} className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors">
                  <Pencil className="w-4 h-4 text-[var(--text-secondary)]" />
                </button>
                <button onClick={() => setDeleteId(plan.id)} className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors" aria-label="Изтрий план">
                  <Trash2 className="w-4 h-4 text-[var(--danger)]" />
                </button>
              </div>
            </div>
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
        title="Изтриване на план"
        message="Сигурни ли сте, че искате да изтриете този план?"
        confirmLabel="Изтрий"
        cancelLabel="Назад"
        tone="danger"
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
      />


    </div>
  );
}
