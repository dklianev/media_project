import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getPublicSettings } from '../utils/settings';
import PageBackground from '../components/PageBackground';

export default function CharacterNamePage() {
  const { user, updateCharacterName } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [s, setS] = useState({});

  useEffect(() => {
    getPublicSettings().then((data) => setS(data || {})).catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.character_name) {
      navigate('/');
    }
  }, [navigate, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Името трябва да е поне 2 символа.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await updateCharacterName(trimmed);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Възникна грешка при запис.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-10 flex items-center justify-center">
      <div className="absolute inset-0" style={{ background: 'var(--gradient-hero)' }} />
      <PageBackground variant="hero" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-lg"
      >
        <div className="glass-card p-8 sm:p-10">
          <div className="flex items-center gap-4 mb-6">
            {user?.discord_avatar ? (
              <img
                src={user.discord_avatar}
                alt={user?.discord_username ? `Аватар на ${user.discord_username}` : 'Потребителски аватар'}
                className="w-16 h-16 rounded-2xl border border-[var(--accent-gold)]/45 object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-[var(--bg-tertiary)] border border-[var(--border)] flex items-center justify-center">
                <UserRound className="w-8 h-8 text-[var(--accent-gold)]" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold">{s.character_name_title || 'Профилно име'}</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                {s.character_name_subtitle || 'Това име ще се вижда в цялата платформа.'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="text-sm text-[var(--text-secondary)] block mb-2">
              Публично име
            </label>
            <input
              type="text"
              autoFocus
              maxLength={50}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="напр. Николай Иванов"
              className="input-dark"
            />

            {error && (
              <p className="mt-3 text-sm text-[var(--danger)] rounded-lg border border-[var(--danger)]/45 bg-[var(--danger)]/10 px-3 py-2">
                {error}
              </p>
            )}

            <motion.button
              type="submit"
              disabled={loading || name.trim().length < 2}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="btn-gold w-full mt-5 inline-flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-[#10131d] border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Запази и продължи
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
