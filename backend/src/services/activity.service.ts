import { prisma } from '../config/prisma';
import { getIo } from '../sockets/io';
import { room } from '../sockets/index';
import { Task, User } from '@prisma/client';

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const STATUS_LABEL: Record<string, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
};

/**
 * Persists a status-change activity event and broadcasts it live. Persisting
 * first (DB is the source of truth) then emitting keeps the "missed events"
 * catch-up query and the live push consistent with each other.
 */
export async function recordTaskStatusActivity(params: {
  task: Task;
  actor: User;
  fromStatus: string | null;
  toStatus: string;
}) {
  const { task, actor, fromStatus, toStatus } = params;

  const message = fromStatus
    ? `${actor.name} moved Task #${task.id.slice(0, 8)} (${task.title}) from ${STATUS_LABEL[fromStatus]} \u2192 ${STATUS_LABEL[toStatus]}`
    : `${actor.name} created Task #${task.id.slice(0, 8)} (${task.title}) as ${STATUS_LABEL[toStatus]}`;

  const event = await prisma.activityEvent.create({
    data: {
      projectId: task.projectId,
      taskId: task.id,
      actorId: actor.id,
      message,
      metadata: { fromStatus, toStatus, taskId: task.id, taskTitle: task.title },
    },
  });

  const project = await prisma.project.findUnique({ where: { id: task.projectId } });

  const payload = {
    id: event.id,
    projectId: event.projectId,
    taskId: event.taskId,
    actorId: event.actorId,
    actorName: actor.name,
    message: event.message,
    metadata: event.metadata,
    createdAt: event.createdAt,
    relativeTime: timeAgo(event.createdAt),
  };

  const io = getIo();
  // Everyone currently viewing this project (authorization already enforced
  // at socket "project:join" time).
  io.to(room.project(task.projectId)).emit('activity:new', payload);
  // Admin global feed always receives every event.
  io.to(room.adminFeed()).emit('activity:new', payload);
  // The owning PM's feed, even if they aren't on the project page right now.
  if (project) io.to(room.pmFeed(project.managerId)).emit('activity:new', payload);
  // The assigned developer's personal feed.
  if (task.assigneeId) io.to(room.user(task.assigneeId)).emit('activity:new', payload);

  return event;
}
