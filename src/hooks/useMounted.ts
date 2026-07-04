import { useEffect, useState } from "react";

/** true solo tras el primer paint en el cliente — evita mismatch de hidratación. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
