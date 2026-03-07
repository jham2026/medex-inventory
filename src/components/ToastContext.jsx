import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

const ICONS = {
  success: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6.5" fill="#16A34A"/>
      <path d="M4.5 7.5l2.5 2.5 4-4" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  error: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6.5" fill="#DC2626"/>
      <path d="M5 5l5 5M10 5l-5 5" stroke="white" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  ),
  warning: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 2L13.5 12.5H1.5L7.5 2z" fill="#D97706"/>
      <path d="M7.5 6v3M7.5 10.5v.5" stroke="white" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  ),
  info: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6.5" fill="#1565C0"/>
      <path d="M7.5 7v4M7.5 5v.5" stroke="white" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  ),
};

// Support "title | message" syntax or plain message
function parseMessage(m) {
  if (typeof m === 'string' && m.includes(' | ')) {
    const idx = m.indexOf(' | ');
    return { title: m.slice(0, idx), msg: m.slice(idx + 3) };
  }
  return { title: null, msg: m };
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    // Auto-dismiss after 5 seconds
    const timer = setTimeout(() => {
      setToasts(t => t.map(x => x.id === id ? { ...x, removing: true } : x));
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 250);
    }, 5000);
    setToasts(t => [...t, { id, message, type, timer, removing: false }]);
  }, []);

  function dismissOne(id) {
    setToasts(t => t.map(x => x.id === id ? { ...x, removing: true } : x));
    setTimeout(() => {
      setToasts(t => {
        const toast = t.find(x => x.id === id);
        if (toast) clearTimeout(toast.timer);
        return t.filter(x => x.id !== id);
      });
    }, 250);
  }

  const toast = {
    success: (m) => addToast(m, 'success'),
    error:   (m) => addToast(m, 'error'),
    info:    (m) => addToast(m, 'info'),
    warning: (m) => addToast(m, 'warning'),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack">
        {toasts.map(t => {
          const { title, msg } = parseMessage(t.message);
          return (
            <div
              key={t.id}
              className={`toast-notif toast-notif-${t.type}${t.removing ? ' toast-removing' : ''}`}
              onClick={() => dismissOne(t.id)}
            >
              <div className="toast-notif-icon">{ICONS[t.type]}</div>
              <div className="toast-notif-body">
                {title && <div className="toast-notif-title">{title}</div>}
                <div className={title ? 'toast-notif-msg' : 'toast-notif-title'}>{msg}</div>
              </div>
              <div className="toast-notif-close">&#x2715;</div>
              <div className="toast-notif-progress"></div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
