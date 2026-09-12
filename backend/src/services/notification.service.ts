import { prisma } from '../config/prisma';
import { getIo } from '../sockets/io';
import { room } from '../sockets/index';
import { NotificationType } from '@prisma/client';

/** Creates a notification, persists it, and pushes the live unread count. */
export async function notifyUser(params: {
  userId: string;
  type: NotificationType;
  message: string;
  taskId?: string;
}) {
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      message: params.message,
      taskId: params.taskId,
    },
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: params.userId, isRead: false },
  });

  const io = getIo();
  io.to(room.user(params.userId)).emit('notification:new', notification);
  io.to(room.user(params.userId)).emit('notification:unreadCount', { count: unreadCount });

  return notification;
}
