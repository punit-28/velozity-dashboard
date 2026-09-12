import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { Client, Project } from '../types';

export function ProjectsListPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState('');
  const canCreate = user?.role === 'ADMIN' || user?.role === 'PM';

  function load() {
    api.get('/projects').then((res) => setProjects(res.data.projects));
  }

  useEffect(() => {
    load();
    if (canCreate) api.get('/clients').then((res) => setClients(res.data.clients));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/projects', { name, description, clientId });
    setShowCreate(false);
    setName('');
    setDescription('');
    setClientId('');
    load();
  }

  return (
    <div className="projects-page">
      <div className="page-header">
        <h1>Projects</h1>
        {canCreate && <button onClick={() => setShowCreate((s) => !s)}>+ New Project</button>}
      </div>

      {showCreate && (
        <form className="inline-form" onSubmit={handleCreate}>
          <input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">Select client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button type="submit">Create</button>
        </form>
      )}

      <div className="project-grid">
        {projects.map((p) => (
          <Link to={`/projects/${p.id}`} className="project-card" key={p.id}>
            <strong>{p.name}</strong>
            <span>{p.client?.name}</span>
            <span>{p._count?.tasks ?? 0} tasks · PM: {p.manager?.name}</span>
          </Link>
        ))}
        {projects.length === 0 && <p className="empty">No projects visible to you yet.</p>}
      </div>
    </div>
  );
}
