import { useEffect, useRef, useState } from 'react';
import { Ban, Check, Clock, CreditCard, Filter, Search, Trash2, XCircle } from 'lucide-react';
import { api } from '../../utils/api';
import AdminPagination from '../../components/AdminPagination';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { formatDate, formatMoney } from '../../utils/formatters';
import { useToastContext } from '../../context/ToastContext';

function statusLabel(status) {
  if (status === 'confirmed') return 'Потвърдена';
  if (status === 'rejected') return 'Отказана';
  if (status === 'cancelled') return 'Отменена';
  return 'Чака';
}

function statusIcon(status) {
  if (status === 'confirmed') return Check;
  if (status === 'rejected') return XCircle;
  if (status === 'cancelled') return Ban;
  return Clock;
}

function statusClass(status) {
  if (status === 'confirmed') return 'text-[var(--success)]';
  if (status === 'rejected') return 'text-[var(--danger)]';
  if (status === 'cancelled') return 'text-[var(--text-muted)]';
  return 'text-[var(--warning)]';
}

function targetTypeLabel(targetType) {
  return targetType === 'episode' ? 'Епизод' : 'Продукция';
}

function targetTitle(item) {
  if (item.target_type === 'episode') {
    const episodeLabel = item.episode_number ? `Еп. ${item.episode_number}` : 'Епизод';
    return `${item.production_title || '-'} - ${episodeLabel}`;
  }
  return item.target_title || item.production_title || '-';
}

function targetSubtitle(item) {
  if (item.target_type === 'episode') {
    return item.target_title || '-';
  }
  return item.production_slug ? `/${item.production_slug}` : '';
}

export default function ManageContentPurchases() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [targetType, setTargetType] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);
  const [modal, setModal] = useState({ type: null, purchaseId: null });
  const { showToast } = useToastContext();
  const fetchSeq = useRef(0);

  const fetchItems = () => {
    const seq = ++fetchSeq.current;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    params.set('sort_by', sortBy);
    params.set('sort_dir', sortDir);
    if (filter !== 'all') params.set('status', filter);
    if (targetType !== 'all') params.set('target_type', targetType);
    if (search.trim()) params.set('q', search.trim());

    setLoading(true);
    api.get(`/content-purchases/admin?${params.toString()}`)
      .then((data) => {
        if (seq !== fetchSeq.current) return;
        setItems(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
      })
      .catch((err) => {
        if (seq !== fetchSeq.current) return;
        showToast(err.message || 'Неуспешно зареждане на покупките.', 'error');
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });
  };

  useEffect(() => {
    const timer = window.setTimeout(fetchItems, 300);
    return () => window.clearTimeout(timer);
  }, [page, pageSize, filter, targetType, search, sortBy, sortDir]);

  const confirmPurchase = async (id) => {
    setWorkingId(id);
    try {
      await api.put(`/content-purchases/admin/${id}/confirm`);
      showToast('Покупката е потвърдена.');
      fetchItems();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWorkingId(null);
    }
  };

  const rejectPurchase = async (reasonText) => {
    if (!modal.purchaseId) return;
    setWorkingId(modal.purchaseId);
    try {
      await api.put(`/content-purchases/admin/${modal.purchaseId}/reject`, {
        reason: reasonText.trim() || undefined,
      });
      showToast('Покупката е отказана.');
      setModal({ type: null, purchaseId: null });
      fetchItems();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWorkingId(null);
    }
  };

  const deletePurchase = async () => {
    if (!modal.purchaseId) return;
    setWorkingId(modal.purchaseId);
    try {
      await api.delete(`/content-purchases/admin/${modal.purchaseId}`);
      showToast('Покупката е изтрита.');
      setModal({ type: null, purchaseId: null });
      fetchItems();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Покупки на съдържание</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-[var(--text-muted)]" />
          <select
            value={filter}
            onChange={(e) => {
              setPage(1);
              setFilter(e.target.value);
            }}
            className="input-dark py-1.5 px-3 text-sm w-auto"
          >
            <option value="all">Всички статуси</option>
            <option value="pending">Чакащи</option>
            <option value="confirmed">Потвърдени</option>
            <option value="rejected">Отказани</option>
            <option value="cancelled">Отменени</option>
          </select>
          <select
            value={targetType}
            onChange={(e) => {
              setPage(1);
              setTargetType(e.target.value);
            }}
            className="input-dark py-1.5 px-3 text-sm w-auto"
          >
            <option value="all">Всички типове</option>
            <option value="production">Продукции</option>
            <option value="episode">Епизоди</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => {
              setPage(1);
              setSortBy(e.target.value);
            }}
            className="input-dark py-1.5 px-3 text-sm w-auto"
          >
            <option value="created_at">По дата</option>
            <option value="final_price">По цена</option>
            <option value="status">По статус</option>
            <option value="target_type">По тип</option>
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
          placeholder="Търси по референция, потребител или заглавие..."
          className="input-dark pl-11"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, index) => (
            <div key={index} className="skeleton h-16 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <CreditCard className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-[var(--text-muted)]">Няма намерени content purchases.</p>
        </div>
      ) : (
        <>
          <div className="hidden lg:block overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Референция</th>
                  <th>Потребител</th>
                  <th>Съдържание</th>
                  <th>Тип</th>
                  <th>Цена</th>
                  <th>Статус</th>
                  <th>Дата</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const Icon = statusIcon(item.status);
                  const isPending = item.status === 'pending';
                  return (
                    <tr key={item.id}>
                      <td className="font-mono font-bold text-[var(--accent-gold)]">{item.reference_code}</td>
                      <td>
                        <div>{item.character_name || '-'}</div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {item.discord_username ? `@${item.discord_username}` : '-'}
                        </div>
                      </td>
                      <td>
                        <div>{targetTitle(item)}</div>
                        {targetSubtitle(item) && (
                          <div className="text-xs text-[var(--text-muted)]">{targetSubtitle(item)}</div>
                        )}
                      </td>
                      <td>{targetTypeLabel(item.target_type)}</td>
                      <td className="font-semibold">{formatMoney(item.final_price)}</td>
                      <td>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${statusClass(item.status)}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td className="text-xs text-[var(--text-muted)]">{formatDate(item.created_at)}</td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          {isPending && (
                            <>
                              <button
                                onClick={() => confirmPurchase(item.id)}
                                disabled={workingId === item.id}
                                className="btn-gold text-xs py-1 px-3"
                              >
                                Потвърди
                              </button>
                              <button
                                onClick={() => setModal({ type: 'reject', purchaseId: item.id })}
                                disabled={workingId === item.id}
                                className="btn-outline text-xs py-1 px-3 border-[var(--danger)]/60 text-[var(--danger)]"
                              >
                                Откажи
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setModal({ type: 'delete', purchaseId: item.id })}
                            disabled={workingId === item.id}
                            className="btn-outline text-xs py-1 px-2 border-[var(--danger)]/60 text-[var(--danger)] inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Изтрий
                          </button>
                        </div>
                        {!isPending && (
                          <div className="text-xs text-[var(--text-muted)] mt-2 space-y-1">
                            {item.confirmed_by_name && <p>Потвърдена от: {item.confirmed_by_name}</p>}
                            {item.rejected_by_name && <p>Отказана от: {item.rejected_by_name}</p>}
                            {item.rejection_reason && <p>Причина: {item.rejection_reason}</p>}
                            {item.cancelled_reason && <p>Отменена: {item.cancelled_reason}</p>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden space-y-3">
            {items.map((item) => {
              const Icon = statusIcon(item.status);
              const isPending = item.status === 'pending';
              return (
                <div key={item.id} className="glass-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono font-bold text-[var(--accent-gold)] text-sm">{item.reference_code}</p>
                      <p className="text-sm font-medium mt-0.5">{targetTitle(item)}</p>
                      <p className="text-xs text-[var(--text-muted)]">{targetSubtitle(item)}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${statusClass(item.status)}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {statusLabel(item.status)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Потребител</p>
                      <p className="font-medium">{item.character_name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Тип</p>
                      <p>{targetTypeLabel(item.target_type)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Цена</p>
                      <p className="font-semibold">{formatMoney(item.final_price)}</p>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--text-muted)]">Дата: {formatDate(item.created_at)}</p>

                  {!isPending && (
                    <div className="text-xs text-[var(--text-muted)] space-y-0.5">
                      {item.confirmed_by_name && <p>Потвърдена от: {item.confirmed_by_name}</p>}
                      {item.rejected_by_name && <p>Отказана от: {item.rejected_by_name}</p>}
                      {item.rejection_reason && <p>Причина: {item.rejection_reason}</p>}
                      {item.cancelled_reason && <p>Отменена: {item.cancelled_reason}</p>}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
                    {isPending && (
                      <>
                        <button
                          onClick={() => confirmPurchase(item.id)}
                          disabled={workingId === item.id}
                          className="btn-gold text-xs py-1 px-3"
                        >
                          Потвърди
                        </button>
                        <button
                          onClick={() => setModal({ type: 'reject', purchaseId: item.id })}
                          disabled={workingId === item.id}
                          className="btn-outline text-xs py-1 px-3 border-[var(--danger)]/60 text-[var(--danger)]"
                        >
                          Откажи
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setModal({ type: 'delete', purchaseId: item.id })}
                      disabled={workingId === item.id}
                      className="btn-outline text-xs py-1 px-2 border-[var(--danger)]/60 text-[var(--danger)] inline-flex items-center gap-1 ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Изтрий
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
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
        open={modal.type === 'reject'}
        title="Отказ на покупка"
        message="Покупката ще бъде маркирана като отказана. По желание можеш да добавиш причина."
        confirmLabel="Откажи покупката"
        cancelLabel="Назад"
        tone="danger"
        withReason
        reasonLabel="Причина (по желание)"
        reasonPlaceholder="Например: невалидно плащане"
        loading={workingId === modal.purchaseId}
        onClose={() => setModal({ type: null, purchaseId: null })}
        onConfirm={rejectPurchase}
      />

      <ConfirmActionModal
        open={modal.type === 'delete'}
        title="Изтриване на покупка"
        message="Това ще премахне purchase заявката, а ако е била потвърдена ще премахне и entitlement-а."
        confirmLabel="Изтрий"
        cancelLabel="Назад"
        tone="danger"
        loading={workingId === modal.purchaseId}
        onClose={() => setModal({ type: null, purchaseId: null })}
        onConfirm={deletePurchase}
      />
    </div>
  );
}
