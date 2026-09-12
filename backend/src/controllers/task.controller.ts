import { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma, TaskStatus, TaskPriority } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { loadProjectForUser } from './project.controller';
import { recordTaskStatusActivity } from '../services/activity.service';
import { notifyUser } from '../services/notification.service';

const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeId: z.string().uuid().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueDate: z.string().datetime().optional(),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(TaskStatus),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

const listQuerySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueDateFrom: z.string().datetime().optional(),
  dueDateTo: z.string().datetime().optional(),
  projectId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
});

/**
 * Every filter (status/priority/due date range) is a plain query parameter,
 * so a filtered view is a shareable/bookmarkable URL, e.g.
 * GET /api/tasks?status=IN_REVIEW&priority=HIGH&dueDateFrom=...&dueDateTo=...
 */
export async function listTasks(req: Request, res: Response) {
  const user = req.user!;
  const q = listQuerySchema.parse(req.query);

  const where: Prisma.TaskWhereInput = {};
  if (q.status) where.status = q.status;
  if (q.priority) where.priority = q.priority;
  if (q.projectId) where.projectId = q.projectId;
  if (q.dueDateFrom || q.dueDateTo) {
    where.dueDate = {
      ...(q.dueDateFrom ? { gte: new Date(q.dueDateFrom) } : {}),
      ...(q.dueDateTo ? { lte: new Date(q.dueDateTo) } : {}),
    };
  }

  // Role scoping is applied server-side and ANDed with any client filters —
  // a Developer cannot widen their own scope by omitting/forging query params.
  if (user.role === 'DEVELOPER') {
    where.assigneeId = user.id;
  } else if (user.role === 'PM') {
    where.project = { managerId: user.id };
  }
  // ADMIN: no extra scoping — sees everything.

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, managerId: true } },
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.task.count({ where }),
  ]);

  res.json({ tasks, total, page: q.page, pageSize: q.pageSize });
}

export async function getTask(req: Request, res: Response) {
  const user = req.user!;
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      project: true,
      statusEvents: {
        include: { changedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!task) throw ApiError.notFound('Task not found');

  if (user.role === 'DEVELOPER' && task.assigneeId !== user.id) {
    throw ApiError.forbidden("You cannot view another developer's task");
  }
  if (user.role === 'PM' && task.project.managerId !== user.id) {
    throw ApiError.forbidden('Not your project');
  }

  res.json({ task });
}

export async function createTask(req: Request, res: Response) {
  const user = req.user!;
  const data = createTaskSchema.parse(req.body);

  // Only Admin/PM reach this route (enforced by requireRole), but a PM must
  // additionally own the target project.
  await loadProjectForUser(data.projectId, user);

  const task = await prisma.task.create({
    data: {
      projectId: data.projectId,
      title: data.title,
      description: data.description,
      assigneeId: data.assigneeId,
      priority: data.priority ?? 'MEDIUM',
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      status: 'TODO',
    },
    include: { assignee: true, project: true },
  });

  await prisma.taskStatusEvent.create({
    data: { taskId: task.id, fromStatus: null, toStatus: 'TODO', changedById: user.id },
  });

  const actor = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  await recordTaskStatusActivity({ task, actor, fromStatus: null, toStatus: 'TODO' });

  if (task.assigneeId) {
    await notifyUser({
      userId: task.assigneeId,
      type: 'TASK_ASSIGNED',
      message: `You were assigned to "${task.title}"`,
      taskId: task.id,
    });
  }

  res.status(201).json({ task });
}

export async function updateTask(req: Request, res: Response) {
  const user = req.user!;
  const existing = await prisma.task.findUnique({ where: { id: req.params.id }, include: { project: true } });
  if (!existing) throw ApiError.notFound('Task not found');
  if (user.role === 'PM' && existing.project.managerId !== user.id) {
    throw ApiError.forbidden('Not your project');
  }
  if (user.role === 'DEVELOPER') {
    throw ApiError.forbidden('Developers cannot edit task details, only status');
  }

  const data = updateTaskSchema.parse(req.body);
  const previousAssigneeId = existing.assigneeId;

  const task = await prisma.task.update({
    where: { id: existing.id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
    },
    include: { assignee: true, project: true },
  });

  if (data.assigneeId && data.assigneeId !== previousAssigneeId) {
    await notifyUser({
      userId: data.assigneeId,
      type: 'TASK_ASSIGNED',
      message: `You were assigned to "${task.title}"`,
      taskId: task.id,
    });
  }

  res.json({ task });
}

/**
 * The one endpoint every role can hit (Admin, PM on their project, Developer
 * on their own assigned task). Every transition is written to
 * TaskStatusEvent with a timestamp + actor (never derived), then broadcast
 * live and persisted as an ActivityEvent for feed catch-up.
 */
export async function updateTaskStatus(req: Request, res: Response) {
  const user = req.user!;
  const { status } = updateStatusSchema.parse(req.body);

  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { project: true, assignee: true },
  });
  if (!task) throw ApiError.notFound('Task not found');

  if (user.role === 'DEVELOPER' && task.assigneeId !== user.id) {
    throw ApiError.forbidden('You can only update tasks assigned to you');
  }
  if (user.role === 'PM' && task.project.managerId !== user.id) {
    throw ApiError.forbidden('Not your project');
  }

  const fromStatus = task.status;
  if (fromStatus === status) {
    return res.json({ task });
  }

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      status,
      // Moving off "overdue-eligible" or back to an active state clears the flag;
      // the scheduled job is the only thing that ever *sets* it.
      isOverdue: status === 'DONE' ? false : task.isOverdue,
    },
    include: { assignee: true, project: true },
  });

  await prisma.taskStatusEvent.create({
    data: { taskId: task.id, fromStatus, toStatus: status, changedById: user.id },
  });

  const actor = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  await recordTaskStatusActivity({ task: updated, actor, fromStatus, toStatus: status });

  if (status === 'IN_REVIEW') {
    await notifyUser({
      userId: task.project.managerId,
      type: 'TASK_MOVED_TO_REVIEW',
      message: `"${task.title}" was moved to In Review by ${actor.name}`,
      taskId: task.id,
    });
  }

  res.json({ task: updated });
}
