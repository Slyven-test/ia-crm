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

function buildHeaders(init?: RequestInit) {
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (
    init?.body &&
    typeof init.body === "object" &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
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

type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
  skipAuth?: boolean;
  skipRefresh?: boolean;
};

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  loadStoredToken();
  const { timeoutMs = 15_000, skipAuth, skipRefresh, ...init } = options;
  const headers = buildHeaders(init);

  if (!skipAuth && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      credentials: "include",
      signal: controller.signal,
      body:
        init.body &&
        typeof init.body === "object" &&
        !(init.body instanceof FormData)
          ? JSON.stringify(init.body)
          : init.body,
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
        message:
          (data && typeof data === "object" && "detail" in data
            ? String((data as { detail?: string }).detail)
            : response.statusText) || "Request failed",
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
