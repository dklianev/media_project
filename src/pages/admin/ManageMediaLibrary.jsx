import { motion } from '@/lib/motion';
import MediaLibraryBrowser from '../../components/MediaLibraryBrowser';

export default function ManageMediaLibrary() {
  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold">Media Library</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-2">
          Централизирано хранилище за всички качени изображения. Оттук можеш да качваш нови файлове и да преизползваш съществуващите URL-и.
        </p>
      </motion.div>

      <MediaLibraryBrowser
        title="Библиотека със снимки"
        subtitle="Всички upload-и, минали през системата, се регистрират тук и могат да се използват повторно в admin формите."
      />
    </div>
  );
}
