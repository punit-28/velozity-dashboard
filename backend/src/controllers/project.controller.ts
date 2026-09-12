import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  clientId: z.string().uuid(),
});

/**
 * Ownership check used everywhere a single project is loaded. A PM can only
 * ever operate on projects where managerId === their own id — this is
 * re-verified server-side on every request, not trusted from the frontend.
 */
async function loadProjectForUser(projectId: string, user: { id: string; role: string }) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true, manager: { select: { id: true, name: true, email: true } } },
  });
  if (!project) throw ApiError.notFound('Project not found');

  if (user.role === 'ADMIN') return project;
  if (user.role === 'PM') {
    if (project.managerId !== user.id) throw ApiError.forbidden('Not your project');
    return project;
  }
  // Developer: allowed only if they have at least one task in this project.
  const hasTask = await prisma.task.findFirst({
    where: { projectId, assigneeId: user.id },
  });
  if (!hasTask) throw ApiError.forbidden('You do not have access to this project');
  return project;
}

export async function listProjects(req: Request, res: Response) {
  const user = req.user!;

  const where =
    user.role === 'ADMIN'
      ? {}
      : user.role === 'PM'
      ? { managerId: user.id }
      : { tasks: { some: { assigneeId: user.id } } };

  const projects = await prisma.project.findMany({
    where,
    include: {
      client: true,
      manager: { select: { id: true, name: true, email: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ projects });
}

export async function getProject(req: Request, res: Response) {
  const project = await loadProjectForUser(req.params.id, req.user!);
  res.json({ project });
}

export async function createProject(req: Request, res: Response) {
  const user = req.user!;
  const data = createProjectSchema.parse(req.body);

  const client = await prisma.client.findUnique({ where: { id: data.clientId } });
  if (!client) throw ApiError.badRequest('Client does not exist');

  // Admin can create on behalf of a PM if managerId provided; PM always
  // becomes the manager of a project they create themselves.
  const managerId =
    user.role === 'ADMIN' && req.body.managerId ? (req.body.managerId as string) : user.id;

  const project = await prisma.project.create({
    data: { name: data.name, description: data.description, clientId: data.clientId, managerId },
    include: { client: true, manager: { select: { id: true, name: true, email: true } } },
  });

  res.status(201).json({ project });
}

export { loadProjectForUser };
