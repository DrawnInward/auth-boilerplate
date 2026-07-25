const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface ApiError {
  status: number;
  message: string;
  errors?: Array<{ field: string; message: string; code: string }>;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

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
