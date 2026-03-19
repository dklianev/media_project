import { motion } from '@/lib/motion';

export default function AdBanner({ imageUrl, link }) {
  if (!imageUrl) return null;

  const content = (
    <motion.img
      src={imageUrl}
      alt="Реклама"
      loading="lazy"
      decoding="async"
      className="w-full rounded-xl object-cover max-h-36 border border-[var(--border)] shadow-premium-sm hover:border-[var(--accent-gold)]/25 transition-[border-color] duration-500"
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: 1.01 }}
    />
  );

  if (link) {
    return (
      <a href={link} target="_blank" rel="noopener noreferrer" className="block mb-4">
        {content}
      </a>
    );
  }

  return <div className="mb-4">{content}</div>;
}
