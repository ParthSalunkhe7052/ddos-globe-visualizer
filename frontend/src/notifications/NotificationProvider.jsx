import React, { createContext, useCallback, useContext, useMemo, useState, useRef, useEffect } from 'react';

const NotificationContext = createContext(null);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}

export default function NotificationProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  // batching queue for high-throughput notifications
  const pendingRef = useRef([]);
  const flushScheduled = useRef(false);

  const flushPending = useCallback(() => {
    flushScheduled.current = false;
    if (pendingRef.current.length === 0) return;
    const toAdd = pendingRef.current.splice(0, pendingRef.current.length);
    // prepend newest first
    setItems(prev => [...toAdd, ...prev]);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushScheduled.current) return;
    flushScheduled.current = true;
    requestAnimationFrame(flushPending);
  }, [flushPending]);

  const add = useCallback((payload) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const ts = Date.now();
    const item = { id, ts, ...payload };
    pendingRef.current.push(item);
    // if panel is closed, increment unread counter
    if (!open) setUnread(u => u + 1);
    scheduleFlush();
    return id;
  }, [open, scheduleFlush]);

  const dismiss = useCallback((id) => setItems(prev => prev.filter(i => i.id !== id)), []);
  const clearAll = useCallback(() => { pendingRef.current = []; setItems([]); setUnread(0); }, []);
  const toggle = useCallback(() => setOpen(o => {
    const next = !o;
    if (next) setUnread(0);
    return next;
  }), []);

  const value = useMemo(() => ({ open, items, unread, add, dismiss, clearAll, toggle, setOpen }), [open, items, unread, add, dismiss, clearAll, toggle]);

  // Listen for legacy app:toast events so existing showToast() calls are redirected here
  useEffect(() => {
    const handler = (e) => {
      const { message, type = 'info', duration } = e.detail || {};
      add({ message, type, duration, source: 'system' });
    };
    window.addEventListener('app:toast', handler);
    return () => window.removeEventListener('app:toast', handler);
  }, [add]);

  // Reset unread when panel is programmatically opened
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
