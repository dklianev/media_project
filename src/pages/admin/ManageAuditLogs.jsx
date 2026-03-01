import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../../utils/api';
import AdminPagination from '../../components/AdminPagination';
import { formatDateTime } from '../../utils/formatters';

const ACTION_MAP = {
  'payment.confirm': 'Потвърдено плащане',
  'payment.reject': 'Отказано плащане',
  'payment.cancel': 'Анулирано плащане',
  'payment.delete': 'Изтрито плащане',
  'user.update_tier': 'Промяна на абонамент',
  'user.ban': 'Блокиран потребител',
  'user.unban': 'Разблокиран потребител',
  'settings.update': 'Промяна на настройки',
  'production.create': 'Добавена продукция',
  'production.update': 'Редактирана продукция',
  'production.delete': 'Изтрита продукция',
  'episode.create': 'Добавен епизод',
  'episode.update': 'Редактиран епизод',
  'episode.delete': 'Изтрит епизод',
  'comment.status.update': 'Промяна статус на коментар',
  'comment.delete': 'Скриване на коментар (софт)',
  'comment.hard_delete': 'Окончателно изтриване на коментар',
  'promo_code.create': 'Създаден промо код',
  'promo_code.update': 'Редактиран промо код',
  'promo_code.delete': 'Изтрит промо код',
  'plan.create': 'Създаден план',
  'plan.update': 'Редактиран план',
  'plan.delete': 'Изтрит план',
  'admin.login': 'Админ вход'
};

const ENTITY_MAP = {
  'payment_reference': 'Плащане',
  'user': 'Потребител',
  'site_settings': 'Настройки',
  'production': 'Продукция',
  'episode': 'Епизод',
  'comment': 'Коментар',
  'promo_code': 'Промо код',
  'subscription_plan': 'Абонаментен план',
  'admin': 'Администратор'
};

function translateAction(action) {
  return ACTION_MAP[action] || action;
}

function translateEntity(entity) {
  return ENTITY_MAP[entity] || entity;
}

function formatMetadata(metadata) {
  if (!metadata) return <span className="text-[var(--text-muted)]">—</span>;
  try {
    const obj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    if (Object.keys(obj).length === 0) return <span className="text-[var(--text-muted)]">—</span>;
    return (
      <div className="space-y-0.5 mt-1">
        {Object.entries(obj).map(([key, val]) => (
          <div key={key} className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2 text-[11px] leading-relaxed">
            <span className="text-[var(--text-muted)] opacity-80 sm:w-32 shrink-0">{key}:</span>
            <span className="text-[var(--accent-gold-light)] break-all font-mono">
              {typeof val === 'object' ? JSON.stringify(val) : String(val)}
            </span>
          </div>
        ))}
      </div>
    );
  } catch {
    return <span className="text-[var(--text-secondary)]">{String(metadata)}</span>;
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
                  <td className="text-xs text-[var(--text-muted)] whitespace-nowrap">{formatDateTime(item.created_at)}</td>
                  <td>
                    <div>{item.admin_name || '—'}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {item.admin_discord_username ? `@${item.admin_discord_username}` : '—'}
                    </div>
                  </td>
                  <td>
                    <div className="font-semibold text-sm">{translateAction(item.action)}</div>
                    <div className="text-[10px] font-mono text-[var(--text-muted)] opacity-60 uppercase">{item.action}</div>
                  </td>
                  <td>
                    <div className="font-medium">{translateEntity(item.entity_type)}</div>
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
                    <div className="bg-[var(--bg-tertiary)]/50 rounded-md p-2 m-1 border border-[var(--border)]/50">
                      {formatMetadata(item.metadata)}
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
    </div>
  );
}
