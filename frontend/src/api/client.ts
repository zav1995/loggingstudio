// Typed fetch wrapper. Talks to the backend through the /api prefix that the
// frontend nginx (and the Vite dev proxy) forward to the Go server.

import type { ZodType } from 'zod';

const API_BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly detail?: string;
  // body carries any additional fields the backend returned alongside
  // {error, detail} — useful for 409 conflicts that include the stored row.
  readonly body?: unknown;

  constructor(status: number, message: string, detail?: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.body = body;
  }
}

type RequestOptions<T> = Omit<RequestInit, 'body'> & {
  body?: unknown;
  schema?: ZodType<T>;
};

async function request<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const { body, schema, headers, ...rest } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    let errorBody: { error?: string; detail?: string } & Record<string, unknown> = {};
    try {
      errorBody = (await res.json()) as typeof errorBody;
    } catch {
      // body wasn't JSON — fall back to a generic message
    }
    throw new ApiError(
      res.status,
      errorBody.error ?? `HTTP ${res.status}`,
      errorBody.detail,
      errorBody,
    );
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  const data = (await res.json()) as unknown;
  if (schema) {
    return schema.parse(data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, schema?: ZodType<T>) =>
    request<T>(path, { method: 'GET', schema }),
  post: <T>(path: string, body: unknown, schema?: ZodType<T>) =>
    request<T>(path, { method: 'POST', body, schema }),
  patch: <T>(path: string, body: unknown, schema?: ZodType<T>) =>
    request<T>(path, { method: 'PATCH', body, schema }),
  put: <T>(path: string, body: unknown, schema?: ZodType<T>) =>
    request<T>(path, { method: 'PUT', body, schema }),
  delete: <T>(path: string, schema?: ZodType<T>) =>
    request<T>(path, { method: 'DELETE', schema }),
};
