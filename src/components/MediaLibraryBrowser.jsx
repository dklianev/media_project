import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, ImagePlus, RefreshCw, Search, Upload, Check } from 'lucide-react';
import { api } from '../utils/api';
import AdminPagination from './AdminPagination';
import { useToastContext } from '../context/ToastContext';
import { useUploadActivity } from '../context/UploadActivityContext';

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return 'Без дата';
  const parsed = new Date(String(value).replace(' ', 'T') + 'Z');
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('bg-BG');
}

export default function MediaLibraryBrowser({
  selectionMode = 'none',
  selectedUrls = [],
  onPick,
  onToggle,
  onUploaded,
  title = 'Media Library',
  subtitle = 'Качи и използвай вече обработени изображения.',
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const fileRef = useRef(null);
  const { showToast } = useToastContext();
  const { isUploading, runWithUploadLock } = useUploadActivity();

  const selectedSet = useMemo(() => new Set(selectedUrls || []), [selectedUrls]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('page_size', String(pageSize));
      params.set('sort_by', 'created_at');
      params.set('sort_dir', 'desc');
      if (search.trim()) params.set('q', search.trim());
      const data = await api.get(`/admin/media?${params.toString()}`);
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      showToast(err.message || 'Неуспешно зареждане на media library.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchItems();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [page, pageSize, search]);

  const handleUpload = async () => {
    const files = fileRef.current?.files ? Array.from(fileRef.current.files) : [];
    if (files.length === 0) {
      showToast('Избери поне едно изображение.', 'warning');
      return;
    }

    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    setUploading(true);
    try {
      const result = await runWithUploadLock(
        () => api.upload('/admin/media', formData),
        'Обработваме и записваме изображението в media library...'
      );
      if (fileRef.current) fileRef.current.value = '';
      showToast(`Качени ${result.items?.length || files.length} изображения.`);
      if (typeof onUploaded === 'function') {
        onUploaded(result.items || []);
      }
      await fetchItems();
    } catch (err) {
      showToast(err.message || 'Неуспешно качване на изображения.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleCopy = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('URL адресът е копиран.');
    } catch {
      showToast('Неуспешно копиране на URL адреса.', 'error');
    }
  };

  const isSelected = (url) => selectedSet.has(url);

  return (
    <div className="glass-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 mb-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={fetchItems}
            disabled={loading || isUploading}
            className="btn-outline inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Обнови
          </button>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/55 p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1">
              <label className="text-sm text-[var(--text-muted)] block mb-2">Качи изображения</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                disabled={uploading || isUploading}
                className="input-dark text-sm"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading || isUploading}
                className="btn-gold inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {uploading || isUploading ? 'Обработка...' : 'Качи'}
              </button>
            </div>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Търси по име, source или URL..."
            className="input-dark pl-11"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="skeleton h-64 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-secondary)]/35 px-5 py-12 text-center text-[var(--text-secondary)]">
          <ImagePlus className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" />
          Няма намерени изображения.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => {
            const selected = isSelected(item.url);
            return (
              <article
                key={item.id}
                className={`rounded-2xl border bg-[var(--bg-secondary)]/55 overflow-hidden transition-colors ${
                  selected
                    ? 'border-[var(--accent-gold)] shadow-[0_0_0_1px_rgba(212,175,55,0.2)]'
                    : 'border-[var(--border)]'
                }`}
              >
                <div className="relative aspect-[16/10] bg-[var(--bg-primary)]">
                  <img
                    src={item.url}
                    alt={item.original_name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                  {selected && (
                    <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-gold)] text-[#080a12]">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <p className="font-medium truncate">{item.original_name}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{item.url}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
                    <div>
                      <span className="text-[var(--text-muted)]">Размер</span>
                      <p>{formatBytes(item.size_bytes)}</p>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Резолюция</span>
                      <p>{item.width && item.height ? `${item.width}x${item.height}` : 'n/a'}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[var(--text-muted)]">Качено</span>
                      <p>{formatDate(item.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(item.url)}
                      className="btn-outline inline-flex items-center gap-2 !px-3 !py-2 text-xs"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Копирай URL
                    </button>
                    {selectionMode === 'single' && (
                      <button
                        type="button"
                        onClick={() => onPick?.(item)}
                        className="btn-gold inline-flex items-center gap-2 !px-3 !py-2 text-xs"
                      >
                        Използвай
                      </button>
                    )}
                    {selectionMode === 'multiple' && (
                      <button
                        type="button"
                        onClick={() => onToggle?.(item)}
                        className="btn-gold inline-flex items-center gap-2 !px-3 !py-2 text-xs"
                      >
                        {selected ? 'Премахни' : 'Избери'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-5">
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
    </div>
  );
}
