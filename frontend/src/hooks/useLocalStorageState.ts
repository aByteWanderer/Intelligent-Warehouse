import { useState } from "react";

export function useLocalStorageState<T>(key: string, defaultValue: T) {
  const [value, setValueRaw] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  function setValue(next: T) {
    setValueRaw(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore write failures
    }
  }

  return [value, setValue] as const;
}
