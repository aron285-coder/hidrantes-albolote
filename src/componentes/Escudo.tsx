/** Escudo de la agrupación: el mismo dibujo que los iconos de la app instalada (07 §7.1). */
export function Escudo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 58 66" className={className} aria-hidden="true">
      <path
        d="M29 2 L54 11 V30 C54 47 43 58 29 64 C15 58 4 47 4 30 V11 Z"
        fill="#0E1B30"
        stroke="#B08A2E"
        strokeWidth="2"
      />
      <path d="M29 14 C34 14 38 18 38 23 C38 30 29 40 29 40 C29 40 20 30 20 23 C20 18 24 14 29 14 Z" fill="#E97136" />
      <circle cx="29" cy="23" r="4.2" fill="#0E1B30" />
    </svg>
  );
}
