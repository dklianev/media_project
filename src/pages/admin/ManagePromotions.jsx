import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from '@/lib/motion';
import { Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { api } from '../../utils/api';
import AdminPagination from '../../components/AdminPagination';
import { formatDate } from '../../utils/formatters';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { useToastContext } from '../../context/ToastContext';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';

const TYPES = [
  { value: 'flash_sale', label: 'Бърза разпродажба' },
  { value: 'seasonal', label: 'Сезонна' },
  { value: 'first_purchase', label: 'Първа покупка' },
  { value: 'loyalty', label: 'Лоялност' },
  { value: 'volume', label: 'Обемна' },
];

const DISCOUNT_TYPES = [
  { value: 'percent', label: 'Процент (%)' },
  { value: 'fixed', label: 'Фиксирана сума (лв.)' },
];

const APPLIES_TO = [
  { value: 'all', label: 'Всичко' },
  { value: 'subscriptions', label: 'Абонаменти' },
  { value: 'purchases', label: 'Покупки' },
];

const emptyForm = {
  name: '',
  description: '',
  type: 'flash_sale',
  discount_type: 'percent',
  discount_value: '',
  applies_to: 'all',
  conditions: '',
  max_uses: '',
  starts_at: '',
  ends_at: '',
  is_active: true,
};

function typeLabel(type) {
  return TYPES.find((t) => t.value === type)?.label || type;
}

function appliesToLabel(val) {
  return APPLIES_TO.find((a) => a.value === val)?.label || val;
}

function formatDiscount(item) {
  if (item.discount_type === 'fixed') return `${item.discount_value} лв.`;
  return `${item.discount_value}%`;
}

export default function ManagePromotions() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToastContext();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteId, setDeleteId] = useState(null);
  const fetchSeq = useRef(0);

  const [form, setForm] = useState({ ...emptyForm });
  const [initialFormState, setInitialFormState] = useState(JSON.stringify(emptyForm));
  const isDirty = JSON.stringify(form) !== initialFormState;
  useUnsavedChanges(isDirty);

  const fetchData = () => {
    const seq = ++fetchSeq.current;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));

    setLoading(true);
    api.get(`/promotions/admin?${params.toString()}`)
      .then((data) => {
        if (seq !== fetchSeq.current) return;
        setItems(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || data.total_pages || 1);
      })
      .catch((err) => {
        if (seq !== fetchSeq.current) return;
        showToast(err.message || 'Неуспешно зареждане на промоциите', 'error');
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });
  };

  useEffect(() => {
    const timer = window.setTimeout(fetchData, 220);
    return () => window.clearTimeout(timer);
  }, [page, pageSize]);

  const resetForm = () => {
    setForm({ ...emptyForm });
    setInitialFormState(JSON.stringify(emptyForm));
    setEditing(null);
    setShowForm(false);
  };

  const openNew = () => {
    resetForm();
    setShowForm(true);
  };

  const startEdit = (promo) => {
    setEditing(promo.id);
    const newState = {
      name: promo.name || '',
      description: promo.description || '',
      type: promo.type || 'flash_sale',
      discount_type: promo.discount_type || 'percent',
      discount_value: promo.discount_value != null ? String(promo.discount_value) : '',
      applies_to: promo.applies_to || 'all',
      conditions: promo.conditions || '',
      max_uses: promo.max_uses != null ? String(promo.max_uses) : '',
      starts_at: promo.starts_at ? promo.starts_at.slice(0, 10) : '',
      ends_at: promo.ends_at ? promo.ends_at.slice(0, 10) : '',
      is_active: !!promo.is_active,
    };
    setForm(newState);
    setInitialFormState(JSON.stringify(newState));
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Името е задължително', 'error');
      return;
    }
    if (!form.discount_value || Number(form.discount_value) <= 0) {
      showToast('Стойността на отстъпката е задължителна', 'error');
      return;
    }

    const data = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      type: form.type,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      applies_to: form.applies_to,
      conditions: form.conditions ? JSON.parse(form.conditions) : null,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      is_active: form.is_active,
    };

    try {
      if (editing) {
        await api.put(`/promotions/admin/${editing}`, data);
        showToast('Промоцията е обновена');
      } else {
        await api.post('/promotions/admin', data);
        showToast('Промоцията е създадена');
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
      await api.delete(`/promotions/admin/${deleteId}`);
      showToast('Промоцията е изтрита');
      setDeleteId(null);
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Управление на промоции</h1>
        {!showForm && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={openNew}
            className="btn-gold flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Нова промоция
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-card p-5 sm:p-6 mb-8">
              <h2 className="text-lg font-semibold mb-6">
                {editing ? 'Редактирай промоция' : 'Нова промоция'}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Име */}
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Име</label>
                  <input
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="напр. Лятна разпродажба"
                    className="input-dark"
                  />
                </div>

                {/* Тип промоция */}
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Тип промоция</label>
                  <select
                    value={form.type}
                    onChange={(e) => set('type', e.target.value)}
                    className="input-dark"
                  >
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Тип отстъпка */}
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Тип отстъпка</label>
                  <select
                    value={form.discount_type}
                    onChange={(e) => set('discount_type', e.target.value)}
                    className="input-dark"
                  >
                    {DISCOUNT_TYPES.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>

                {/* Стойност на отстъпката */}
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">
                    Стойност на отстъпката
                    <span className="text-xs opacity-70 ml-1">
                      ({form.discount_type === 'percent' ? '%' : 'лв.'})
                    </span>
                  </label>
                  <input
                    value={form.discount_value}
                    onChange={(e) => set('discount_value', e.target.value)}
                    placeholder={form.discount_type === 'percent' ? 'напр. 20' : 'напр. 5.00'}
                    type="number"
                    min="0"
                    step={form.discount_type === 'percent' ? '1' : '0.01'}
                    max={form.discount_type === 'percent' ? '100' : undefined}
                    className="input-dark"
                  />
                </div>

                {/* Приложимо за */}
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Приложимо за</label>
                  <select
                    value={form.applies_to}
                    onChange={(e) => set('applies_to', e.target.value)}
                    className="input-dark"
                  >
                    {APPLIES_TO.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>

                {/* Макс. използвания */}
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">
                    Макс. използвания <span className="text-xs opacity-70">(празно = неограничено)</span>
                  </label>
                  <input
                    value={form.max_uses}
                    onChange={(e) => set('max_uses', e.target.value)}
                    placeholder="напр. 100"
                    type="number"
                    min="1"
                    className="input-dark"
                  />
                </div>

                {/* Начало */}
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Начална дата</label>
                  <input
                    value={form.starts_at}
                    onChange={(e) => set('starts_at', e.target.value)}
                    type="date"
                    className="input-dark text-sm"
                  />
                </div>

                {/* Край */}
                <div>
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Крайна дата</label>
                  <input
                    value={form.ends_at}
                    onChange={(e) => set('ends_at', e.target.value)}
                    type="date"
                    className="input-dark text-sm"
                  />
                </div>

                {/* Описание – цял ред */}
                <div className="md:col-span-2 lg:col-span-3">
                  <label className="text-sm text-[var(--text-muted)] block mb-1">Описание</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    placeholder="Описание на промоцията (по желание)"
                    rows={2}
                    className="input-dark resize-y"
                  />
                </div>

                {/* Условия JSON (само за loyalty / volume) */}
                {(form.type === 'loyalty' || form.type === 'volume') && (
                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="text-sm text-[var(--text-muted)] block mb-1">
                      Условия <span className="text-xs opacity-70">(JSON, напр. {`{"min_purchases": 5}`})</span>
                    </label>
                    <input
                      value={form.conditions}
                      onChange={(e) => set('conditions', e.target.value)}
                      placeholder='{"min_purchases": 5}'
                      className="input-dark font-mono text-sm"
                    />
                  </div>
                )}

                {/* Активен */}
                <div className="md:col-span-2 lg:col-span-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => set('is_active', e.target.checked)}
                    />
                    Активна промоция
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Таблица */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card p-10 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-4 text-[var(--text-muted)]">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold mb-2">Няма намерени промоции</h3>
          <p className="text-[var(--text-muted)] max-w-sm">
            Все още няма добавени промоции. Натиснете „Нова промоция", за да добавите първата.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Име</th>
                <th>Отстъпка</th>
                <th>Приложимо за</th>
                <th>Тип</th>
                <th>Използвания</th>
                <th>Начало</th>
                <th>Край</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((promo) => (
                <tr key={promo.id}>
                  <td>
                    <span className="font-semibold text-[var(--accent-gold)]">{promo.name}</span>
                  </td>
                  <td>{formatDiscount(promo)}</td>
                  <td className="text-xs">{appliesToLabel(promo.applies_to)}</td>
                  <td className="text-xs">{typeLabel(promo.type)}</td>
                  <td>
                    {promo.uses_count ?? 0}
                    {promo.max_uses ? ` / ${promo.max_uses}` : ''}
                  </td>
                  <td className="text-xs">{formatDate(promo.starts_at)}</td>
                  <td className="text-xs">{formatDate(promo.ends_at)}</td>
                  <td>
                    <span className={promo.is_active ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                      {promo.is_active ? 'Активна' : 'Неактивна'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(promo)}
                        className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded"
                        aria-label="Редактирай промоция"
                      >
                        <Pencil className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      </button>
                      <button
                        onClick={() => setDeleteId(promo.id)}
                        className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded"
                        aria-label="Изтрий промоция"
                      >
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
        title="Изтриване на промоция"
        message="Сигурни ли сте, че искате да изтриете тази промоция? Това действие е необратимо."
        confirmLabel="Изтрий"
        cancelLabel="Назад"
        tone="danger"
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
