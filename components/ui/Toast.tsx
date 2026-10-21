'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
  dismissToast: (id: string) => void;
  toast: {
    success: (message: string, title?: string, duration?: number) => void;
    error: (message: string, title?: string, duration?: number) => void;
    warning: (message: string, title?: string, duration?: number) => void;
    info: (message: string, title?: string, duration?: number) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Custom Event Name for direct standalone dispatch
const TOAST_EVENT_NAME = 'happy-morning-toast-dispatch';

export interface ToastCustomEventDetail {
  message: string;
  type: ToastType;
  title?: string;
  duration?: number;
}

/**
 * Direct standalone toast API - can be imported and called anywhere
 * without needing to invoke the hook inside every component.
 */
export const toast = {
  success: (message: string, title?: string, duration?: number) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<ToastCustomEventDetail>(TOAST_EVENT_NAME, {
          detail: { message, type: 'success', title: title || 'Success', duration },
        })
      );
    }
  },
  error: (message: string, title?: string, duration?: number) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<ToastCustomEventDetail>(TOAST_EVENT_NAME, {
          detail: { message, type: 'error', title: title || 'Error', duration },
        })
      );
    }
  },
  warning: (message: string, title?: string, duration?: number) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<ToastCustomEventDetail>(TOAST_EVENT_NAME, {
          detail: { message, type: 'warning', title: title || 'Notice', duration },
        })
      );
    }
  },
  info: (message: string, title?: string, duration?: number) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<ToastCustomEventDetail>(TOAST_EVENT_NAME, {
          detail: { message, type: 'info', title: title || 'Information', duration },
        })
      );
    }
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string, duration: number = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast: ToastMessage = {
        id,
        type,
        title: title || (type === 'success' ? 'Success' : type === 'error' ? 'Error' : type === 'warning' ? 'Notice' : 'Information'),
        message,
        duration,
      };

      setToasts((prev) => [...prev.slice(-4), newToast]); // Keep at most 5 toasts visible at once
    },
    []
  );

  // Listen for standalone dispatched toast events
  useEffect(() => {
    const handleCustomToast = (e: Event) => {
      const customEvent = e as CustomEvent<ToastCustomEventDetail>;
      if (customEvent.detail) {
        const { message, type, title, duration } = customEvent.detail;
        showToast(message, type, title, duration);
      }
    };

    window.addEventListener(TOAST_EVENT_NAME, handleCustomToast);
    return () => window.removeEventListener(TOAST_EVENT_NAME, handleCustomToast);
  }, [showToast]);

  const toastMethods = React.useMemo(
    () => ({
      success: (msg: string, title?: string, dur?: number) => showToast(msg, 'success', title, dur),
      error: (msg: string, title?: string, dur?: number) => showToast(msg, 'error', title, dur),
      warning: (msg: string, title?: string, dur?: number) => showToast(msg, 'warning', title, dur),
      info: (msg: string, title?: string, dur?: number) => showToast(msg, 'info', title, dur),
    }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast, toast: toastMethods }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Graceful fallback to standalone toast functions if used outside provider
    return {
      showToast: (msg: string, type?: ToastType, title?: string, dur?: number) => {
        if (type === 'success') toast.success(msg, title, dur);
        else if (type === 'error') toast.error(msg, title, dur);
        else if (type === 'warning') toast.warning(msg, title, dur);
        else toast.info(msg, title, dur);
      },
      dismissToast: () => {},
      toast,
    };
  }
  return context;
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="clinic-toast-container"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: () => void;
}) {
  const [isPaused, setIsPaused] = useState(false);
  const duration = toast.duration || 4000;

  useEffect(() => {
    if (isPaused) return;

    const timer = setTimeout(() => {
      onDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, isPaused, onDismiss]);

  return (
    <div
      className={`clinic-toast-card toast-${toast.type}`}
      role="alert"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="toast-icon-wrap" aria-hidden="true">
        {toast.type === 'success' && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        )}
        {toast.type === 'error' && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
        {toast.type === 'warning' && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        )}
        {toast.type === 'info' && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        )}
      </div>

      <div className="toast-content">
        {toast.title && <strong className="toast-title">{toast.title}</strong>}
        <p className="toast-message">{toast.message}</p>
      </div>

      <button
        type="button"
        className="toast-close-btn"
        onClick={onDismiss}
        aria-label="Close notification"
        title="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Subtle Progress Bar */}
      <div
        className="toast-progress-bar"
        style={{
          animationDuration: `${duration}ms`,
          animationPlayState: isPaused ? 'paused' : 'running',
        }}
      />
    </div>
  );
}

