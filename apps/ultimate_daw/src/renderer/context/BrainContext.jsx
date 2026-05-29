import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';
import { CINESTAGE_URL } from '../config/syncConfig';

const BrainContext = createContext(null);
export const useBrain = () => useContext(BrainContext);

const MAX_EVENTS = 50;
const MAX_CHAT = 200;
const POLL_INTERVAL_MS = 30000;

// Route all CineStage HTTP calls through the Electron main process (no CORS).
// Falls back to direct fetch for non-Electron environments (e.g. browser testing).
async function brainFetch(path, { method = 'GET', body } = {}) {
  const url = `${CINESTAGE_URL}${path}`;
  const ipc = window?.umDesktop?.cinestage?.fetch;
  if (ipc) {
    return ipc({ url, method, body });
  }
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

function normalizeCaps(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.keys(raw);
  return [];
}

export function BrainProvider({ children }) {
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'online' | 'offline'
  const [capabilities, setCapabilities] = useState([]);
  const [brainStats, setBrainStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [chatLog, setChatLog] = useState([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [screenContext, setScreenContext] = useState(null);

  const pollTimer = useRef(null);
  const screenContextRef = useRef(null);
  const mountedRef = useRef(true);

  const addEvent = useCallback((evt) => {
    setEvents((prev) => [evt, ...prev].slice(0, MAX_EVENTS));
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      let data = null;

      const r1 = await brainFetch('/api/brain/bootstrap');
      if (r1.ok && r1.data) {
        data = r1.data;
      } else {
        const r2 = await brainFetch('/api/brain/capabilities');
        if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
        data = r2.data;
      }

      if (!mountedRef.current) return;

      const brain = data?.brain || data;
      setCapabilities(normalizeCaps(brain?.capabilities));
      setBrainStats(data?.stats || brain?.stats || null);
      setStatus('online');
    } catch {
      if (mountedRef.current) setStatus('offline');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    bootstrap();
    pollTimer.current = setInterval(bootstrap, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(pollTimer.current);
    };
  }, [bootstrap]);

  const queryBrain = useCallback(async (prompt, explicitContext) => {
    const ctx = explicitContext || screenContextRef.current;
    setChatLog((prev) => [...prev, { role: 'user', content: prompt, ts: Date.now() }].slice(-MAX_CHAT));
    setQueryLoading(true);
    setIsPanelOpen(true);

    try {
      const { data } = await brainFetch('/api/brain/query', {
        method: 'POST',
        body: { query: prompt, prompt, context: ctx },
      });
      const content = data?.response || data?.answer || data?.message || data?.text || data?.result || JSON.stringify(data);
      setChatLog((prev) => [...prev, { role: 'assistant', content, ts: Date.now() }].slice(-MAX_CHAT));
      addEvent({ type: 'query', content: prompt.slice(0, 80), ts: Date.now() });
    } catch (err) {
      setChatLog((prev) => [...prev, {
        role: 'assistant', content: `Error: ${err.message}`, ts: Date.now(), isError: true,
      }].slice(-MAX_CHAT));
    } finally {
      setQueryLoading(false);
    }
  }, [addEvent]);

  const registerScreenContext = useCallback((ctx) => {
    screenContextRef.current = ctx;
    setScreenContext(ctx);
  }, []);

  const openPanel = useCallback((ctx) => {
    if (ctx) registerScreenContext(ctx);
    setIsPanelOpen(true);
  }, [registerScreenContext]);

  const closePanel = useCallback(() => setIsPanelOpen(false), []);

  const reconnect = useCallback(() => {
    setStatus('connecting');
    bootstrap();
  }, [bootstrap]);

  return (
    <BrainContext.Provider
      value={{
        status,
        capabilities,
        brainStats,
        events,
        chatLog,
        queryLoading,
        isPanelOpen,
        screenContext,
        queryBrain,
        registerScreenContext,
        openPanel,
        closePanel,
        reconnect,
      }}
    >
      {children}
    </BrainContext.Provider>
  );
}
