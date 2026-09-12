import { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

/**
 * Powers both the initial feed render and "catch-up after being offline":
 * always reads the last N events from the database (ActivityEvent table),
 * never from an in-memory cache, so a user who reconnects after minutes or
 * days still sees an accurate last-20 regardless of which server process
 * they land on.
 */
export async function getActivityFeed(req: Request, res: Response) {
  const user = req.user!;
  const { limit } = querySchema.parse(req.query);

  const where: Prisma.ActivityEventWhereInput =
    user.role === 'ADMIN'
      ? {}
      : user.role === 'PM'
      ? { project: { managerId: user.id } }
      : { taskId: { not: null }, task: { assigneeId: user.id } };

  const events = await prisma.activityEvent.findMany({
    where,
    include: {
      actor: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  res.json({ events });
}
