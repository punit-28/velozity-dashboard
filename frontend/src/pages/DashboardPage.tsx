import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Socket } from 'socket.io-client';
import { api } from '../api/client';
import { ActivityFeed } from '../components/ActivityFeed';
import { useAuth } from '../contexts/AuthContext';
import { Task } from '../types';

interface AdminDashboardData {
  role: 'ADMIN';
  totalProjects: number;
  tasksByStatus: Record<string, number>;
  overdueCount: number;
  onlineUsers: number;
}
interface PmDashboardData {
  role: 'PM';
  projects: { id: string; name: string; _count: { tasks: number } }[];
  tasksByPriority: Record<string, number>;
  upcomingDueThisWeek: Task[];
}
interface DevDashboardData {
  role: 'DEVELOPER';
  tasks: Task[];
}
type DashboardData = AdminDashboardData | PmDashboardData | DevDashboardData;

export function DashboardPage({ socket }: { socket: Socket | null }) {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

  useEffect(() => {
    api.get('/dashboard').then((res) => setData(res.data));
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onPresence = (p: { count: number }) => setOnlineCount(p.count);
    socket.on('presence:update', onPresence);
    return () => {
      socket.off('presence:update', onPresence);
    };
  }, [socket]);

  if (!data) return <div className="loading">Loading dashboard...</div>;

  return (
    <div className="dashboard-page">
      <h1>Welcome, {user?.name}</h1>

      {data.role === 'ADMIN' && (
        <div className="stat-grid">
          <StatCard label="Total Projects" value={data.totalProjects} />
          <StatCard label="Overdue Tasks" value={data.overdueCount} />
          <StatCard label="Users Online Now" value={onlineCount ?? data.onlineUsers} live />
          {Object.entries(data.tasksByStatus).map(([status, count]) => (
            <StatCard key={status} label={status.replace('_', ' ')} value={count} />
          ))}
        </div>
      )}

      {data.role === 'PM' && (
        <>
          <div className="stat-grid">
            {Object.entries(data.tasksByPriority).map(([priority, count]) => (
              <StatCard key={priority} label={`${priority} priority`} value={count} />
            ))}
          </div>
          <h2>Your Projects</h2>
          <div className="project-grid">
            {data.projects.map((p) => (
              <Link to={`/projects/${p.id}`} className="project-card" key={p.id}>
                <strong>{p.name}</strong>
                <span>{p._count.tasks} tasks</span>
              </Link>
            ))}
          </div>
          <h2>Due This Week</h2>
          <TaskTable tasks={data.upcomingDueThisWeek} />
        </>
      )}

      {data.role === 'DEVELOPER' && (
        <>
          <h2>Your Tasks (by priority, then due date)</h2>
          <TaskTable tasks={data.tasks} />
        </>
      )}

      <ActivityFeed socket={socket} />
    </div>
  );
}

function StatCard({ label, value, live }: { label: string; value: number; live?: boolean }) {
  return (
    <div className="stat-card">
      <span className="stat-value">
        {value}
        {live && <span className="live-dot" />}
      </span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function TaskTable({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) return <p className="empty">Nothing here right now.</p>;
  return (
    <table className="task-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Status</th>
          <th>Priority</th>
          <th>Due</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((t) => (
          <tr key={t.id} className={t.isOverdue ? 'overdue-row' : ''}>
            <td>
              <Link to={`/projects/${t.projectId}`}>{t.title}</Link>
            </td>
            <td>{t.status.replace('_', ' ')}</td>
            <td>{t.priority}</td>
            <td>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}{t.isOverdue ? ' (Overdue)' : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
