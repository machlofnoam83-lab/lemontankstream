import { useState, useEffect, useRef, useCallback } from 'react';

const WS_URL = 'ws://localhost:8765/ws';

/**
 * Custom hook for WebSocket connection to the backend
 */
export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const listenersRef = useRef({});

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[HUD] Connected to Adial Gonian backend');
        setIsConnected(true);
      };

      ws.onclose = () => {
        console.log('[HUD] Disconnected from backend');
        setIsConnected(false);
        // Reconnect after 2 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = (err) => {
        console.error('[HUD] WebSocket error:', err);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastEvent(data);

          // Call registered listeners
          const listeners = listenersRef.current[data.event] || [];
          listeners.forEach(fn => fn(data.data));
        } catch (e) {
          console.error('[HUD] Message parse error:', e);
        }
      };
    } catch (e) {
      console.error('[HUD] Connection error:', e);
      reconnectTimeoutRef.current = setTimeout(connect, 2000);
    }
  }, []);

  const send = useCallback((event, data = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }));
    }
  }, []);

  const on = useCallback((event, callback) => {
    if (!listenersRef.current[event]) {
      listenersRef.current[event] = [];
    }
    listenersRef.current[event].push(callback);
  }, []);

  const off = useCallback((event, callback) => {
    if (listenersRef.current[event]) {
      listenersRef.current[event] = listenersRef.current[event].filter(fn => fn !== callback);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connect]);

  return { isConnected, lastEvent, send, on, off };
}
