import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, setTokens, getTokens, clearTokens, tryRestoreSession } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const initRef = useRef(false);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    let tokens = getTokens();
    if (!tokens.access_token) {
      const restored = await tryRestoreSession();
      if (!restored) {
        setLoading(false);
        return;
      }
      tokens = getTokens();
    }

    try {
      const userData = await api.get('/auth/me');
      setUser(userData);
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    fetchUser();
  }, [fetchUser]);

  const login = useCallback((accessToken) => {
    setTokens(accessToken);
    return fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {});
    } catch { }
    clearTokens();
    setUser(null);
  }, []);

  const updateCharacterName = useCallback(async (characterName) => {
    const result = await api.post('/auth/character-name', { character_name: characterName });
    setUser((prev) => ({ ...prev, character_name: result.character_name }));
    return result;
  }, []);

  const refreshUser = useCallback(async () => {
    await fetchUser();
  }, [fetchUser]);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const isSuperAdmin = user?.role === 'superadmin';
  const userTier = user?.tier_level || 0;

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout, updateCharacterName, refreshUser,
      isAdmin, isSuperAdmin, userTier,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
