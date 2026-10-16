/**
 * API client.
 *
 * Every call carries `credentials: 'include'` so the HttpOnly session cookie rides
 * along. The browser holds no token and never talks to a database.
 *
 * API_BASE is empty by default, so requests are same-origin — the mode the Worker uses
 * when it serves the SPA itself. Building with VITE_API_BASE set to the Worker's URL
 * makes every call absolute, so the SPA can be hosted on a different origin (e.g. static
 * files on shared hosting) and still reach the API. That cross-origin mode needs the
 * Worker configured with WEB_ORIGIN — see apps/api/src/index.ts.
 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues?: Array<{ path: (string | number)[]; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    credentials: 'include',
    headers:
      init.body instanceof FormData
        ? init.headers
        : { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get('Content-Type')?.includes('application/json');
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const base =
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${response.status})`;
    const issues =
      typeof body === 'object' && body && 'issues' in body
        ? (body as { issues: Array<{ path: (string | number)[]; message: string }> }).issues
        : undefined;

    // "Validation failed" alone is useless to the person filling in the form —
    // fold the field paths into the message so they know what to correct.
    const message = issues?.length
      ? `${base}: ${issues
          .map((issue) => `${issue.path.join('.') || 'request'} — ${issue.message}`)
          .join('; ')}`
      : base;

    throw new ApiError(message, response.status, issues);
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) =>
    request<T>(path, { method: 'POST', body: form }),
};

/** Triggers a browser download for an authenticated endpoint. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api${path}`, { credentials: 'include' });
  if (!response.ok) throw new ApiError('Download failed', response.status);

  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = match?.[1] ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
