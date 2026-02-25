import { io } from 'socket.io-client';

export const socket = io('/', {
  withCredentials: true,
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  autoConnect: false
});
