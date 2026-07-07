"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

interface HintModeValue {
  enabled: boolean;
  toggle: () => void;
}

const HintModeContext = createContext<HintModeValue>({ enabled: false, toggle: () => {} });

const STORAGE_KEY = "dashboard.hintMode";
const CHANGE_EVENT = "dashboard.hintMode.change";

// localStorage как external store (useSyncExternalStore вместо setState в эффекте):
// на сервере/при гидрации — false, после гидрации React сам подхватывает
// клиентское значение. Без лишнего цикла перерисовки и hydration mismatch.
function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback); // синхронизация между вкладками
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function getServerSnapshot(): boolean {
  return false;
}

export function HintModeProvider({ children }: { children: React.ReactNode }) {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = window.localStorage.getItem(STORAGE_KEY) !== "1";
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return <HintModeContext.Provider value={{ enabled, toggle }}>{children}</HintModeContext.Provider>;
}

export function useHintMode() {
  return useContext(HintModeContext);
}
