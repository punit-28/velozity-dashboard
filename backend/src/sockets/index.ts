import { Server, Socket } from 'socket.io';
import http from 'http';
import { env } from '../config/env';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../config/prisma';
import { setIo } from './io';
import { Role } from '@prisma/client';

interface SocketUser {
  id: string;
  role: Role;
}

// userId -> number of live socket connections (a user can have multiple tabs).
const onlineUsers = new Map<string, number>();

function broadcastPresence(io: Server) {
  io.to(room.adminFeed()).emit('presence:update', { count: onlineUsers.size });
}

export const room = {
  project: (projectId: string) => `project:${projectId}`,
  user: (userId: string) => `user:${userId}`,
  adminFeed: () => 'feed:admin',
  pmFeed: (pmId: string) => `feed:pm:${pmId}`,
};

/**
 * Rooms are joined server-side based on the verified JWT identity — a
 * Developer's socket can never join a PM's or another developer's room,
 * mirroring the REST-level access rules exactly (same ownership checks).
 */
export function initSockets(server: http.Server) {
  const io = new Server(server, {
    cors: { origin: env.clientUrl, credentials: true },
  });
  setIo(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('Unauthorized'));
      const payload = verifyAccessToken(token);
      (socket.data as { user: SocketUser }).user = { id: payload.sub, role: payload.role };
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const user = (socket.data as { user: SocketUser }).user;

    // Personal room: notifications + events targeted at this user directly.
    socket.join(room.user(user.id));

    if (user.role === 'ADMIN') {
      socket.join(room.adminFeed());
    }
    if (user.role === 'PM') {
      socket.join(room.pmFeed(user.id));
    }

    onlineUsers.set(user.id, (onlineUsers.get(user.id) ?? 0) + 1);
    broadcastPresence(io);

    // Client explicitly joins a project room when it opens that project's
    // page. We re-verify authorization server-side before allowing the join
    // so a Developer/PM can't subscribe to a project's feed via a crafted
    // socket event, mirroring API-level enforcement.
    socket.on('project:join', async (projectId: string) => {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) return;

      if (user.role === 'ADMIN') {
        socket.join(room.project(projectId));
        return;
      }
      if (user.role === 'PM' && project.managerId === user.id) {
        socket.join(room.project(projectId));
        return;
      }
      if (user.role === 'DEVELOPER') {
        const hasTask = await prisma.task.findFirst({
          where: { projectId, assigneeId: user.id },
        });
        if (hasTask) socket.join(room.project(projectId));
      }
      // Silently no-op for unauthorized joins — no data or error leaked.
    });

    socket.on('project:leave', (projectId: string) => {
      socket.leave(room.project(projectId));
    });

    socket.on('disconnect', () => {
      const count = (onlineUsers.get(user.id) ?? 1) - 1;
      if (count <= 0) onlineUsers.delete(user.id);
      else onlineUsers.set(user.id, count);
      broadcastPresence(io);
    });
  });

  return io;
}

export function getOnlineUserCount(): number {
  return onlineUsers.size;
}
