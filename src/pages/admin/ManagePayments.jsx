import { useEffect, useRef, useState } from 'react';
import { Ban, Check, Clock, Filter, Search, Trash2, XCircle } from 'lucide-react';
import { api } from '../../utils/api';
import AdminPagination from '../../components/AdminPagination';
import { formatDate, formatMoney } from '../../utils/formatters';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { useToastContext } from '../../context/ToastContext';

function statusLabel(status) {
  if (status === 'confirmed') return 'Потвърдено';
  if (status === 'rejected') return 'Отказано';
  if (status === 'cancelled') return 'Анулирано';
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

export default function ManagePayments() {
  const [payments, setPayments] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);
  const [modal, setModal] = useState({ type: null, paymentId: null });
  const { showToast } = useToastContext();
  const fetchSeq = useRef(0);

  const fetchPayments = () => {
    const seq = ++fetchSeq.current;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    params.set('sort_by', sortBy);
    params.set('sort_dir', sortDir);
    if (filter !== 'all') params.set('status', filter);
    if (search.trim()) params.set('q', search.trim());

    setLoading(true);
    api.get(`/admin/payments?${params.toString()}`)
      .then((data) => {
        if (seq !== fetchSeq.current) return;
        setPayments(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
      })
      .catch((err) => {
        if (seq !== fetchSeq.current) return;
        showToast(err.message || 'Неуспешно зареждане на плащанията', 'error');
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });
  };

  useEffect(() => {
    const timer = window.setTimeout(fetchPayments, 300);
    return () => window.clearTimeout(timer);
  }, [page, pageSize, filter, search, sortBy, sortDir]);

  const confirmPayment = async (id) => {
    setWorkingId(id);
    try {
      await api.put(`/admin/payments/${id}/confirm`);
      showToast('Плащането е потвърдено и абонаментът е активиран');
      fetchPayments();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWorkingId(null);
    }
  };

  const rejectPayment = async (reasonText) => {
    if (!modal.paymentId) return;
    setWorkingId(modal.paymentId);
    try {
      await api.put(`/admin/payments/${modal.paymentId}/reject`, { reason: reasonText.trim() || undefined });
      showToast('Плащането е отказано');
      setModal({ type: null, paymentId: null });
      fetchPayments();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWorkingId(null);
    }
  };

  const deletePayment = async () => {
    if (!modal.paymentId) return;
    setWorkingId(modal.paymentId);
    try {
      await api.delete(`/admin/payments/${modal.paymentId}`);
      showToast('Плащането е изтрито');
      setModal({ type: null, paymentId: null });
      fetchPayments();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Плащания (основания)</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-[var(--text-muted)]" />
          <select value={filter} onChange={(e) => { setPage(1); setFilter(e.target.value); }} className="input-dark py-1.5 px-3 text-sm w-auto">
            <option value="all">Всички</option>
            <option value="pending">Чакащи</option>
            <option value="confirmed">Потвърдени</option>
            <option value="rejected">Отказани</option>
            <option value="cancelled">Анулирани</option>
          </select>
          <select value={sortBy} onChange={(e) => { setPage(1); setSortBy(e.target.value); }} className="input-dark py-1.5 px-3 text-sm w-auto">
            <option value="created_at">По дата</option>
            <option value="final_price">По крайна сума</option>
            <option value="status">По статус</option>
          </select>
          <select value={sortDir} onChange={(e) => { setPage(1); setSortDir(e.target.value); }} className="input-dark py-1.5 px-3 text-sm w-auto">
            <option value="desc">Низходящо</option>
            <option value="asc">Възходящо</option>
          </select>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
        <input
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          placeholder="Търси по основание, потребител или план..."
          className="input-dark pl-11"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16 rounded-lg" />)}
        </div>
      ) : payments.length === 0 ? (
        <p className="text-[var(--text-muted)] text-center py-10">Няма плащания</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Основание</th>
                  <th>Потребител</th>
                  <th>План</th>
                  <th>Оригинална цена</th>
                  <th>Отстъпка</th>
                  <th>Крайна цена</th>
                  <th>Промо</th>
                  <th>Статус</th>
                  <th>Дата</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const Icon = statusIcon(payment.status);
                  const isPending = payment.status === 'pending';
                  return (
                    <tr key={payment.id}>
                      <td className="font-mono font-bold text-[var(--accent-gold)]">{payment.reference_code}</td>
                      <td>
                        <div>{payment.character_name || '—'}</div>
                        <div className="text-xs text-[var(--text-muted)]">{payment.discord_username ? `@${payment.discord_username}` : '—'}</div>
                      </td>
                      <td>{payment.plan_name}</td>
                      <td>{formatMoney(payment.original_price)}</td>
                      <td>{payment.discount_percent > 0 ? `${payment.discount_percent}%` : '—'}</td>
                      <td className="font-semibold">{formatMoney(payment.final_price)}</td>
                      <td>{payment.promo_code_used || '—'}</td>
                      <td>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${statusClass(payment.status)}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {statusLabel(payment.status)}
                        </span>
                      </td>
                      <td className="text-xs text-[var(--text-muted)]">{formatDate(payment.created_at)}</td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          {isPending && (
                            <>
                              <button onClick={() => confirmPayment(payment.id)} disabled={workingId === payment.id} className="btn-gold text-xs py-1 px-3">Потвърди</button>
                              <button onClick={() => setModal({ type: 'reject', paymentId: payment.id })} disabled={workingId === payment.id} className="btn-outline text-xs py-1 px-3 border-[var(--danger)]/60 text-[var(--danger)]">Откажи</button>
                            </>
                          )}
                          <button onClick={() => setModal({ type: 'delete', paymentId: payment.id })} disabled={workingId === payment.id} className="btn-outline text-xs py-1 px-2 border-[var(--danger)]/60 text-[var(--danger)] inline-flex items-center gap-1">
                            <Trash2 className="w-3.5 h-3.5" /> Изтрий
                          </button>
                        </div>
                        {!isPending && (
                          <div className="text-xs text-[var(--text-muted)] mt-2 space-y-1">
                            {payment.confirmed_by_name && <p>Потвърдено от: {payment.confirmed_by_name}</p>}
                            {payment.rejected_by_name && <p>Отказано от: {payment.rejected_by_name}</p>}
                            {payment.rejection_reason && <p>Причина: {payment.rejection_reason}</p>}
                            {payment.cancelled_reason && <p>Анулирано от клиент: {payment.cancelled_reason}</p>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card view */}
          <div className="lg:hidden space-y-3">
            {payments.map((payment) => {
              const Icon = statusIcon(payment.status);
              const isPending = payment.status === 'pending';
              return (
                <div key={payment.id} className="glass-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono font-bold text-[var(--accent-gold)] text-sm">{payment.reference_code}</p>
                      <p className="text-sm font-medium mt-0.5">{payment.character_name || '—'}</p>
                      <p className="text-xs text-[var(--text-muted)]">{payment.discord_username ? `@${payment.discord_username}` : ''}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${statusClass(payment.status)}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {statusLabel(payment.status)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">План</p>
                      <p className="font-medium">{payment.plan_name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Крайна цена</p>
                      <p className="font-semibold">{formatMoney(payment.final_price)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Дата</p>
                      <p>{formatDate(payment.created_at)}</p>
                    </div>
                  </div>

                  {payment.discount_percent > 0 && (
                    <p className="text-xs text-[var(--text-muted)]">Отстъпка: {payment.discount_percent}% {payment.promo_code_used ? `(${payment.promo_code_used})` : ''}</p>
                  )}

                  {!isPending && (
                    <div className="text-xs text-[var(--text-muted)] space-y-0.5">
                      {payment.confirmed_by_name && <p>Потвърдено от: {payment.confirmed_by_name}</p>}
                      {payment.rejected_by_name && <p>Отказано от: {payment.rejected_by_name}</p>}
                      {payment.rejection_reason && <p>Причина: {payment.rejection_reason}</p>}
                      {payment.cancelled_reason && <p>Анулирано от клиент: {payment.cancelled_reason}</p>}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
                    {isPending && (
                      <>
                        <button onClick={() => confirmPayment(payment.id)} disabled={workingId === payment.id} className="btn-gold text-xs py-1 px-3">Потвърди</button>
                        <button onClick={() => setModal({ type: 'reject', paymentId: payment.id })} disabled={workingId === payment.id} className="btn-outline text-xs py-1 px-3 border-[var(--danger)]/60 text-[var(--danger)]">Откажи</button>
                      </>
                    )}
                    <button onClick={() => setModal({ type: 'delete', paymentId: payment.id })} disabled={workingId === payment.id} className="btn-outline text-xs py-1 px-2 border-[var(--danger)]/60 text-[var(--danger)] inline-flex items-center gap-1 ml-auto">
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
        onPageSizeChange={(nextSize) => { setPage(1); setPageSize(nextSize); }}
      />

      <ConfirmActionModal
        open={modal.type === 'reject'}
        title="Отказ на плащане"
        message="Плащането ще бъде маркирано като отказано. По желание добави причина."
        confirmLabel="Откажи плащането"
        cancelLabel="Назад"
        tone="danger"
        withReason
        reasonLabel="Причина (по желание)"
        reasonPlaceholder="Напр. Грешна сума или липсващ превод"
        loading={workingId === modal.paymentId}
        onClose={() => setModal({ type: null, paymentId: null })}
        onConfirm={rejectPayment}
      />

      <ConfirmActionModal
        open={modal.type === 'delete'}
        title="Изтриване на плащане"
        message="Това действие е необратимо. Сигурни ли сте, че искате да изтриете записа?"
        confirmLabel="Изтрий"
        cancelLabel="Назад"
        tone="danger"
        loading={workingId === modal.paymentId}
        onClose={() => setModal({ type: null, paymentId: null })}
        onConfirm={deletePayment}
      />


    </div>
  );
}
