import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      navigate('/login?error=' + error);
      return;
    }

    if (!code) {
      navigate('/login');
      return;
    }

    api.post('/auth/exchange', { code })
      .then((tokens) => login(tokens.access_token))
      .then(() => navigate('/'))
      .catch(() => navigate('/login?error=invalid_exchange'));
  }, [params, login, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-[3px] border-[var(--accent-gold)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
