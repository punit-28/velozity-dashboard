import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { api } from '../api/client';
import { Notification } from '../types';

export function NotificationBell({ socket }: { socket: Socket | null }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    api.get('/notifications').then((res) => {
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unreadCount);
    });
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onNew = (n: Notification) => setNotifications((prev) => [n, ...prev].slice(0, 50));
    const onCount = (payload: { count: number }) => setUnreadCount(payload.count);
    socket.on('notification:new', onNew);
    socket.on('notification:unreadCount', onCount);
    return () => {
      socket.off('notification:new', onNew);
      socket.off('notification:unreadCount', onCount);
    };
  }, [socket]);

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    await api.patch('/notifications/read-all');
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }

  return (
    <div className="notification-bell">
      <button className="bell-btn" onClick={() => setOpen((o) => !o)}>
        🔔
        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </button>
      {open && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <strong>Notifications</strong>
            <button onClick={markAllRead}>Mark all read</button>
          </div>
          {notifications.length === 0 && <div className="empty">No notifications yet</div>}
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`notification-item ${n.isRead ? '' : 'unread'}`}
              onClick={() => !n.isRead && markRead(n.id)}
            >
              <div>{n.message}</div>
              <small>{new Date(n.createdAt).toLocaleString()}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
