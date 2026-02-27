import { useEffect, useRef, useState } from 'react';
import { Filter, Pencil, Save, Search, Trash2, X } from 'lucide-react';
import { api } from '../../utils/api';
import AdminPagination from '../../components/AdminPagination';
import { formatDate } from '../../utils/formatters';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { useToastContext } from '../../context/ToastContext';

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
    setForm({ code: '', discount_percent: '', max_uses: '', expires_at: '', is_active: true });
    setEditing(null);
  };

  const startEdit = (code) => {
    setEditing(code.id);
    setForm({
      code: code.code,
      discount_percent: String(code.discount_percent),
      max_uses: code.max_uses ? String(code.max_uses) : '',
      expires_at: code.expires_at || '',
      is_active: !!code.is_active,
    });
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
      <h1 className="text-2xl font-bold mb-6">Промо кодове</h1>

      <div className="glass-card p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4">{editing ? 'Редактирай' : 'Нов промо код'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="Код (напр. NANCY10)"
            className="input-dark uppercase"
          />
          <input
            value={form.discount_percent}
            onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
            placeholder="Отстъпка (%)"
            type="number"
            min="1"
            max="100"
            className="input-dark"
          />
          <input
            value={form.max_uses}
            onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
            placeholder="Макс. използвания (празно = неограничено)"
            type="number"
            className="input-dark"
          />
          <input
            value={form.expires_at}
            onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            placeholder="Изтича на"
            type="date"
            className="input-dark"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Активен
          </label>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={handleSave} className="btn-gold flex items-center gap-2">
            <Save className="w-4 h-4" /> {editing ? 'Запази' : 'Създай'}
          </button>
          {editing && <button onClick={resetForm} className="btn-outline flex items-center gap-2"><X className="w-4 h-4" /> Откажи</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 mb-4">
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
        <p className="text-[var(--text-muted)] text-center py-10">Няма промо кодове</p>
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
