import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Socket } from 'socket.io-client';
import { api } from '../api/client';
import { ActivityFeed } from '../components/ActivityFeed';
import { useAuth } from '../contexts/AuthContext';
import { Project, Task, TaskStatus, TaskPriority } from '../types';

const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function ProjectPage({ socket }: { socket: Socket | null }) {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [developers, setDevelopers] = useState<{ id: string; name: string }[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  // Filters are read from / written to the URL so a filtered view is a
  // shareable link, per the spec.
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const priority = searchParams.get('priority') ?? '';
  const dueDateFrom = searchParams.get('dueDateFrom') ?? '';
  const dueDateTo = searchParams.get('dueDateTo') ?? '';

  const canManage = user?.role === 'ADMIN' || (user?.role === 'PM' && project?.managerId === user.id);

  const loadTasks = useCallback(() => {
    if (!id) return;
    const params: Record<string, string> = { projectId: id };
    if (status) params.status = status;
    if (priority) params.priority = priority;
    if (dueDateFrom) params.dueDateFrom = new Date(dueDateFrom).toISOString();
    if (dueDateTo) params.dueDateTo = new Date(dueDateTo).toISOString();
    api.get('/tasks', { params }).then((res) => setTasks(res.data.tasks));
  }, [id, status, priority, dueDateFrom, dueDateTo]);

  useEffect(() => {
    if (!id) return;
    api.get(`/projects/${id}`).then((res) => setProject(res.data.project));
  }, [id]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (user && (user.role === 'ADMIN' || user.role === 'PM')) {
      api.get('/developers').then((res) => setDevelopers(res.data.developers));
    }
  }, [user]);

  useEffect(() => {
    if (!socket) return;
    const onOverdue = (payload: { taskId: string; projectId: string }) => {
      if (payload.projectId !== id) return;
      setTasks((prev) => prev.map((t) => (t.id === payload.taskId ? { ...t, isOverdue: true } : t)));
    };
    const onActivity = () => loadTasks();
    socket.on('task:overdue', onOverdue);
    socket.on('activity:new', onActivity);
    return () => {
      socket.off('task:overdue', onOverdue);
      socket.off('activity:new', onActivity);
    };
  }, [socket, id, loadTasks]);

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  async function updateStatus(taskId: string, newStatus: TaskStatus) {
    await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
    loadTasks();
  }

  if (!project) return <div className="loading">Loading project...</div>;

  return (
    <div className="project-page">
      <div className="page-header">
        <div>
          <h1>{project.name}</h1>
          <p className="muted">{project.description} · Client: {project.client?.name}</p>
        </div>
        {canManage && <button onClick={() => setShowCreate((s) => !s)}>+ New Task</button>}
      </div>

      {showCreate && (
        <CreateTaskForm
          projectId={project.id}
          developers={developers}
          onCreated={() => {
            setShowCreate(false);
            loadTasks();
          }}
        />
      )}

      <div className="filters">
        <select value={status} onChange={(e) => updateFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={priority} onChange={(e) => updateFilter('priority', e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label>
          Due from
          <input type="date" value={dueDateFrom} onChange={(e) => updateFilter('dueDateFrom', e.target.value)} />
        </label>
        <label>
          Due to
          <input type="date" value={dueDateTo} onChange={(e) => updateFilter('dueDateTo', e.target.value)} />
        </label>
      </div>

      <div className="task-board">
        {STATUSES.map((col) => (
          <div className="task-column" key={col}>
            <h3>{col.replace('_', ' ')}</h3>
            {tasks.filter((t) => t.status === col).map((t) => (
              <div key={t.id} className={`task-card ${t.isOverdue ? 'overdue' : ''}`}>
                <div className="task-title">{t.title}</div>
                <div className="task-meta">
                  <span className={`priority-tag priority-${t.priority.toLowerCase()}`}>{t.priority}</span>
                  {t.assignee && <span className="assignee">{t.assignee.name}</span>}
                </div>
                {t.dueDate && (
                  <div className="due-date">
                    Due {new Date(t.dueDate).toLocaleDateString()}
                    {t.isOverdue && <strong> · OVERDUE</strong>}
                  </div>
                )}
                <select value={t.status} onChange={(e) => updateStatus(t.id, e.target.value as TaskStatus)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
            ))}
          </div>
        ))}
      </div>

      <ActivityFeed socket={socket} projectId={project.id} />
    </div>
  );
}

function CreateTaskForm({
  projectId,
  developers,
  onCreated,
}: {
  projectId: string;
  developers: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/tasks', {
      projectId,
      title,
      description,
      assigneeId: assigneeId || undefined,
      priority,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
    });
    setTitle('');
    setDescription('');
    setAssigneeId('');
    setDueDate('');
    onCreated();
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <input placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
        <option value="">Unassigned</option>
        {developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      <button type="submit">Add Task</button>
    </form>
  );
}
