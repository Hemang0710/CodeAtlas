"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, X } from "lucide-react";

interface ErrorAlert {
  id: string;
  message: string;
  timestamp: number;
}

interface ErrorAlertContextValue {
  showError: (message: string) => void;
}

const ErrorAlertContext = createContext<ErrorAlertContextValue | null>(null);

export function useErrorAlert(): ErrorAlertContextValue {
  const ctx = useContext(ErrorAlertContext);
  if (!ctx) {
    throw new Error("useErrorAlert must be used within ErrorAlertProvider");
  }
  return ctx;
}

const AUTO_DISMISS_MS = 6000;

export function ErrorAlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<ErrorAlert[]>([]);

  const showError = useCallback((message: string) => {
    const id = crypto.randomUUID();
    setAlerts((prev) => [...prev, { id, message, timestamp: Date.now() }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  useEffect(() => {
    if (alerts.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setAlerts((prev) =>
        prev.filter((a) => now - a.timestamp < AUTO_DISMISS_MS)
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [alerts.length]);

  useEffect(() => {
    function handleUnhandledRejection(e: PromiseRejectionEvent) {
      const msg =
        e.reason instanceof Error ? e.reason.message : String(e.reason);
      showError(msg);
    }

    function handleError(e: ErrorEvent) {
      showError(e.message);
    }

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);
    return () => {
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection
      );
      window.removeEventListener("error", handleError);
    };
  }, [showError]);

  return (
    <ErrorAlertContext.Provider value={{ showError }}>
      {children}

      {alerts.length > 0 && (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 shadow-lg animate-in slide-in-from-right dark:border-red-800 dark:bg-red-950"
            >
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
              <p className="flex-1 text-sm text-red-800 dark:text-red-200 break-words">
                {alert.message}
              </p>
              <button
                onClick={() => dismiss(alert.id)}
                className="shrink-0 rounded p-0.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
                aria-label="Dismiss error"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ErrorAlertContext.Provider>
  );
}
