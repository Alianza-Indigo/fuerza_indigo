'use client';

import { useEffect } from 'react';

/**
 * Registra el trabajador de servicio (F2-PWA-001).
 *
 * Va en un efecto y no en el cuerpo del componente porque el registro es una
 * operación del navegador que no debe ocurrir durante el renderizado. No hay
 * estado que sincronizar: si el registro falla, la aplicación funciona
 * exactamente igual, solo que sin caché ni pantalla de sin conexión. Por eso el
 * fallo se traga en silencio en lugar de molestar a nadie con un aviso sobre
 * una función que no pidió.
 *
 * En desarrollo no se registra, y quien lo decide es el marco del documento y
 * no este componente: la configuración validada se lee en el servidor, nunca
 * desde `process.env` en el navegador (PRD §21). Un trabajador de servicio
 * sirviendo la versión anterior de una página es la forma más rápida de perder
 * una tarde buscando un cambio que sí se guardó.
 */
export function ServiceWorkerRegistration({ habilitado }: { habilitado: boolean }) {
  useEffect(() => {
    if (!habilitado) return;
    if (!('serviceWorker' in navigator)) return;

    const registrar = () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    };

    // Después de `load`: registrarlo durante la carga compite por el ancho de
    // banda con el contenido que la persona está esperando ver.
    if (document.readyState === 'complete') {
      registrar();
      return;
    }

    window.addEventListener('load', registrar);
    return () => window.removeEventListener('load', registrar);
  }, [habilitado]);

  return null;
}
