import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { NotificationBell } from './NotificationBell';
import { Socket } from 'socket.io-client';

export function Layout({ children, socket }: { children: React.ReactNode; socket: Socket | null }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">Velozity Dashboard</Link>
        <nav>
          <Link to="/">Dashboard</Link>
          <Link to="/projects">Projects</Link>
        </nav>
        <div className="topbar-right">
          {user && <NotificationBell socket={socket} />}
          {user && (
            <div className="user-chip">
              <span>{user.name}</span>
              <span className={`role-badge role-${user.role.toLowerCase()}`}>{user.role}</span>
              <button onClick={handleLogout}>Log out</button>
            </div>
          )}
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
