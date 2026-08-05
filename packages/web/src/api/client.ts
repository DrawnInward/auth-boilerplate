const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface ApiError {
  status: number;
  message: string;
  errors?: Array<{ field: string; message: string; code: string }>;
}

// Single-flight refresh: however many requests hit a 401 together, exactly
// one exchange of the refresh cookie goes out and every caller awaits it.
// Firing one per request is what raced rotations of the same cookie
// server-side (S1).
let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    // The slot must clear only after the exchange settles — a still-pending
    // promise is what concurrent callers share, and a settled one must not
    // answer a 401 that arrives minutes later.
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function doFetch(endpoint: string, options: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${endpoint}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  let res = await doFetch(endpoint, options);

  // Only the auth middleware's uniform 401 means "session expired" — it is
  // sent before any handler runs, so the retry is safe for every verb. A 401
  // minted inside a handler (wrong login password, wrong MFA code) must
  // surface untouched: retrying would silently re-submit the attempt and burn
  // its rate-limit or MFA-attempt budget. A failed refresh falls through to
  // the original 401.
  if (res.status === 401 && endpoint !== "/auth/refresh") {
    const body = await res
      .clone()
      .json()
      .catch(() => null);
    if (body?.message === "Credentials missing" && (await refreshSession())) {
      res = await doFetch(endpoint, options);
    }
  }

  const data = await res.json();

  if (!res.ok) {
    const error: ApiError = {
      status: res.status,
      message: data.message || "An error occurred",
      errors: data.errors,
    };
    throw error;
  }

  return data;
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    apiClient<T>(endpoint, { ...options, method: "GET" }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    apiClient<T>(endpoint, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    apiClient<T>(endpoint, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    apiClient<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string, options?: RequestInit) =>
    apiClient<T>(endpoint, { ...options, method: "DELETE" }),
};
