const API_BASE = '/api';

let accessToken = null;
let isRefreshing = false;
let refreshQueue = [];
if (typeof window !== 'undefined' && window.sessionStorage) {
  window.sessionStorage.removeItem('access_token');
}

export function setTokens(access) {
  accessToken = access || null;
}

export function getTokens() {
  return {
    access_token: accessToken,
  };
}

export function clearTokens() {
  accessToken = null;
}

export async function refreshAccessToken() {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!res.ok) {
    clearTokens();
    throw new Error('Refresh failed');
  }

  const data = await res.json();
  if (!data?.access_token) {
    clearTokens();
    throw new Error('Invalid refresh payload');
  }

  setTokens(data.access_token);
  return data.access_token;
}

export async function tryRestoreSession() {
  if (getTokens().access_token) return true;
  try {
    await refreshAccessToken();
    return true;
  } catch {
    return false;
  }
}

export async function api(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  let didRetry = Boolean(options._retried);

  const headers = { ...options.headers };
  const tokens = getTokens();

  if (tokens.access_token) {
    headers.Authorization = `Bearer ${tokens.access_token}`;
  }

  // Don't set Content-Type for FormData
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const config = {
    ...options,
    headers,
    credentials: options.credentials ?? 'include',
  };

  // Stringify body if it's an object (not FormData)
  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  let res = await fetch(url, config);

  // Auto-refresh on 401
  const canAttemptRefresh = Boolean(tokens.access_token);
  const isRefreshEndpoint = endpoint === '/auth/refresh' || url.endsWith('/auth/refresh');
  if (res.status === 401 && canAttemptRefresh && !isRefreshEndpoint && !didRetry) {
    didRetry = true;
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        await refreshAccessToken();
        isRefreshing = false;
        refreshQueue.forEach((cb) => cb());
        refreshQueue = [];
      } catch {
        isRefreshing = false;
        refreshQueue.forEach((cb) => cb());
        refreshQueue = [];
        clearTokens();
        window.location.href = '/login';
        throw new Error('Session expired');
      }
    } else {
      await new Promise((resolve) => refreshQueue.push(resolve));
    }

    // Retry with new token
    const newTokens = getTokens();
    const retryHeaders = { ...headers };
    if (newTokens.access_token) {
      retryHeaders.Authorization = `Bearer ${newTokens.access_token}`;
    }
    res = await fetch(url, { ...config, headers: retryHeaders });
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Грешка в сървъра' }));
    const err = new Error(error.error || 'Грешка');
    err.status = res.status;
    err.data = error;
    throw err;
  }

  return res.json();
}

// Convenience methods
api.get = (endpoint, options = {}) => api(endpoint, options);
api.post = (endpoint, body, options = {}) => api(endpoint, { ...options, method: 'POST', body });
api.put = (endpoint, body, options = {}) => api(endpoint, { ...options, method: 'PUT', body });
api.delete = (endpoint, options = {}) => api(endpoint, { ...options, method: 'DELETE' });
api.upload = (endpoint, formData, method = 'POST', options = {}) =>
  api(endpoint, { ...options, method, body: formData });
api.uploadPut = (endpoint, formData, options = {}) =>
  api(endpoint, { ...options, method: 'PUT', body: formData });
