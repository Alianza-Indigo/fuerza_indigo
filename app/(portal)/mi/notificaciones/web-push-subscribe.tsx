'use client';

import { useState } from 'react';
import { Notice } from '@/design-system/primitives';

const BOTON =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-medium text-[var(--color-ink-inverse)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60';
const BOTON_SECUNDARIO =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--color-line-strong)] px-4 font-medium disabled:opacity-60';

/**
 * Activar o desactivar los avisos web en este dispositivo (PRD §16.2, Fase 9
 * bloque D).
 *
 * **La autorización explícita, del lado de la persona.** Activar pide el permiso
 * del navegador y guarda la suscripción; sin ese permiso, el servidor no tiene a
 * dónde entregar. Es lo que distingue la web del centro y del correo: la web no
 * llega a quien no la pidió, en el dispositivo donde la pidió.
 *
 * Necesita JavaScript —el navegador solo se suscribe con su API—, así que se
 * degrada con claridad: si no hay soporte o no hay clave configurada, lo dice en
 * vez de ofrecer un botón muerto.
 */

const VAPID = process.env['NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY'] ?? '';

function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const salida = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) salida[i] = raw.charCodeAt(i);
  return salida;
}

type Estado = 'idle' | 'trabajando' | 'activo' | 'error';

export function WebPushSubscribe({ subscribed }: { subscribed: boolean }) {
  const [estado, setEstado] = useState<Estado>(subscribed ? 'activo' : 'idle');
  const [mensaje, setMensaje] = useState<string>('');

  const soportado =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  if (VAPID === '') {
    return (
      <Notice tone="neutral" title="Los avisos web no están configurados">
        <p>Cuando la organización configure el canal web, aquí podrás activarlos en tu dispositivo.</p>
      </Notice>
    );
  }
  if (!soportado) {
    return (
      <Notice tone="neutral" title="Tu navegador no admite avisos web">
        <p>Puedes seguir recibiendo tus avisos en el centro y por correo.</p>
      </Notice>
    );
  }

  async function activar(): Promise<void> {
    setEstado('trabajando');
    setMensaje('');
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setEstado('error');
        setMensaje('No diste permiso al navegador. Sin él, no podemos enviarte avisos web.');
        return;
      }
      const registro = await navigator.serviceWorker.register('/sw.js');
      const suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(VAPID),
      });
      const respuesta = await fetch('/api/v1/web-push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(suscripcion.toJSON()),
      });
      if (!respuesta.ok) throw new Error('no se pudo guardar');
      setEstado('activo');
      setMensaje('Listo: recibirás avisos web en este dispositivo.');
    } catch {
      setEstado('error');
      setMensaje('No pudimos activar los avisos web. Inténtalo de nuevo.');
    }
  }

  async function desactivar(): Promise<void> {
    setEstado('trabajando');
    setMensaje('');
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      const suscripcion = await registro?.pushManager.getSubscription();
      if (suscripcion) {
        await fetch('/api/v1/web-push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: suscripcion.endpoint }),
        });
        await suscripcion.unsubscribe();
      }
      setEstado('idle');
      setMensaje('Desactivaste los avisos web en este dispositivo.');
    } catch {
      setEstado('error');
      setMensaje('No pudimos desactivar los avisos web. Inténtalo de nuevo.');
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-ink-soft)]">
        Los avisos web te llegan como una notificación del sistema, aunque no tengas la página abierta. Solo en los
        dispositivos donde los actives.
      </p>
      {estado === 'activo' ? (
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => void desactivar()}>
          Desactivar en este dispositivo
        </button>
      ) : (
        <button type="button" className={BOTON} onClick={() => void activar()} disabled={estado === 'trabajando'}>
          {estado === 'trabajando' ? 'Activando…' : 'Activar en este dispositivo'}
        </button>
      )}
      {mensaje !== '' && (
        <p role="status" className="text-sm text-[var(--color-ink-soft)]">
          {mensaje}
        </p>
      )}
    </div>
  );
}
