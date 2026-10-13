import { useRef, useState } from "react";

/** Distancia (px) a partir de la cual soltar ejecuta la acción. */
const TRIGGER = 80;
/** Hasta dónde se deja arrastrar la fila. */
const MAX = 120;

/**
 * Deslizar una fila con el dedo: derecha -> onRight, izquierda -> onLeft.
 *
 * Solo reacciona a TOQUE (con ratón no se arrastra nada), y solo cuando el
 * gesto es claramente horizontal: si el dedo empieza a moverse en vertical,
 * se suelta y el navegador hace scroll normal. La fila necesita
 * `touch-action: pan-y` para que el scroll vertical siga siendo nativo.
 *
 * Devuelve `consumeClick()`: tras un deslizamiento el navegador dispara
 * igualmente un click, que NO debe abrir la tarea.
 */
export function useSwipe({
  onLeft,
  onRight,
  disabled = false,
}: {
  onLeft?: () => void;
  onRight?: () => void;
  disabled?: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const g = useRef<{ x: number; y: number; id: number; mode: "pending" | "swipe" | "scroll" } | null>(null);
  const justSwiped = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    if (disabled || e.pointerType !== "touch") return;
    g.current = { x: e.clientX, y: e.clientY, id: e.pointerId, mode: "pending" };
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.mode === "pending") {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        s.mode = "scroll"; // es scroll vertical: no es cosa nuestra
        return;
      }
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if ((dx > 0 && !onRight) || (dx < 0 && !onLeft)) return;
        s.mode = "swipe";
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (s.mode === "swipe") {
      // Resistencia pasado el máximo, para que se note el tope.
      const a = Math.abs(dx);
      setOffset(Math.sign(dx) * (a <= MAX ? a : MAX + (a - MAX) * 0.2));
    }
  }

  function end(e: React.PointerEvent) {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    g.current = null;
    if (s.mode === "swipe") {
      justSwiped.current = true;
      setTimeout(() => (justSwiped.current = false), 350);
      const dx = e.clientX - s.x;
      if (dx >= TRIGGER) {
        navigator.vibrate?.(12);
        onRight?.();
      } else if (dx <= -TRIGGER) {
        navigator.vibrate?.(12);
        onLeft?.();
      }
    }
    setDragging(false);
    setOffset(0);
  }

  return {
    offset,
    dragging,
    armed: Math.abs(offset) >= TRIGGER,
    handlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end },
    consumeClick: () => justSwiped.current,
  };
}
