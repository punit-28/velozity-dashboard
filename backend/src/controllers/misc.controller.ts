import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

/** Developer list, scoped down for PMs/Admin to use in assignee dropdowns. */
export async function listDevelopers(_req: Request, res: Response) {
  const developers = await prisma.user.findMany({
    where: { role: 'DEVELOPER' },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
  res.json({ developers });
}

export async function listClients(_req: Request, res: Response) {
  const clients = await prisma.client.findMany({ orderBy: { name: 'asc' } });
  res.json({ clients });
}
