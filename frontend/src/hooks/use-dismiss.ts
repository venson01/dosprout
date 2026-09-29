"use client";

import { useEffect, type RefObject } from "react";

/** Calls onDismiss when the user clicks outside `ref` or presses Escape (used by pop-up menus). */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;
    function handlePointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [ref, open, onDismiss]);
}
