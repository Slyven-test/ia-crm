const normalizeBase = (value: string): string => {
  const trimmed = value.replace(/\/+$/, '') || '/api';

  if (trimmed.startsWith('http')) {
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }

  return trimmed;
};

const rawBase =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.VITE_API_URL as string | undefined) ??
  '/api';

export const API_BASE_URL = normalizeBase(rawBase);

export default API_BASE_URL;
