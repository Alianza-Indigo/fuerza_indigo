'use client';

import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

/**
 * Estado de la conexión (F2-PWA-003, PRD §5.4, §17.6).
 *
 * `useSyncExternalStore` y no un efecto con estado: el valor lo tiene el
 * navegador, y leerlo con `useState` + `useEffect` produce un primer pintado
 * con un valor inventado y otro inmediato con el verdadero. En el servidor
 * devuelve «hay conexión», que es lo correcto: una página servida desde el
 * servidor llegó por la red.
 */

function suscribir(alCambiar: () => void): () => void {
  window.addEventListener('online', alCambiar);
  window.addEventListener('offline', alCambiar);
  return () => {
    window.removeEventListener('online', alCambiar);
    window.removeEventListener('offline', alCambiar);
  };
}

export function useHayConexion(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Aviso persistente de que no hay conexión.
 *
 * Se anuncia con `role="status"` y no `alert`: perder la conexión no es un
 * error de la persona ni exige atención inmediata, y un `alert` interrumpe la
 * lectura de un lector de pantalla en mitad de una frase.
 *
 * No se pinta nada mientras hay conexión. Un indicador verde permanente de «hay
 * conexión» ocupa sitio para decir lo que ya se ve.
 */
export function ConnectionNotice() {
  const hayConexion = useHayConexion();
  if (hayConexion) return null;

  return (
    <div
      role="status"
      className="border-b border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-4 py-2 text-center text-sm text-[var(--color-ink)]"
    >
      <strong className="font-semibold">Estás sin conexión.</strong> Puedes seguir leyendo lo que ya se cargó;
      enviar formularios y entrar a tu cuenta necesitan conexión.
    </div>
  );
}

/**
 * Envuelve una acción que **no** funciona sin conexión.
 *
 * Distinto de `RequiresConnection` de las primitivas, que es la nota estática
 * que se ve siempre y funciona sin JavaScript. Esta reacciona al estado real:
 * mientras hay red no pinta nada de más, y cuando se cae dice qué pasa y qué
 * hacer. Deshabilitar el control sin explicar por qué deja a la persona
 * probando otra vez; deshabilitarlo diciéndolo evita además que pierda lo que
 * escribió en un envío que iba a fallar.
 */
export function OfflineGuard({ children, accion }: { children: ReactNode; accion: string }) {
  const hayConexion = useHayConexion();

  if (hayConexion) return <>{children}</>;

  return (
    <div className="space-y-3">
      <div
        role="status"
        className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-[var(--color-ink)]"
      >
        <p className="font-semibold">Esto necesita conexión</p>
        <p className="mt-1">
          {accion} en cuanto vuelvas a tener red. Lo que hayas escrito sigue aquí: no cierres la página.
        </p>
      </div>
      <div aria-hidden="true" className="pointer-events-none opacity-50">
        {children}
      </div>
    </div>
  );
}
