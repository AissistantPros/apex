import { useEffect, useRef } from 'react';

// Cuando un bloque colapsable se despliega, lo trae a la vista en vez de
// dejar que el usuario tenga que seguir haciendo scroll para verlo.
export function useRevealScroll<T extends HTMLElement = HTMLDivElement>(active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => cancelAnimationFrame(id);
  }, [active]);

  return ref;
}
