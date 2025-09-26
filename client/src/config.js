const normalizeBaseUrl = (value) => {
  if (!value) return undefined;
  return value.replace(/\/+$/u, '');
};

const resolveDefaultApiBase = () => {
  if (typeof window === 'undefined') {
    return 'http://localhost:4000';
  }

  const { protocol, hostname } = window.location;
  const safeProtocol = protocol === 'https:' ? 'https:' : 'http:';
  return `${safeProtocol}//${hostname}:4000`;
};

const envApiBase = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
const envSocketBase = normalizeBaseUrl(import.meta.env.VITE_SOCKET_URL);

export const API_BASE_URL = envApiBase || resolveDefaultApiBase();
export const SOCKET_URL = envSocketBase || API_BASE_URL;
