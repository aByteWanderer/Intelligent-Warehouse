import { useRef, useState } from "react";

export type ToastState = { type: "success" | "error"; message: string } | null;

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const timerRef = useRef<number | null>(null);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => setToast(null), 2200);
  }

  return { toast, showToast };
}
