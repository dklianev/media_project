import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
    success: CheckCircle,
    error: XCircle,
    info: Info,
    warning: AlertTriangle,
};

function Toast({ toast, onDismiss }) {
    const Icon = ICONS[toast.type] || ICONS.info;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20, scale: 0.92, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 10, scale: 0.95, filter: 'blur(4px)' }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className={`toast toast-${toast.type} flex items-center gap-2.5`}
            role="alert"
        >
            <Icon className="w-4.5 h-4.5 flex-shrink-0" />
            <span className="flex-1 text-sm">{toast.message}</span>
            <button
                onClick={onDismiss}
                className="p-0.5 rounded hover:bg-white/15 transition-colors flex-shrink-0"
                aria-label="Затвори"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </motion.div>
    );
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = 'success', duration = 3500) => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev.slice(-2), { id, message, type }]);

        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
    }, []);

    const dismiss = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed right-4 bottom-4 z-[9999] flex flex-col gap-2 max-w-sm">
                <AnimatePresence mode="popLayout">
                    {toasts.map((t) => (
                        <Toast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}

export function useToastContext() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToastContext must be used within ToastProvider');
    return ctx;
}
