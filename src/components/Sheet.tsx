import { useEffect, useState, type ReactNode } from "react";

/**
 * Hoja que sube desde abajo (en escritorio, panel centrado abajo). Se cierra
 * tocando fuera o con Escape.
 *
 * Teclado en móvil: en iOS (y en PWA) el teclado tapa lo que está pegado al
 * fondo de la pantalla. Medimos con visualViewport cuánto ocupa y subimos la
 * hoja justo por encima, para que el campo y los botones sigan a la vista.
 */
export default function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setKeyboard(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={keyboard ? { bottom: keyboard } : undefined} role="dialog" aria-modal="true">
        <div className="sheet-grip" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
