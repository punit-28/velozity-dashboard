import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../api/client';
import { getAccessToken } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

/**
 * One shared socket per authenticated session. Re-connects with a fresh
 * access token whenever the user changes (login/logout).
 */
export function useSocket(): Socket | null {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = io(API_URL, {
      auth: { token: getAccessToken() },
      withCredentials: true,
    });
    socketRef.current = socket;
    forceRender((n) => n + 1);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return socketRef.current;
}
