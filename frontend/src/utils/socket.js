import { io } from 'socket.io-client';

const hostname = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
const URL = `http://${hostname}:5000`;

const token = typeof window !== 'undefined' && window.sessionStorage ? (window.sessionStorage.getItem('admin_authenticated') === 'true' ? '1234' : '') : '';

export const socket = io(URL, {
  auth: {
    token: token
  }
});
