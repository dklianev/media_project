import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../../utils/api';
import AdminPagination from '../../components/AdminPagination';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('bg-BG');
}

function formatMetadata(metadata) {
  if (!metadata) return '—';
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return '—';
  }
}

export default function ManageAuditLogs() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const fetchSeq = useRef(0);

  const fetchLogs = () => {
    const seq = ++fetchSeq.current;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    params.set('sort_by', sortBy);
    params.set('sort_dir', sortDir);
    if (search.trim()) params.set('q', search.trim());
    if (actionFilter.trim()) params.set('action', actionFilter.trim().toLowerCase());
    if (entityFilter.trim()) params.set('entity_type', entityFilter.trim().toLowerCase());

    setLoading(true);
    api.get(`/admin/audit?${params.toString()}`)
      .then((data) => {
        if (seq !== fetchSeq.current) return;
        setItems(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
      })
      .catch(() => {
        if (seq !== fetchSeq.current) return;
        setItems([]);
        setTotal(0);
        setTotalPages(1);
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });
  };

  useEffect(() => {
    const timer = window.setTimeout(fetchLogs, 220);
    return () => window.clearTimeout(timer);
  }, [page, pageSize, search, actionFilter, entityFilter, sortBy, sortDir]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Одит лог</h1>
        <div className="w-full xl:w-auto grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[260px_190px_auto_auto] gap-2">
          <input
            value={actionFilter}
            onChange={(e) => {
              setPage(1);
              setActionFilter(e.target.value);
            }}
            placeholder="Действие (напр. payment.confirm)"
            className="input-dark py-1.5 px-3 text-sm w-full"
          />
          <input
            value={entityFilter}
            onChange={(e) => {
              setPage(1);
              setEntityFilter(e.target.value);
            }}
            placeholder="Обект (напр. user)"
            className="input-dark py-1.5 px-3 text-sm w-full"
          />
          <select
            value={sortBy}
            onChange={(e) => {
              setPage(1);
              setSortBy(e.target.value);
            }}
            className="input-dark py-1.5 px-3 text-sm w-auto"
          >
            <option value="created_at">По дата</option>
            <option value="action">По действие</option>
            <option value="entity_type">По обект</option>
            <option value="admin_name">По админ</option>
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

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
        <input
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="Търси по действие, обект, админ, IP..."
          className="input-dark pl-11"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-16 rounded-lg" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-[var(--text-muted)] text-center py-10">Няма записи</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Админ</th>
                <th>Действие</th>
                <th>Обект</th>
                <th>Цел</th>
                <th>IP</th>
                <th>Детайли</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="text-xs text-[var(--text-muted)] whitespace-nowrap">{formatDate(item.created_at)}</td>
                  <td>
                    <div>{item.admin_name || '—'}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {item.admin_discord_username ? `@${item.admin_discord_username}` : '—'}
                    </div>
                  </td>
                  <td className="font-mono text-xs">{item.action}</td>
                  <td>
                    <div className="font-medium">{item.entity_type}</div>
                    <div className="text-xs text-[var(--text-muted)]">{item.entity_id || '—'}</div>
                  </td>
                  <td>
                    <div>{item.target_name || '—'}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {item.target_discord_username ? `@${item.target_discord_username}` : '—'}
                    </div>
                  </td>
                  <td className="text-xs font-mono">{item.ip_address || '—'}</td>
                  <td className="min-w-[320px]">
                    <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                      {formatMetadata(item.metadata)}
                    </pre>
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
    </div>
  );
}
