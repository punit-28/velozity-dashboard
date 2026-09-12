import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { api } from '../api/client';
import { ActivityEvent } from '../types';

/**
 * Fetches the last 20 events from the DB on mount (covers "user was offline,
 * comes back" catch-up), then appends live events pushed over the socket.
 * If projectId is given, also joins that project's room so this component
 * works both as a per-project feed and a global/role-scoped feed.
 */
export function ActivityFeed({ socket, projectId }: { socket: Socket | null; projectId?: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    const params = projectId ? { limit: 20 } : { limit: 20 };
    api.get('/feed', { params }).then((res) => {
      const filtered = projectId
        ? res.data.events.filter((e: ActivityEvent) => e.projectId === projectId)
        : res.data.events;
      setEvents(filtered);
    });
  }, [projectId]);

  useEffect(() => {
    if (!socket) return;
    if (projectId) socket.emit('project:join', projectId);

    const onEvent = (event: ActivityEvent) => {
      if (projectId && event.projectId !== projectId) return;
      setEvents((prev) => [event, ...prev].slice(0, 50));
    };
    socket.on('activity:new', onEvent);

    return () => {
      socket.off('activity:new', onEvent);
      if (projectId) socket.emit('project:leave', projectId);
    };
  }, [socket, projectId]);

  return (
    <div className="activity-feed">
      <h3>Live Activity</h3>
      {events.length === 0 && <div className="empty">No activity yet</div>}
      <ul>
        {events.map((e) => (
          <li key={e.id}>
            <span>{e.message}</span>
            <small>{e.relativeTime ?? new Date(e.createdAt).toLocaleTimeString()}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
