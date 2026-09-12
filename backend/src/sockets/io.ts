import { Server } from 'socket.io';

// Singleton holder so REST controllers/services can emit events without
// passing the Socket.io instance through every function call.
let ioInstance: Server | null = null;

export function setIo(io: Server) {
  ioInstance = io;
}

export function getIo(): Server {
  if (!ioInstance) throw new Error('Socket.io not initialized yet');
  return ioInstance;
}
