const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const SESSION_KEY = 'leaseiq.session';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

export function setSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function expireSession() {
  setSession(null);
  window.dispatchEvent(new Event('auth:expired'));
}

async function parseResponse(res) {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data;
}

let refreshing = null;

// Returns a usable access token, refreshing it first if it is about to expire.
async function getAccessToken() {
  const session = getSession();
  if (!session) return null;

  const expiresSoon = session.expires_at && session.expires_at * 1000 - Date.now() < 60_000;
  if (!expiresSoon) return session.access_token;

  refreshing ??= fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  })
    .then(parseResponse)
    .then((next) => {
      setSession(next);
      return next.access_token;
    })
    .catch(() => {
      expireSession();
      return null;
    })
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
}

export async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getAccessToken();
    if (!token) throw new ApiError('Not signed in', 401);
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && auth) expireSession();
  return parseResponse(res);
}

// XHR instead of fetch so the UI can show upload progress.
export async function uploadLease(formData, onProgress) {
  const token = await getAccessToken();
  if (!token) throw new ApiError('Not signed in', 401);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/leases/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let data = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        // non-JSON response
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      if (xhr.status === 401) expireSession();
      reject(new ApiError(data?.error || `Upload failed (${xhr.status})`, xhr.status));
    };

    xhr.onerror = () => reject(new ApiError('Network error — is the API running on port 3000?', 0));
    xhr.send(formData);
  });
}
