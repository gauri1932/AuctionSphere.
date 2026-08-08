const hostname = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || `http://${hostname}:5000`;
export const API_URL = `${BACKEND_URL}/api`;
