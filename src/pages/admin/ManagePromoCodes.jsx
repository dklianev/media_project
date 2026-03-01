import { useEffect, useRef, useState } from 'react';
import { Filter, Pencil, Save, Search, Trash2, X, Eye, EyeOff } from 'lucide-react';
import { api } from '../../utils/api';
import AdminPagination from '../../components/AdminPagination';
import { formatDate } from '../../utils/formatters';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { useToastContext } from '../../context/ToastContext';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';

export default function ManagePromoCodes() {
  const [codes, setCodes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
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
  const [form, setForm] = useState({
    code: '',
    discount_percent: '',
    max_uses: '',
    expires_at: '',
    is_active: true,
  });

  const [initialFormState, setInitialFormState] = useState(JSON.stringify(form));
  const isDirty = JSON.stringify(form) !== initialFormState;
  useUnsavedChanges(isDirty);

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
    api.get(`/admin/promo-codes?${params.toString()}`)
      .then((data) => {
        if (seq !== fetchSeq.current) return;
        setCodes(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
      })
      .catch((err) => {
        if (seq !== fetchSeq.current) return;
        showToast(err.message || 'Неуспешно зареждане на промо кодовете', 'error');
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
    const initialState = { code: '', discount_percent: '', max_uses: '', expires_at: '', is_active: true };
    setForm(initialState);
    setInitialFormState(JSON.stringify(initialState));
    setEditing(null);
  };

  const startEdit = (code) => {
    setEditing(code.id);
    const newState = {
      code: code.code,
      discount_percent: String(code.discount_percent),
      max_uses: code.max_uses ? String(code.max_uses) : '',
      expires_at: code.expires_at || '',
      is_active: !!code.is_active,
    };
    setForm(newState);
    setInitialFormState(JSON.stringify(newState));
  };

  const handleSave = async () => {
    if (!form.code || !form.discount_percent) {
      showToast('Кодът и отстъпката са задължителни', 'error');
      return;
    }

    const data = {
      code: form.code,
      discount_percent: Number.parseInt(form.discount_percent, 10),
      max_uses: form.max_uses ? Number.parseInt(form.max_uses, 10) : null,
      expires_at: form.expires_at || null,
      is_active: form.is_active,
    };

    try {
      if (editing) {
        await api.put(`/admin/promo-codes/${editing}`, data);
        showToast('Промо кодът е обновен');
      } else {
        await api.post('/admin/promo-codes', data);
        showToast('Промо кодът е създаден');
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
      await api.delete(`/admin/promo-codes/${deleteId}`);
      showToast('Промо кодът е изтрит');
      setDeleteId(null);
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Промо кодове</h1>

      <div className="glass-card p-5 sm:p-6 mb-8">
        <h2 className="text-lg font-semibold mb-6">{editing ? 'Редактирай' : 'Нов промо код'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Код</label>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="напр. NANCY10"
              className="input-dark uppercase"
            />
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Отстъпка <span className="text-xs opacity-70">(в %)</span></label>
            <input
              value={form.discount_percent}
              onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
              placeholder="напр. 10"
              type="number"
              min="1"
              max="100"
              className="input-dark"
            />
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Макс. използвания <span className="text-xs opacity-70">(празно = неограничено)</span></label>
            <input
              value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
              placeholder="напр. 100"
              type="number"
              className="input-dark"
            />
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Изтича на <span className="text-xs opacity-70">(по желание)</span></label>
            <input
              value={form.expires_at}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              type="date"
              className="input-dark text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Активен код
            </label>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={handleSave} className="btn-gold flex items-center gap-2">
            <Save className="w-4 h-4" /> {editing ? 'Запази' : 'Създай'}
          </button>
          {editing && <button onClick={resetForm} className="btn-outline flex items-center gap-2"><X className="w-4 h-4" /> Откажи</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 mb-4 sticky top-[72px] bg-[var(--bg-primary)]/90 backdrop-blur z-30 py-3 border-b border-white/5 mx-[-16px] px-[16px]">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Търси по код..."
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
            <option value="discount_percent">По отстъпка</option>
            <option value="uses_count">По използвания</option>
            <option value="code">По код</option>
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
      ) : codes.length === 0 ? (
        <div className="glass-card p-10 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-4 text-[var(--text-muted)]">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold mb-2">Няма намерени промо кодове</h3>
          <p className="text-[var(--text-muted)] max-w-sm">
            Все още няма добавени промо кодове или не са намерени резултати за вашето търсене.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Код</th>
                <th>Отстъпка</th>
                <th>Използвания</th>
                <th>Макс.</th>
                <th>Изтича</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="font-mono font-bold text-[var(--accent-gold)]">{c.code}</span>
                  </td>
                  <td>{c.discount_percent}%</td>
                  <td>{c.uses_count}</td>
                  <td>{c.max_uses || '∞'}</td>
                  <td className="text-xs">{formatDate(c.expires_at)}</td>
                  <td>
                    <span className={c.is_active ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                      {c.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        onClick={async () => {
                          try {
                            await api.put(`/admin/promo-codes/${c.id}/status`, {
                              is_active: !c.is_active,
                            });
                            fetchData();
                            showToast(c.is_active ? 'Кодът е деактивиран' : 'Кодът е активиран', 'success');
                          } catch (err) {
                            showToast(err.message, 'error');
                          }
                        }}
                        className={`p-1.5 hover:bg-[var(--bg-tertiary)] rounded ${c.is_active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
                        title={c.is_active ? 'Деактивирай' : 'Активирай'}
                      >
                        {c.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => startEdit(c)} className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded" aria-label="Редактирай промо код">
                        <Pencil className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      </button>
                      <button onClick={() => setDeleteId(c.id)} className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded" aria-label="Изтрий промо код">
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
        title="Изтриване на промо код"
        message="Сигурни ли сте, че искате да изтриете този промо код?"
        confirmLabel="Изтрий"
        cancelLabel="Назад"
        tone="danger"
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
      />


    </div>
  );
}
