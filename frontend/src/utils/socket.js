import { io } from 'socket.io-client';
import { BACKEND_URL } from './apiConfig';

export const socket = io(BACKEND_URL);
