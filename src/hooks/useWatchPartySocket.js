import { useEffect, useRef, useState } from 'react';
import { getTokens, tryRestoreSession } from '../utils/api';

function buildWatchPartyWebSocketUrl(token) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams({ token });
  return `${protocol}//${window.location.host}/api/watch-party/ws?${params.toString()}`;
}

export default function useWatchPartySocket({
  inviteCode,
  enabled,
  onSnapshot,
  onEnded,
  onDeleted,
  onError,
}) {
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const [connectionState, setConnectionState] = useState('idle');

  useEffect(() => {
    if (!enabled || !inviteCode) {
      setConnectionState('idle');
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      return undefined;
    }

    let cancelled = false;

    const cleanupSocket = () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      const delay = Math.min(5000, 750 * (2 ** reconnectAttemptRef.current));
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, delay);
    };

    const connect = async () => {
      if (cancelled) return;
      setConnectionState('connecting');

      let token = getTokens().access_token;
      if (!token) {
        const restored = await tryRestoreSession();
        if (!restored) {
          setConnectionState('unauthenticated');
          return;
        }
        token = getTokens().access_token;
      }

      if (!token) {
        setConnectionState('unauthenticated');
        return;
      }

      const ws = new WebSocket(buildWatchPartyWebSocketUrl(token));
      socketRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        reconnectAttemptRef.current = 0;
        setConnectionState('connected');
        ws.send(JSON.stringify({
          type: 'watch_party:subscribe',
          invite_code: inviteCode,
        }));
      };

      ws.onmessage = (event) => {
        let payload = null;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        if (payload?.type === 'watch_party:snapshot') {
          onSnapshot?.(payload.party);
          return;
        }
        if (payload?.type === 'watch_party:ended') {
          onEnded?.(payload);
          return;
        }
        if (payload?.type === 'watch_party:deleted') {
          onDeleted?.(payload);
          return;
        }
        if (payload?.type === 'watch_party:error' || payload?.type === 'watch_party:unsubscribed') {
          onError?.(payload);
        }
      };

      ws.onerror = () => {
        if (cancelled) return;
        setConnectionState('error');
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnectionState('disconnected');
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      cleanupSocket();
    };
  }, [enabled, inviteCode, onDeleted, onEnded, onError, onSnapshot]);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
  };
}
