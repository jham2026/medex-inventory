import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    const timer = setTimeout(() => {
      setToasts(t => t.filter(x => x.id !== id));
    }, 10000);
    setToasts(t => [...t, { id, message, type, timer }]);
  }, []);

  function dismissAll() {
    setToasts(t => {
      t.forEach(x => clearTimeout(x.timer));
      return [];
    });
  }

  function dismissOne(id) {
    setToasts(t => {
      const toast = t.find(x => x.id === id);
      if (toast) clearTimeout(toast.timer);
      return t.filter(x => x.id !== id);
    });
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
      {toasts.length > 0 && (
        <div className="toast-backdrop" onClick={dismissAll}>
          <div className="toast-container" onClick={e => e.stopPropagation()}>
            {toasts.map(t => (
              <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismissOne(t.id)}>
                <span>{t.message}</span>
                <span className="toast-close">✕</span>
              </div>
            ))}
            <div className="toast-hint">Click anywhere to dismiss</div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
