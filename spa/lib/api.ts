type ApiErrorPayload = {
  status: number;
  message: string;
  data?: unknown;
};

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.status = payload.status;
    this.data = payload.data;
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";
const ACCESS_TOKEN_KEY = "ia_crm_access_token";

let accessToken: string | null = null;

function loadStoredToken() {
  if (accessToken) return;
  if (typeof window === "undefined") return;
  accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

function storeToken(token: string | null) {
  accessToken = token;
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isJsonBody(
  value: unknown
): value is Record<string, unknown> | unknown[] {
  if (!value || typeof value !== "object") return false;
  if (typeof FormData !== "undefined" && value instanceof FormData) return false;
  if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams)
    return false;
  if (typeof Blob !== "undefined" && value instanceof Blob) return false;
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer)
    return false;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value))
    return false;
  if (typeof ReadableStream !== "undefined" && value instanceof ReadableStream)
    return false;
  return isPlainObject(value) || Array.isArray(value);
}

type HeaderInitInput = HeadersInit | { headers?: HeadersInit };

function buildHeaders(input?: HeaderInitInput) {
  const initHeaders =
    input && typeof input === "object" && "headers" in input
      ? (input as { headers?: HeadersInit }).headers
      : (input as HeadersInit | undefined);
  const headers = new Headers(initHeaders ?? {});
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  return headers;
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || typeof value === "undefined") return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const detail = record.detail ?? record.message ?? record.error;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((item) => stringifyUnknown(item)).filter(Boolean).join(" ");
    }
    if (detail && typeof detail === "object") {
      return stringifyUnknown(detail);
    }
    const fallbackMessage = stringifyUnknown(data);
    return fallbackMessage || fallback;
  }
  return fallback;
}

async function refreshToken() {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) return null;
  const data = await parseResponse(response);
  if (data && typeof data === "object" && "access_token" in data) {
    const token = (data as { access_token?: string }).access_token ?? null;
    if (token) storeToken(token);
    return token;
  }
  return null;
}

type ApiRequestBody = BodyInit | Record<string, unknown> | unknown[] | null;

type ApiRequestOptions = Omit<RequestInit, "body" | "headers"> & {
  headers?: HeadersInit;
  body?: ApiRequestBody;
  timeoutMs?: number;
  skipAuth?: boolean;
  skipRefresh?: boolean;
};

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  loadStoredToken();
  const {
    body,
    headers: headersInit,
    timeoutMs = 15_000,
    skipAuth,
    skipRefresh,
    ...rest
  } = options;
  const headers = buildHeaders(headersInit);
  const normalizedBody =
    typeof body === "undefined"
      ? null
      : isJsonBody(body)
        ? JSON.stringify(body)
        : body;

  if (body && isJsonBody(body) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (!skipAuth && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers,
      credentials: "include",
      signal: controller.signal,
      body: normalizedBody,
    });

    if (response.status === 401 && !skipRefresh) {
      const refreshed = await refreshToken();
      if (refreshed) {
        return apiRequest<T>(path, { ...options, skipRefresh: true });
      }
      storeToken(null);
    }

    const data = await parseResponse(response);
    if (!response.ok) {
      throw new ApiError({
        status: response.status,
        message: formatErrorMessage(
          data,
          response.statusText || "Request failed"
        ),
        data,
      });
    }

    if (
      data &&
      typeof data === "object" &&
      "access_token" in data &&
      typeof (data as { access_token?: string }).access_token === "string"
    ) {
      storeToken((data as { access_token?: string }).access_token ?? null);
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError({
      status: 0,
      message: error instanceof Error ? error.message : "Network error",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function clearStoredToken() {
  storeToken(null);
}
