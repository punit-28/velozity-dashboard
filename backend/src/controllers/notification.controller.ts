import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';

export async function listNotifications(req: Request, res: Response) {
  const user = req.user!;
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const unreadCount = await prisma.notification.count({ where: { userId: user.id, isRead: false } });
  res.json({ notifications, unreadCount });
}

export async function markRead(req: Request, res: Response) {
  const user = req.user!;
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification || notification.userId !== user.id) throw ApiError.notFound('Notification not found');

  await prisma.notification.update({ where: { id: notification.id }, data: { isRead: true } });
  res.json({ success: true });
}

export async function markAllRead(req: Request, res: Response) {
  const user = req.user!;
  await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });
  res.json({ success: true });
}
