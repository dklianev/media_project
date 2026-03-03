import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Eye,
  EyeOff,
  Film,
  Filter,
  ImagePlus,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
  Youtube,
} from 'lucide-react';
import { api } from '../../utils/api';
import AdminPagination from '../../components/AdminPagination';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import MediaPickerModal from '../../components/MediaPickerModal';
import { useToastContext } from '../../context/ToastContext';
import { useUploadActivity } from '../../context/UploadActivityContext';
import {
  formatSofiaLocalDateTime,
  isFutureSofiaLocalDateTime,
  toSofiaLocalDateTimeInputValue,
} from '../../utils/formatters';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';

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
  const [saving, setSaving] = useState(false);
  const [mediaTarget, setMediaTarget] = useState(null);
  const [selectedSideImages, setSelectedSideImages] = useState([]);
  const [thumbnailUploadPreview, setThumbnailUploadPreview] = useState('');
  const [adBannerUploadPreview, setAdBannerUploadPreview] = useState('');
  const [sideImageUploadPreviews, setSideImageUploadPreviews] = useState([]);
  const thumbnailRef = useRef();
  const adBannerRef = useRef();
  const sideImagesRef = useRef();
  const fetchSeq = useRef(0);
  const videoFileRef = useRef();
  const { isUploading, runWithUploadLock } = useUploadActivity();

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
    thumbnail_url: '',
    ad_banner_url: '',
    video_source: 'youtube',
  });

  const [migrateModalId, setMigrateModalId] = useState(null);
  const [migrateYoutubeId, setMigrateYoutubeId] = useState('');

  const [initialFormState, setInitialFormState] = useState(JSON.stringify({
    ...form,
    side_images_urls: [],
  }));
  const hasPendingUploads = Boolean(
    thumbnailRef.current?.files?.length
    || adBannerRef.current?.files?.length
    || sideImagesRef.current?.files?.length
  );
  const isDirty = JSON.stringify({
    ...form,
    side_images_urls: selectedSideImages,
  }) !== initialFormState || hasPendingUploads;
  useUnsavedChanges(isDirty);

  useEffect(() => () => {
    if (thumbnailUploadPreview) URL.revokeObjectURL(thumbnailUploadPreview);
    if (adBannerUploadPreview) URL.revokeObjectURL(adBannerUploadPreview);
    sideImageUploadPreviews.forEach((preview) => URL.revokeObjectURL(preview));
  }, [thumbnailUploadPreview, adBannerUploadPreview, sideImageUploadPreviews]);

  const resetSinglePreview = (setter, currentValue) => {
    if (currentValue) URL.revokeObjectURL(currentValue);
    setter('');
  };

  const replaceSinglePreview = (setter, currentValue, file) => {
    if (currentValue) URL.revokeObjectURL(currentValue);
    setter(file ? URL.createObjectURL(file) : '');
  };

  const replaceMultiPreview = (files) => {
    sideImageUploadPreviews.forEach((preview) => URL.revokeObjectURL(preview));
    setSideImageUploadPreviews(files.map((file) => URL.createObjectURL(file)));
  };

  const thumbnailPreviewSrc = thumbnailUploadPreview || form.thumbnail_url || null;
  const adBannerPreviewSrc = adBannerUploadPreview || form.ad_banner_url || null;
  const sideImagePreviewSources = sideImageUploadPreviews.length > 0 ? sideImageUploadPreviews : selectedSideImages;
  const isActionLocked = saving || workingId !== null || isUploading;

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
    const initialState = {
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
      thumbnail_url: '',
      ad_banner_url: '',
      video_source: 'youtube',
    };
    setForm(initialState);
    setInitialFormState(JSON.stringify({
      ...initialState,
      side_images_urls: [],
    }));
    setEditing(null);
    setSelectedSideImages([]);
    [thumbnailRef, adBannerRef, sideImagesRef, videoFileRef].forEach((ref) => {
      if (ref.current) ref.current.value = '';
    });
    resetSinglePreview(setThumbnailUploadPreview, thumbnailUploadPreview);
    resetSinglePreview(setAdBannerUploadPreview, adBannerUploadPreview);
    replaceMultiPreview([]);
  };

  const startEdit = (episode) => {
    setEditing(episode.id);
    const newState = {
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
      thumbnail_url: episode.thumbnail_url || '',
      ad_banner_url: episode.ad_banner_url || '',
      video_source: episode.video_source || 'youtube',
      transcoding_status: episode.transcoding_status || null,
      local_video_url: episode.local_video_url || '',
    };
    let sidePreviews = [];
    try {
      const parsed = JSON.parse(episode.side_images || '[]');
      if (Array.isArray(parsed)) sidePreviews = parsed;
    } catch (e) { }

    setForm(newState);
    setInitialFormState(JSON.stringify({
      ...newState,
      side_images_urls: sidePreviews,
    }));

    [thumbnailRef, adBannerRef, sideImagesRef, videoFileRef].forEach((ref) => {
      if (ref.current) ref.current.value = '';
    });
    resetSinglePreview(setThumbnailUploadPreview, thumbnailUploadPreview);
    resetSinglePreview(setAdBannerUploadPreview, adBannerUploadPreview);
    replaceMultiPreview([]);
    setSelectedSideImages(sidePreviews);
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
    fd.append('video_source', form.video_source);
    fd.append('side_text', form.side_text);
    fd.append('ad_banner_link', form.ad_banner_link);
    fd.append('access_group', form.access_group);
    fd.append('episode_number', form.episode_number);
    fd.append('is_active', String(form.is_active));
    fd.append('thumbnail_url', form.thumbnail_url || '');
    fd.append('ad_banner_url', form.ad_banner_url || '');
    fd.append('side_images_urls', JSON.stringify(selectedSideImages));
    if (form.duration_seconds) fd.append('duration_seconds', form.duration_seconds);
    if (form.published_at) fd.append('published_at', form.published_at);

    if (thumbnailRef.current?.files[0]) fd.append('thumbnail', thumbnailRef.current.files[0]);
    if (adBannerRef.current?.files[0]) fd.append('ad_banner', adBannerRef.current.files[0]);
    if (sideImagesRef.current?.files) {
      Array.from(sideImagesRef.current.files).forEach((file) => fd.append('side_images', file));
    }
    if (form.video_source === 'local' && videoFileRef.current?.files?.[0]) {
      fd.append('video_file', videoFileRef.current.files[0]);
    }

    setSaving(true);
    try {
      await runWithUploadLock(
        () => (editing ? api.upload(`/episodes/admin/${editing}`, fd, 'PUT') : api.upload('/episodes/admin', fd)),
        'Обработваме изображенията за епизода...'
      );
      showToast(editing ? 'Епизодът е обновен' : 'Епизодът е създаден');
      resetForm();
      fetchEpisodes();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
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
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Продукция</label>
            <select value={form.production_id} onChange={(e) => setForm({ ...form, production_id: e.target.value })} className="input-dark">
              <option value="">-- Изберете продукция --</option>
              {productions.map((production) => <option key={production.id} value={production.id}>{production.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Номер на епизода <span className="text-xs opacity-70">(1, 2, 3...)</span></label>
            <input
              value={form.episode_number}
              onChange={(e) => setForm({ ...form, episode_number: e.target.value })}
              placeholder="напр. 1"
              type="number"
              className="input-dark"
            />
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Ниво на достъп</label>
            <select
              value={form.access_group}
              onChange={(e) => setForm({ ...form, access_group: e.target.value })}
              className="input-dark"
            >
              {ACCESS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Заглавие</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Въведете заглавие"
              className="input-dark"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-[var(--text-muted)] block mb-1">Източник на видео</label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => {
                  setForm({ ...form, video_source: 'youtube' });
                  if (videoFileRef.current) videoFileRef.current.value = '';
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${form.video_source !== 'local'
                  ? 'bg-red-600/20 text-red-400 border border-red-500/40'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border)] hover:border-red-500/30'
                  }`}
              >
                <Youtube className="w-4 h-4" />
                YouTube
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, video_source: 'local' })}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${form.video_source === 'local'
                  ? 'bg-[var(--accent-gold)]/20 text-[var(--accent-gold-light)] border border-[var(--accent-gold)]/40'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--accent-gold)]/30'
                  }`}
              >
                <Film className="w-4 h-4" />
                Локално видео
              </button>
            </div>
            {form.video_source === 'local' ? (
              <div className="space-y-2">
                <input
                  type="file"
                  ref={videoFileRef}
                  accept="video/mp4,video/webm,video/quicktime"
                  disabled={isActionLocked}
                  className="input-dark text-sm"
                />
                <p className="text-[10px] text-[var(--text-muted)]">
                  Максимален размер: 2 GB. Поддържани формати: MP4, WebM, MOV
                </p>
                {form.transcoding_status && (
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium ${form.transcoding_status === 'ready'
                    ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                    : form.transcoding_status === 'failed'
                      ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                      : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                    }`}>
                    {form.transcoding_status === 'ready' && '✅ Обработено'}
                    {form.transcoding_status === 'processing' && '⏳ Обработва се...'}
                    {form.transcoding_status === 'pending' && '⏳ В опашка...'}
                    {form.transcoding_status === 'failed' && '❌ Грешка'}
                  </div>
                )}
                {editing && form.video_source === 'local' && form.local_video_url && (
                  <button
                    type="button"
                    onClick={() => {
                      setMigrateModalId(editing);
                      setMigrateYoutubeId('');
                    }}
                    disabled={isActionLocked}
                    className="btn-outline inline-flex items-center gap-2 !px-3 !py-2 text-xs disabled:opacity-50 mt-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Мигрирай към YouTube
                  </button>
                )}
              </div>
            ) : (
              <input
                value={form.youtube_video_id}
                onChange={(e) => setForm({ ...form, youtube_video_id: e.target.value })}
                placeholder="напр. dQw4w9WgXcQ"
                className="input-dark"
              />
            )}
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-[var(--text-muted)] block mb-1">Описание</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Въведете описание на търсения епизод..."
              className="input-dark"
              rows={2}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-[var(--text-muted)] block mb-1">Текст до видеото <span className="text-xs opacity-70">(допълнително инфо)</span></label>
            <textarea
              value={form.side_text}
              onChange={(e) => setForm({ ...form, side_text: e.target.value })}
              placeholder="По желание..."
              className="input-dark"
              rows={2}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1 flex items-center justify-between">
              Кадър
              {thumbnailPreviewSrc && <span className="text-[10px] text-[var(--accent-primary)]">Preview</span>}
            </label>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                {thumbnailPreviewSrc && (
                  <img src={thumbnailPreviewSrc} alt="Thumbnail preview" className="w-16 h-10 object-cover rounded shadow-sm" />
                )}
                <input
                  type="file"
                  ref={thumbnailRef}
                  accept="image/*"
                  disabled={isActionLocked}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    replaceSinglePreview(setThumbnailUploadPreview, thumbnailUploadPreview, file);
                    if (file) {
                      setForm((current) => ({ ...current, thumbnail_url: '' }));
                    }
                  }}
                  className="input-dark text-sm flex-1"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setMediaTarget('thumbnail')} disabled={isActionLocked} className="btn-outline inline-flex items-center gap-2 !px-3 !py-2 text-xs disabled:opacity-50">
                  <ImagePlus className="w-3.5 h-3.5" />
                  От библиотеката
                </button>
                {thumbnailPreviewSrc && (
                  <button
                    type="button"
                    onClick={() => {
                      if (thumbnailRef.current) thumbnailRef.current.value = '';
                      resetSinglePreview(setThumbnailUploadPreview, thumbnailUploadPreview);
                      setForm((current) => ({ ...current, thumbnail_url: '' }));
                    }}
                    disabled={isActionLocked}
                    className="btn-outline !px-3 !py-2 text-xs disabled:opacity-50"
                  >
                    Изчисти
                  </button>
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1 flex items-center justify-between">
              Голямо изображение (по желание)
              {adBannerPreviewSrc && <span className="text-[10px] text-[var(--accent-primary)]">Preview</span>}
            </label>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                {adBannerPreviewSrc && (
                  <img src={adBannerPreviewSrc} alt="Ad banner preview" className="w-16 h-10 object-cover rounded shadow-sm" />
                )}
                <input
                  type="file"
                  ref={adBannerRef}
                  accept="image/*"
                  disabled={isActionLocked}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    replaceSinglePreview(setAdBannerUploadPreview, adBannerUploadPreview, file);
                    if (file) {
                      setForm((current) => ({ ...current, ad_banner_url: '' }));
                    }
                  }}
                  className="input-dark text-sm flex-1"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setMediaTarget('banner')} disabled={isActionLocked} className="btn-outline inline-flex items-center gap-2 !px-3 !py-2 text-xs disabled:opacity-50">
                  <ImagePlus className="w-3.5 h-3.5" />
                  От библиотеката
                </button>
                {adBannerPreviewSrc && (
                  <button
                    type="button"
                    onClick={() => {
                      if (adBannerRef.current) adBannerRef.current.value = '';
                      resetSinglePreview(setAdBannerUploadPreview, adBannerUploadPreview);
                      setForm((current) => ({ ...current, ad_banner_url: '' }));
                    }}
                    disabled={isActionLocked}
                    className="btn-outline !px-3 !py-2 text-xs disabled:opacity-50"
                  >
                    Изчисти
                  </button>
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1 flex items-center justify-between">
              Снимки до видеото (по желание, до 5)
              {sideImagePreviewSources.length > 0 && <span className="text-[10px] text-[var(--accent-primary)]">{sideImagePreviewSources.length} Previews</span>}
            </label>
            <div className="space-y-2">
              <input
                type="file"
                ref={sideImagesRef}
                accept="image/*"
                multiple
                disabled={isActionLocked}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  replaceMultiPreview(files);
                  if (files.length > 0) {
                    setSelectedSideImages([]);
                  }
                }}
                className="input-dark text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setMediaTarget('side')} disabled={isActionLocked} className="btn-outline inline-flex items-center gap-2 !px-3 !py-2 text-xs disabled:opacity-50">
                  <ImagePlus className="w-3.5 h-3.5" />
                  Избери до 5 от библиотеката
                </button>
                {sideImagePreviewSources.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (sideImagesRef.current) sideImagesRef.current.value = '';
                      replaceMultiPreview([]);
                      setSelectedSideImages([]);
                    }}
                    disabled={isActionLocked}
                    className="btn-outline !px-3 !py-2 text-xs disabled:opacity-50"
                  >
                    Изчисти
                  </button>
                )}
              </div>
            </div>
            {sideImagePreviewSources.length > 0 && (
              <div className="flex gap-2 mt-1 flex-wrap">
                {sideImagePreviewSources.map((src, i) => (
                  <img key={i} src={src} alt={`Side preview ${i + 1}`} className="w-10 h-10 object-cover rounded shadow-sm" />
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Линк на изображението (по желание)</label>
            <input
              value={form.ad_banner_link}
              onChange={(e) => setForm({ ...form, ad_banner_link: e.target.value })}
              placeholder="напр. https://example.com"
              className="input-dark"
            />
          </div>
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
          <motion.button whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} onClick={handleSave} disabled={isActionLocked} className="btn-gold flex items-center gap-2 disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? 'Запазване...' : editing ? 'Запази' : 'Създай'}
          </motion.button>
          {editing && <motion.button whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} onClick={resetForm} disabled={isActionLocked} className="btn-outline flex items-center gap-2 disabled:opacity-50"><X className="w-4 h-4" /> Откажи</motion.button>}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-2 mb-4 sticky top-[72px] bg-[var(--bg-primary)]/90 backdrop-blur z-30 py-3 border-b border-white/5 mx-[-16px] px-[16px]">
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
        <div className="glass-card p-10 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-4 text-[var(--text-muted)]">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold mb-2">Няма намерени епизоди</h3>
          <p className="text-[var(--text-muted)] max-w-sm">
            Все още няма добавени епизоди или не са намерени резултати за вашето търсене.
          </p>
        </div>
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
                  onClick={async () => {
                    try {
                      await api.put(`/episodes/admin/${episode.id}/status`, {
                        is_active: !episode.is_active,
                      });
                      fetchEpisodes();
                      showToast(episode.is_active ? 'Епизодът е скрит' : 'Епизодът е активен', 'success');
                    } catch (err) {
                      showToast(err.message, 'error');
                    }
                  }}
                  disabled={isActionLocked}
                  className={`admin-icon-btn ${episode.is_active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
                  title={episode.is_active ? 'Скрий' : 'Покажи'}
                >
                  {episode.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  onClick={() => reorderEpisode(episode.id, 'up')}
                  disabled={isActionLocked}
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
                  disabled={isActionLocked}
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
                  disabled={isActionLocked}
                  className="admin-icon-btn disabled:opacity-50"
                  aria-label="Редактирай епизод"
                >
                  <Pencil className="w-4 h-4 text-[var(--text-secondary)]" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  onClick={() => setDeleteId(episode.id)}
                  disabled={isActionLocked}
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

      <MediaPickerModal
        open={Boolean(mediaTarget)}
        title={
          mediaTarget === 'side'
            ? 'Избери странични изображения'
            : mediaTarget === 'banner'
              ? 'Избери голямо изображение'
              : 'Избери кадър за епизода'
        }
        selectionMode={mediaTarget === 'side' ? 'multiple' : 'single'}
        value={mediaTarget === 'side' ? selectedSideImages : mediaTarget === 'banner' ? form.ad_banner_url : form.thumbnail_url}
        maxItems={5}
        onClose={() => setMediaTarget(null)}
        onConfirm={(value) => {
          if (mediaTarget === 'side') {
            if (sideImagesRef.current) sideImagesRef.current.value = '';
            replaceMultiPreview([]);
            setSelectedSideImages(Array.isArray(value) ? value : []);
            return;
          }
          if (mediaTarget === 'banner') {
            if (adBannerRef.current) adBannerRef.current.value = '';
            resetSinglePreview(setAdBannerUploadPreview, adBannerUploadPreview);
            setForm((current) => ({ ...current, ad_banner_url: String(value || '') }));
            return;
          }
          if (thumbnailRef.current) thumbnailRef.current.value = '';
          resetSinglePreview(setThumbnailUploadPreview, thumbnailUploadPreview);
          setForm((current) => ({ ...current, thumbnail_url: String(value || '') }));
        }}
      />

      {/* Migrate to YouTube modal */}
      <ConfirmActionModal
        open={Boolean(migrateModalId)}
        title="Мигриране към YouTube"
        message={
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Въведи YouTube видео ID и локалният файл ще бъде изтрит.
            </p>
            <input
              value={migrateYoutubeId}
              onChange={(e) => setMigrateYoutubeId(e.target.value)}
              placeholder="напр. dQw4w9WgXcQ"
              className="input-dark"
            />
          </div>
        }
        confirmLabel="Мигрирай"
        cancelLabel="Назад"
        tone="warning"
        loading={workingId === migrateModalId}
        onClose={() => { setMigrateModalId(null); setMigrateYoutubeId(''); }}
        onConfirm={async () => {
          if (!migrateYoutubeId.trim()) {
            showToast('Въведи YouTube видео ID', 'error');
            return;
          }
          setWorkingId(migrateModalId);
          try {
            await api.post(`/episodes/admin/${migrateModalId}/migrate-to-youtube`, {
              youtube_video_id: migrateYoutubeId.trim(),
            });
            showToast('Епизодът е мигриран към YouTube');
            setMigrateModalId(null);
            setMigrateYoutubeId('');
            resetForm();
            fetchEpisodes();
          } catch (err) {
            showToast(err.message, 'error');
          } finally {
            setWorkingId(null);
          }
        }}
      />

    </div>
  );
}
