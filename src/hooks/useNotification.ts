import { useState, useEffect } from 'react';
import { ToastMessage, NotificationType } from '../types';

let nextId = 1;
const listeners = new Set<(toasts: ToastMessage[]) => void>();
let globalToasts: ToastMessage[] = [];

function notifyListeners() {
  listeners.forEach(fn => fn([...globalToasts]));
}

export function showToast(type: NotificationType, title: string, message: string, durationMs = 4500): void {
  const id = `toast-${nextId++}`;
  const newToast: ToastMessage = {
    id,
    type,
    title,
    message,
    timestamp: Date.now()
  };

  globalToasts = [...globalToasts, newToast];
  notifyListeners();

  if (durationMs > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, durationMs);
  }
}

export function dismissToast(id: string): void {
  globalToasts = globalToasts.filter(t => t.id !== id);
  notifyListeners();
}

export function useNotification() {
  const [toasts, setToasts] = useState<ToastMessage[]>(globalToasts);

  useEffect(() => {
    listeners.add(setToasts);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  return {
    toasts,
    dismiss: dismissToast,
    show: showToast,
    success: (title: string, message: string) => showToast('success', title, message),
    error: (title: string, message: string) => showToast('error', title, message),
    warning: (title: string, message: string) => showToast('warning', title, message),
    info: (title: string, message: string) => showToast('info', title, message)
  };
}
