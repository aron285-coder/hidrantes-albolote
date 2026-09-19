import { useEffect, useState } from 'react';

/** Re-render periódico para que "hace N min" no se quede quieto. */
export function useReloj(cadaMs = 30_000): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), cadaMs);
    return () => clearInterval(t);
  }, [cadaMs]);
  return ahora;
}
