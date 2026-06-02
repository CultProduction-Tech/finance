"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface HintModeValue {
  enabled: boolean;
  toggle: () => void;
}

const HintModeContext = createContext<HintModeValue>({ enabled: false, toggle: () => {} });

const STORAGE_KEY = "dashboard.hintMode";

export function HintModeProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setEnabled(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const toggle = useCallback(() => {
    setEnabled((v) => {
      const next = !v;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      }
      return next;
    });
  }, []);

  return <HintModeContext.Provider value={{ enabled, toggle }}>{children}</HintModeContext.Provider>;
}

export function useHintMode() {
  return useContext(HintModeContext);
}
