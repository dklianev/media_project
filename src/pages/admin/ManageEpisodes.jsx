import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Eye,
  Filter,
  Pencil,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../utils/api';
import AdminPagination from '../../components/AdminPagination';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { useToastContext } from '../../context/ToastContext';
import {
  formatSofiaLocalDateTime,
  isFutureSofiaLocalDateTime,
  toSofiaLocalDateTimeInputValue,
} from '../../utils/formatters';

const ACCESS_OPTIONS = [
  { value: 'inherit', label: 'Наследи от продукцията' },
  { value: 'free', label: 'Безплатно' },
  { value: 'trailer', label: 'Трейлър' },
  { value: 'subscription', label: 'С абонамент' },
];

function accessLabel(value) {
  return ACCESS_OPTIONS.find((item) => item.value === value)?.label || 'Наследи от продукцията';
}

export default function ManageEpisodes() {
  const [episodes, setEpisodes] = useState([]);
  const [productions, setProductions] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToastContext();
  const [search, setSearch] = useState('');
  const [filterProd, setFilterProd] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortBy, setSortBy] = useState('episode_number');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalViews, setTotalViews] = useState(0);
  const [workingId, setWorkingId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const thumbnailRef = useRef();
  const adBannerRef = useRef();
  const sideImagesRef = useRef();
  const fetchSeq = useRef(0);

  const [form, setForm] = useState({
    production_id: '',
    title: '',
    description: '',
    youtube_video_id: '',
    side_text: '',
    ad_banner_link: '',
    access_group: 'inherit',
    episode_number: '1',
    duration_seconds: '',
    is_active: true,
    published_at: '',
  });

  const fetchProductions = async () => {
    try {
      const data = await api.get('/productions/admin/all?page=1&page_size=300&sort_by=sort_order&sort_dir=asc');
      setProductions(data.items || []);
    } catch (err) {
      showToast(err.message || 'Неуспешно зареждане на продукциите', 'error');
    }
  };

  const fetchEpisodes = () => {
    const seq = ++fetchSeq.current;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    params.set('sort_by', sortBy);
    params.set('sort_dir', sortDir);
    if (search.trim()) params.set('q', search.trim());
    if (filterProd !== 'all') params.set('production_id', filterProd);
    if (groupFilter !== 'all') params.set('access_group', groupFilter);
    if (activeFilter !== 'all') params.set('is_active', activeFilter);

    setLoading(true);
    api.get(`/episodes/admin/all?${params.toString()}`)
      .then((data) => {
        if (seq !== fetchSeq.current) return;
        setEpisodes(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setTotalViews(data.summary?.total_views || 0);
      })
      .catch((err) => {
        if (seq !== fetchSeq.current) return;
        showToast(err.message || 'Неуспешно зареждане на епизодите', 'error');
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });
  };

  useEffect(() => {
    fetchProductions();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(fetchEpisodes, 220);
    return () => window.clearTimeout(timer);
  }, [page, pageSize, search, filterProd, groupFilter, activeFilter, sortBy, sortDir]);

  const resetForm = () => {
    setForm({
      production_id: '',
      title: '',
      description: '',
      youtube_video_id: '',
      side_text: '',
      ad_banner_link: '',
      access_group: 'inherit',
      episode_number: '1',
      duration_seconds: '',
      is_active: true,
      published_at: '',
    });
    setEditing(null);
    [thumbnailRef, adBannerRef, sideImagesRef].forEach((ref) => {
      if (ref.current) ref.current.value = '';
    });
  };

  const startEdit = (episode) => {
    setEditing(episode.id);
    setForm({
      production_id: String(episode.production_id),
      title: episode.title,
      description: episode.description || '',
      youtube_video_id: episode.youtube_video_id || '',
      side_text: episode.side_text || '',
      ad_banner_link: episode.ad_banner_link || '',
      access_group: episode.access_group || 'inherit',
      episode_number: String(episode.episode_number || 1),
      duration_seconds: episode.duration_seconds ? String(episode.duration_seconds) : '',
      is_active: !!episode.is_active,
      published_at: toSofiaLocalDateTimeInputValue(episode.published_at),
    });
    [thumbnailRef, adBannerRef, sideImagesRef].forEach((ref) => {
      if (ref.current) ref.current.value = '';
    });
  };

  const handleSave = async () => {
    if (!form.production_id) {
      showToast('Избери продукция за епизода', 'error');
      return;
    }
    if (!form.title || form.title.trim().length < 2) {
      showToast('Заглавието е задължително', 'error');
      return;
    }

    const fd = new FormData();
    fd.append('production_id', String(form.production_id));
    fd.append('title', form.title);
    fd.append('description', form.description);
    fd.append('youtube_video_id', form.youtube_video_id);
    fd.append('side_text', form.side_text);
    fd.append('ad_banner_link', form.ad_banner_link);
    fd.append('access_group', form.access_group);
    fd.append('episode_number', form.episode_number);
    fd.append('is_active', String(form.is_active));
    if (form.duration_seconds) fd.append('duration_seconds', form.duration_seconds);
    if (form.published_at) fd.append('published_at', form.published_at);

    if (thumbnailRef.current?.files[0]) fd.append('thumbnail', thumbnailRef.current.files[0]);
    if (adBannerRef.current?.files[0]) fd.append('ad_banner', adBannerRef.current.files[0]);
    if (sideImagesRef.current?.files) {
      Array.from(sideImagesRef.current.files).forEach((file) => fd.append('side_images', file));
    }

    try {
      if (editing) {
        await api.upload(`/episodes/admin/${editing}`, fd, 'PUT');
        showToast('Епизодът е обновен');
      } else {
        await api.upload('/episodes/admin', fd);
        showToast('Епизодът е създаден');
      }
      resetForm();
      fetchEpisodes();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setWorkingId(deleteId);
    try {
      await api.delete(`/episodes/admin/${deleteId}`);
      showToast('Епизодът е изтрит');
      setDeleteId(null);
      fetchEpisodes();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWorkingId(null);
    }
  };

  const reorderEpisode = async (id, direction) => {
    setWorkingId(id);
    try {
      await api.put(`/episodes/admin/${id}/reorder`, { direction });
      fetchEpisodes();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-wrap items-center justify-between gap-3 mb-6"
      >
        <h1 className="text-2xl font-bold">Епизоди</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Общо гледания (текущ филтър):{' '}
          <span className="text-[var(--accent-gold-light)] font-semibold">
            {Number(totalViews || 0).toLocaleString('bg-BG')}
          </span>
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="glass-card p-5 sm:p-6 mb-8"
      >
        <h2 className="text-lg font-semibold mb-6">{editing ? 'Редактирай епизод' : 'Нов епизод'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.production_id} onChange={(e) => setForm({ ...form, production_id: e.target.value })} className="input-dark">
            <option value="">-- Продукция --</option>
            {productions.map((production) => <option key={production.id} value={production.id}>{production.title}</option>)}
          </select>
          <input
            value={form.episode_number}
            onChange={(e) => setForm({ ...form, episode_number: e.target.value })}
            placeholder="Номер на епизода"
            type="number"
            className="input-dark"
          />
          <select
            value={form.access_group}
            onChange={(e) => setForm({ ...form, access_group: e.target.value })}
            className="input-dark"
          >
            {ACCESS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Заглавие"
            className="input-dark"
          />
          <input
            value={form.youtube_video_id}
            onChange={(e) => setForm({ ...form, youtube_video_id: e.target.value })}
            placeholder="Видео ID от YouTube"
            className="input-dark md:col-span-2"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Описание"
            className="input-dark md:col-span-2"
            rows={2}
          />
          <textarea
            value={form.side_text}
            onChange={(e) => setForm({ ...form, side_text: e.target.value })}
            placeholder="Текст до видеото"
            className="input-dark md:col-span-2"
            rows={2}
          />
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Кадър</label>
            <input type="file" ref={thumbnailRef} accept="image/*" className="input-dark text-sm" />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Рекламен банер</label>
            <input type="file" ref={adBannerRef} accept="image/*" className="input-dark text-sm" />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Снимки до видеото (до 5)</label>
            <input type="file" ref={sideImagesRef} accept="image/*" multiple className="input-dark text-sm" />
          </div>
          <input
            value={form.ad_banner_link}
            onChange={(e) => setForm({ ...form, ad_banner_link: e.target.value })}
            placeholder="Линк на рекламата (по желание)"
            className="input-dark"
          />
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Продълж. (секунди)</label>
            <input
              value={form.duration_seconds}
              onChange={(e) => setForm({ ...form, duration_seconds: e.target.value })}
              placeholder="напр. 2700"
              type="number"
              min="0"
              className="input-dark"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Активен
          </label>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">
              Планирано публикуване (по желание)
            </label>
            <input
              type="datetime-local"
              value={form.published_at}
              onChange={(e) => setForm({ ...form, published_at: e.target.value })}
              className="input-dark text-sm"
            />
            {form.published_at && isFutureSofiaLocalDateTime(form.published_at) && (
              <p className="text-[10px] text-[var(--warning)] mt-1">
                Ще бъде видим след {formatSofiaLocalDateTime(form.published_at)}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <motion.button whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} onClick={handleSave} className="btn-gold flex items-center gap-2">
            <Save className="w-4 h-4" /> {editing ? 'Запази' : 'Създай'}
          </motion.button>
          {editing && <motion.button whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} onClick={resetForm} className="btn-outline flex items-center gap-2"><X className="w-4 h-4" /> Откажи</motion.button>}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-2 mb-4">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Търси епизод..."
            className="input-dark pl-11"
          />
        </div>

        <select
          value={filterProd}
          onChange={(e) => {
            setPage(1);
            setFilterProd(e.target.value);
          }}
          className="input-dark py-1.5 px-3 text-sm w-auto"
        >
          <option value="all">Всички продукции</option>
          {productions.map((production) => (
            <option key={production.id} value={production.id}>{production.title}</option>
          ))}
        </select>

        <select
          value={groupFilter}
          onChange={(e) => {
            setPage(1);
            setGroupFilter(e.target.value);
          }}
          className="input-dark py-1.5 px-3 text-sm w-auto"
        >
          <option value="all">Всички категории</option>
          <option value="inherit">Наследени</option>
          <option value="free">Безплатни</option>
          <option value="trailer">Трейлъри</option>
          <option value="subscription">С абонамент</option>
        </select>

        <select
          value={activeFilter}
          onChange={(e) => {
            setPage(1);
            setActiveFilter(e.target.value);
          }}
          className="input-dark py-1.5 px-3 text-sm w-auto"
        >
          <option value="all">Всички статуси</option>
          <option value="1">Активни</option>
          <option value="0">Скрити</option>
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
            <option value="episode_number">По номер</option>
            <option value="created_at">По дата</option>
            <option value="view_count">По гледания</option>
            <option value="title">По заглавие</option>
          </select>
          <select
            value={sortDir}
            onChange={(e) => {
              setPage(1);
              setSortDir(e.target.value);
            }}
            className="input-dark py-1.5 px-3 text-sm w-auto"
          >
            <option value="asc">Възходящо</option>
            <option value="desc">Низходящо</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>
      ) : episodes.length === 0 ? (
        <p className="text-[var(--text-muted)] text-center py-10">Няма епизоди</p>
      ) : (
        <div className="space-y-3">
          {episodes.map((episode, index) => (
            <motion.div
              key={episode.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.03, ease: [0.16, 1, 0.3, 1] }}
              className="glass-card p-4 flex items-center gap-4"
            >
              {episode.thumbnail_url && (
                <img
                  src={episode.thumbnail_url}
                  alt={episode.title ? `Кадър от ${episode.title}` : 'Кадър от епизод'}
                  loading="lazy"
                  decoding="async"
                  className="w-16 h-10 rounded object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold truncate">{episode.title}</h3>
                  <span className="text-xs text-[var(--text-muted)]">Еп. {episode.episode_number}</span>
                  <span className="badge badge-gold text-[10px]">{accessLabel(episode.access_group)}</span>
                  {episode.access_group === 'inherit' && (
                    <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      {accessLabel(episode.production_access_group)}
                    </span>
                  )}
                  {!episode.is_active && <span className="badge bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30 text-[10px]">Скрит</span>}
                  {episode.published_at && isFutureSofiaLocalDateTime(episode.published_at) && (
                    <span className="badge bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/30 text-[10px] inline-flex items-center gap-0.5">
                      <Calendar className="w-3 h-3" />
                      Планиран
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)]">{episode.production_title}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1 text-xs text-[var(--text-muted)] mr-1">
                  <Eye className="w-3.5 h-3.5" /> {Number(episode.view_count || 0).toLocaleString('bg-BG')}
                </span>
                <motion.button
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  onClick={() => reorderEpisode(episode.id, 'up')}
                  disabled={workingId === episode.id}
                  className="admin-icon-btn disabled:opacity-50"
                  title="Нагоре"
                >
                  <ArrowUp className="w-4 h-4 text-[var(--text-secondary)]" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  onClick={() => reorderEpisode(episode.id, 'down')}
                  disabled={workingId === episode.id}
                  className="admin-icon-btn disabled:opacity-50"
                  title="Надолу"
                >
                  <ArrowDown className="w-4 h-4 text-[var(--text-secondary)]" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  onClick={() => startEdit(episode)}
                  className="admin-icon-btn"
                  aria-label="Редактирай епизод"
                >
                  <Pencil className="w-4 h-4 text-[var(--text-secondary)]" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  onClick={() => setDeleteId(episode.id)}
                  disabled={workingId === episode.id}
                  className="admin-icon-btn disabled:opacity-50"
                  aria-label="Изтрий епизод"
                >
                  <Trash2 className="w-4 h-4 text-[var(--danger)]" />
                </motion.button>
              </div>
            </motion.div>
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
        title="Изтриване на епизод"
        message="Сигурни ли сте, че искате да изтриете този епизод?"
        confirmLabel="Изтрий"
        cancelLabel="Назад"
        tone="danger"
        loading={workingId === deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
      />


    </div>
  );
}
