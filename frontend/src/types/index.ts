export type Role = 'ADMIN' | 'PM' | 'DEVELOPER';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Client {
  id: string;
  name: string;
  email?: string | null;
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  clientId: string;
  managerId: string;
  client?: Client;
  manager?: { id: string; name: string; email: string };
  _count?: { tasks: number };
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  projectId: string;
  project?: { id: string; name: string; managerId?: string };
  assigneeId?: string | null;
  assignee?: { id: string; name: string; email: string } | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  isOverdue: boolean;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  projectId: string;
  taskId?: string | null;
  actorId: string;
  actorName?: string;
  actor?: { id: string; name: string };
  project?: { id: string; name: string };
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  relativeTime?: string;
}

export interface Notification {
  id: string;
  userId: string;
  taskId?: string | null;
  type: 'TASK_ASSIGNED' | 'TASK_MOVED_TO_REVIEW' | 'TASK_OVERDUE';
  message: string;
  isRead: boolean;
  createdAt: string;
}
