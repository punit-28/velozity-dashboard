import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { getOnlineUserCount } from '../sockets/index';

export async function getDashboard(req: Request, res: Response) {
  const user = req.user!;

  if (user.role === 'ADMIN') {
    const [totalProjects, statusCounts, overdueCount] = await Promise.all([
      prisma.project.count(),
      prisma.task.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.task.count({ where: { isOverdue: true } }),
    ]);
    return res.json({
      role: 'ADMIN',
      totalProjects,
      tasksByStatus: Object.fromEntries(statusCounts.map((s: { status: string; _count: { _all: number } }) => [s.status, s._count._all])),
      overdueCount,
      onlineUsers: getOnlineUserCount(),
    });
  }

  if (user.role === 'PM') {
    const projects = await prisma.project.findMany({
      where: { managerId: user.id },
      include: { _count: { select: { tasks: true } } },
    });
    const projectIds = projects.map((p: { id: string }) => p.id);

    const priorityCounts = await prisma.task.groupBy({
      by: ['priority'],
      where: { projectId: { in: projectIds } },
      _count: { _all: true },
    });

    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingDueThisWeek = await prisma.task.findMany({
      where: { projectId: { in: projectIds }, dueDate: { gte: now, lte: weekFromNow } },
      orderBy: { dueDate: 'asc' },
      include: { assignee: { select: { id: true, name: true } } },
    });

    return res.json({
      role: 'PM',
      projects,
      tasksByPriority: Object.fromEntries(priorityCounts.map((p: { priority: string; _count: { _all: number } }) => [p.priority, p._count._all])),
      upcomingDueThisWeek,
    });
  }

  // DEVELOPER
  const tasks = await prisma.task.findMany({
    where: { assigneeId: user.id },
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    include: { project: { select: { id: true, name: true } } },
  });
  res.json({ role: 'DEVELOPER', tasks });
}
