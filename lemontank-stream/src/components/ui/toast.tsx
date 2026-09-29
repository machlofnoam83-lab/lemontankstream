"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Icon } from "./icons";

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };
type ToastContextValue = { push: (message: string, tone?: Toast["tone"]) => void };

const ToastContext = createContext<ToastContextValue>({ push: () => undefined });

export const useToast = () => useContext(ToastContext);

/**
 * התראות — "פתקים שנחתו על השולחן".
 *
 * כל פתק נכנס בתנועת דיו (זמן, לא קפיצה), נושא אייקון חרות לפי הטון, ויוצא
 * בדהייה. אין צל ניאון ואין פינות עגולות: מסגרת פליז, חיתוך פינה, ורקע
 * אובסידיאן. aria-live נשמר — קורא מסך מקריא כל התראה.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  const TONE = {
    success: { border: "border-verdigris-400/45", text: "text-verdigris-300", icon: "check" as const },
    error: { border: "border-oxblood-500/60", text: "text-ember-300", icon: "warn" as const },
    info: { border: "border-brass-400/35", text: "text-brass-200", icon: "info" as const },
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed bottom-4 left-1/2 z-[90] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2"
      >
        {toasts.map((t) => {
          const tone = TONE[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className={`animate-ink-in pointer-events-auto flex items-start gap-2.5 border ${tone.border} bg-obsidian-900/95 px-4 py-3 text-sm text-parchment-100 chamfer shadow-[0_24px_60px_-30px_rgba(0,0,0,1)] backdrop-blur`}
            >
              <Icon name={tone.icon} className={`mt-0.5 size-4 shrink-0 ${tone.text}`} />
              <span className="leading-relaxed">{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
