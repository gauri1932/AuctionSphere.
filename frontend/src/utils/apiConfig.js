const hostname = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
let rawUrl = import.meta.env.VITE_BACKEND_URL || `http://${hostname}:5000`;
if (rawUrl.endsWith('/')) {
  rawUrl = rawUrl.slice(0, -1);
}
export const BACKEND_URL = rawUrl;
export const API_URL = `${BACKEND_URL}/api`;

