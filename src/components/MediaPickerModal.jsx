import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, X } from 'lucide-react';
import MediaLibraryBrowser from './MediaLibraryBrowser';

export default function MediaPickerModal({
  open,
  onClose,
  title,
  selectionMode = 'single',
  value,
  onConfirm,
  maxItems = 5,
}) {
  const [selectedUrls, setSelectedUrls] = useState([]);

  useEffect(() => {
    if (!open) return;
    if (selectionMode === 'multiple') {
      setSelectedUrls(Array.isArray(value) ? value : []);
      return;
    }
    setSelectedUrls(value ? [value] : []);
  }, [open, selectionMode, value]);

  const handleSinglePick = (item) => {
    onConfirm?.(item.url);
    onClose?.();
  };

  const handleToggle = (item) => {
    setSelectedUrls((current) => {
      const exists = current.includes(item.url);
      if (exists) {
        return current.filter((url) => url !== item.url);
      }
      if (current.length >= maxItems) {
        return current;
      }
      return [...current, item.url];
    });
  };

  const handleConfirmMultiple = () => {
    onConfirm?.(selectedUrls);
    onClose?.();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9997] bg-[rgba(2,4,10,0.76)] backdrop-blur-sm px-3 py-5 sm:px-6"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto flex max-h-[92vh] w-full max-w-[calc(100%-1rem)] sm:max-w-6xl flex-col overflow-hidden rounded-[24px] border border-[var(--border-light)] bg-[var(--bg-primary)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6">
              <div>
                <div className="pill-chip mb-2 w-fit">
                  <ImagePlus className="w-3.5 h-3.5" />
                  Media Library
                </div>
                <h2 className="text-xl font-semibold">{title}</h2>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  {selectionMode === 'multiple'
                    ? `Избери до ${maxItems} изображения от библиотеката.`
                    : 'Избери вече обработено изображение или качи ново.'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="admin-icon-btn"
                aria-label="Затвори media library"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              <MediaLibraryBrowser
                title="Всички изображения"
                subtitle="Всички файлове в media library вече са минали през upload pipeline и могат да се използват повторно."
                selectionMode={selectionMode}
                selectedUrls={selectedUrls}
                onPick={handleSinglePick}
                onToggle={handleToggle}
              />
            </div>

            {selectionMode === 'multiple' && (
              <div className="flex flex-col gap-3 border-t border-white/8 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-sm text-[var(--text-secondary)]">
                  Избрани: <span className="font-semibold text-[var(--accent-gold-light)]">{selectedUrls.length}</span>
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={onClose} className="btn-outline">Откажи</button>
                  <button
                    type="button"
                    onClick={handleConfirmMultiple}
                    className="btn-gold"
                  >
                    Използвай избраните
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
