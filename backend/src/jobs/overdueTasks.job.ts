import cron from 'node-cron';
import { prisma } from '../config/prisma';
import { getIo } from '../sockets/io';
import { room } from '../sockets/index';

/**
 * Flags tasks as overdue via a scheduled job (never derived at read time on
 * page load, per the spec). node-cron was chosen over Bull for this project:
 * there's a single lightweight recurring sweep with no per-job payload, retry
 * semantics, or distributed workers to coordinate, so an in-process cron
 * schedule is simpler to run and reason about than standing up a Redis-backed
 * queue for one job. See README "Architectural Decisions" for the full
 * justification and the Bull trade-off.
 */
export async function sweepOverdueTasks() {
  const now = new Date();

  const overdue = await prisma.task.findMany({
    where: {
      dueDate: { lt: now },
      isOverdue: false,
      status: { not: 'DONE' },
    },
  });

  if (overdue.length === 0) return;

  await prisma.task.updateMany({
    where: { id: { in: overdue.map((t: { id: string }) => t.id) } },
    data: { isOverdue: true },
  });

  const io = getIo();
  for (const task of overdue as { id: string; projectId: string }[]) {
    io.to(room.project(task.projectId)).emit('task:overdue', {
      taskId: task.id,
      projectId: task.projectId,
    });
  }
  // eslint-disable-next-line no-console
  console.log(`[overdue-job] flagged ${overdue.length} task(s) as overdue at ${now.toISOString()}`);
}

/** Runs every 5 minutes. */
export function startOverdueTaskJob() {
  cron.schedule('*/5 * * * *', () => {
    sweepOverdueTasks().catch((err) => console.error('[overdue-job] failed', err));
  });
}
