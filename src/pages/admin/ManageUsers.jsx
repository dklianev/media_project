import { useEffect, useRef, useState } from 'react';
import { Search, Ban, UserCheck, UserRound } from 'lucide-react';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import AdminPagination from '../../components/AdminPagination';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { useToastContext } from '../../context/ToastContext';
import { formatDate } from '../../utils/formatters';

export default function ManageUsers() {
  const { isSuperAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);
  const [modal, setModal] = useState({ type: null, userId: null, userName: '' });
  const { showToast } = useToastContext();
  const fetchSeq = useRef(0);

  const fetchPlans = async () => {
    try {
      const data = await api.get('/plans/admin/all?page=1&page_size=200&sort_by=sort_order&sort_dir=asc');
      setPlans(data.items || []);
    } catch (err) {
      showToast(err.message || 'Неуспешно зареждане на плановете', 'error');
    }
  };

  const fetchUsers = () => {
    const seq = ++fetchSeq.current;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    params.set('sort_by', sortBy);
    params.set('sort_dir', sortDir);
    if (search.trim()) params.set('q', search.trim());
    if (roleFilter !== 'all') params.set('role', roleFilter);

    setLoading(true);
    api.get(`/admin/users?${params.toString()}`)
      .then((data) => {
        if (seq !== fetchSeq.current) return;
        setUsers(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
      })
      .catch((err) => {
        if (seq !== fetchSeq.current) return;
        showToast(err.message || 'Неуспешно зареждане на потребителите', 'error');
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(fetchUsers, 300);
    return () => window.clearTimeout(timer);
  }, [page, pageSize, search, roleFilter, sortBy, sortDir]);

  const updateSubscription = async (userId, planId) => {
    try {
      await api.put(`/admin/users/${userId}/subscription`, { plan_id: planId ? Number.parseInt(planId, 10) : 0 });
      showToast('Абонаментът е обновен');
      fetchUsers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const updateRole = async (userId, role) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { role });
      showToast('Ролята е обновена');
      fetchUsers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleBan = async () => {
    if (!modal.userId) return;
    setWorkingId(modal.userId);
    try {
      await api.put(`/admin/users/${modal.userId}/ban`);
      showToast('Потребителят е забранен');
      setModal({ type: null, userId: null, userName: '' });
      fetchUsers();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWorkingId(null);
    }
  };

  const handleUnban = async () => {
    if (!modal.userId) return;
    setWorkingId(modal.userId);
    try {
      await api.put(`/admin/users/${modal.userId}/unban`);
      showToast('Забраната е премахната');
      setModal({ type: null, userId: null, userName: '' });
      fetchUsers();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWorkingId(null);
    }
  };

  const roleLabel = (role) => {
    if (role === 'superadmin') return 'Суперадмин';
    if (role === 'admin') return 'Админ';
    if (role === 'banned') return 'Забранен';
    return 'Потребител';
  };

  const roleBadgeClass = (role) => {
    if (role === 'superadmin') return 'badge-premium';
    if (role === 'admin') return 'badge-gold';
    if (role === 'banned') return 'bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30';
    return 'badge-free';
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Потребители</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 mb-4">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            placeholder="Търси по име..."
            className="input-dark pl-11"
          />
        </div>
        <select value={roleFilter} onChange={(e) => { setPage(1); setRoleFilter(e.target.value); }} className="input-dark py-1.5 px-3 text-sm w-auto">
          <option value="all">Всички роли</option>
          <option value="user">Потребител</option>
          <option value="admin">Админ</option>
          <option value="superadmin">Суперадмин</option>
          <option value="banned">Забранен</option>
        </select>
        <select value={sortBy} onChange={(e) => { setPage(1); setSortBy(e.target.value); }} className="input-dark py-1.5 px-3 text-sm w-auto">
          <option value="created_at">По регистрация</option>
          <option value="character_name">По име</option>
          <option value="role">По роля</option>
          <option value="updated_at">По последна промяна</option>
        </select>
        <select value={sortDir} onChange={(e) => { setPage(1); setSortDir(e.target.value); }} className="input-dark py-1.5 px-3 text-sm w-auto">
          <option value="desc">Низходящо</option>
          <option value="asc">Възходящо</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16 rounded-lg" />)}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Потребител</th>
                  <th>Платформен профил</th>
                  <th>Роля</th>
                  <th>Абонамент</th>
                  <th>Регистриран</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        {user.discord_avatar ? (
                          <img src={user.discord_avatar} alt={user.character_name ? `Аватар на ${user.character_name}` : 'Аватар'} loading="lazy" decoding="async" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                            <UserRound className="w-4 h-4 text-[var(--text-muted)]" />
                          </div>
                        )}
                        <span className="font-medium">{user.character_name || '—'}</span>
                      </div>
                    </td>
                    <td className="text-[var(--text-muted)]">
                      {user.discord_username ? `@${user.discord_username}` : '—'}
                    </td>
                    <td>
                      {isSuperAdmin && user.role !== 'banned' ? (
                        <select value={user.role} onChange={(e) => updateRole(user.id, e.target.value)} className="input-dark py-1 px-2 text-xs w-auto">
                          <option value="user">Потребител</option>
                          <option value="admin">Админ</option>
                          <option value="superadmin">Суперадмин</option>
                        </select>
                      ) : (
                        <span className={`badge ${roleBadgeClass(user.role)}`}>{roleLabel(user.role)}</span>
                      )}
                    </td>
                    <td>
                      <select value={user.subscription_plan_id || ''} onChange={(e) => updateSubscription(user.id, e.target.value)} className="input-dark py-1 px-2 text-xs w-auto">
                        <option value="">Безплатен</option>
                        {plans.map((plan) => (<option key={plan.id} value={plan.id}>{plan.name}</option>))}
                      </select>
                    </td>
                    <td className="text-xs text-[var(--text-muted)]">{formatDate(user.created_at)}</td>
                    <td>
                      {user.role === 'banned' ? (
                        <button onClick={() => setModal({ type: 'unban', userId: user.id, userName: user.character_name || user.discord_username || '—' })} className="flex items-center gap-1 text-xs text-[var(--success)] hover:underline">
                          <UserCheck className="w-3.5 h-3.5" /> Разбани
                        </button>
                      ) : user.role !== 'superadmin' && (
                        <button onClick={() => setModal({ type: 'ban', userId: user.id, userName: user.character_name || user.discord_username || '—' })} className="flex items-center gap-1 text-xs text-[var(--danger)] hover:underline">
                          <Ban className="w-3.5 h-3.5" /> Забрани
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {users.map((user) => (
              <div key={user.id} className="glass-card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  {user.discord_avatar ? (
                    <img src={user.discord_avatar} alt={user.character_name ? `Аватар на ${user.character_name}` : 'Аватар'} loading="lazy" decoding="async" className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                      <UserRound className="w-5 h-5 text-[var(--text-muted)]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{user.character_name || '—'}</p>
                    <p className="text-xs text-[var(--text-muted)]">{user.discord_username ? `@${user.discord_username}` : '—'}</p>
                  </div>
                  <span className={`badge ${roleBadgeClass(user.role)} text-[10px]`}>{roleLabel(user.role)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] mb-0.5">Абонамент</p>
                    <select value={user.subscription_plan_id || ''} onChange={(e) => updateSubscription(user.id, e.target.value)} className="input-dark py-1 px-2 text-xs w-full">
                      <option value="">Безплатен</option>
                      {plans.map((plan) => (<option key={plan.id} value={plan.id}>{plan.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] mb-0.5">Регистриран</p>
                    <p className="text-xs">{formatDate(user.created_at)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                  {isSuperAdmin && user.role !== 'banned' && (
                    <select value={user.role} onChange={(e) => updateRole(user.id, e.target.value)} className="input-dark py-1 px-2 text-xs w-auto">
                      <option value="user">Потребител</option>
                      <option value="admin">Админ</option>
                      <option value="superadmin">Суперадмин</option>
                    </select>
                  )}
                  <div className="ml-auto">
                    {user.role === 'banned' ? (
                      <button onClick={() => setModal({ type: 'unban', userId: user.id, userName: user.character_name || user.discord_username || '—' })} className="flex items-center gap-1 text-xs text-[var(--success)] hover:underline">
                        <UserCheck className="w-3.5 h-3.5" /> Разбани
                      </button>
                    ) : user.role !== 'superadmin' && (
                      <button onClick={() => setModal({ type: 'ban', userId: user.id, userName: user.character_name || user.discord_username || '—' })} className="flex items-center gap-1 text-xs text-[var(--danger)] hover:underline">
                        <Ban className="w-3.5 h-3.5" /> Забрани
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
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

      {/* Ban confirmation */}
      <ConfirmActionModal
        open={modal.type === 'ban'}
        title="Забрани потребител"
        message={`Сигурни ли сте, че искате да забраните „${modal.userName}"? Потребителят няма да може да влиза в платформата.`}
        confirmLabel="Забрани"
        cancelLabel="Отказ"
        tone="danger"
        loading={workingId === modal.userId}
        onClose={() => setModal({ type: null, userId: null, userName: '' })}
        onConfirm={handleBan}
      />

      {/* Unban confirmation */}
      <ConfirmActionModal
        open={modal.type === 'unban'}
        title="Премахни забрана"
        message={`Потвърдете премахването на забраната за „${modal.userName}".`}
        confirmLabel="Премахни забрана"
        cancelLabel="Отказ"
        loading={workingId === modal.userId}
        onClose={() => setModal({ type: null, userId: null, userName: '' })}
        onConfirm={handleUnban}
      />


    </div>
  );
}
