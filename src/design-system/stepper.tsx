'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

/**
 * Formulario por pasos (PRD §5.3).
 *
 * El PRD pide siete cosas para los trámites largos, y las siete están aquí
 * porque las siete se pierden si se dejan «para después»:
 *
 *  1. procesos divididos en pasos comprensibles;
 *  2. indicador de avance **y tiempo estimado**;
 *  3. guardado automático;
 *  4. posibilidad de pausar y continuar;
 *  5. resumen antes de enviar;
 *  6. una decisión principal por bloque;
 *  7. errores explicados junto al campo.
 *
 * El borrador vive en `localStorage` y **no** viaja al servidor mientras el
 * trámite no se envía. Un trámite a medias suele contener datos que la persona
 * todavía no decidió compartir: guardarlos en el servidor «por comodidad» los
 * convierte en un dato tratado sin base para tratarlo.
 */

export interface Step {
  readonly id: string;
  readonly title: string;
  /** Qué se pide aquí, en una frase y sin jerga. */
  readonly summary: string;
  /** Minutos aproximados. Alimenta el tiempo estimado restante. */
  readonly minutes: number;
  readonly render: (props: { draft: Record<string, string>; set: (campo: string, valor: string) => void }) => ReactNode;
  /** Devuelve los errores del paso. Vacío significa que se puede avanzar. */
  readonly validate?: (draft: Record<string, string>) => Record<string, string[]>;
}

export interface StepperProps {
  readonly steps: readonly Step[];
  /** Clave del borrador. Debe ser estable y propia del trámite. */
  readonly draftKey: string;
  readonly submitLabel: string;
  /** Recibe el borrador completo. Solo se llama tras el resumen. */
  readonly action: (formData: FormData) => void | Promise<void>;
  readonly summaryTitle?: string;
}

/**
 * Lectura del borrador guardado, segura en el servidor.
 *
 * `useSyncExternalStore` es la forma correcta de leer algo que vive fuera de
 * React —aquí, el almacenamiento del navegador— sin provocar un desajuste de
 * hidratación: la instantánea del servidor es siempre `null`, y el navegador
 * aporta la suya en cuanto puede.
 */
function useStoredDraft(draftKey: string): string | null {
  const suscribir = useCallback(
    (avisar: () => void) => {
      // Otra pestaña con el mismo trámite abierto cambia el mismo borrador.
      window.addEventListener('storage', avisar);
      return () => window.removeEventListener('storage', avisar);
    },
    [],
  );

  const leer = useCallback(() => {
    try {
      return window.localStorage.getItem(draftKey);
    } catch {
      // Almacenamiento bloqueado por la configuración del navegador.
      return null;
    }
  }, [draftKey]);

  return useSyncExternalStore(suscribir, leer, () => null);
}

export function Stepper({ steps, draftKey, submitLabel, action, summaryTitle = 'Revisa antes de enviar' }: StepperProps) {
  const [indice, setIndice] = useState(0);
  const [errores, setErrores] = useState<Record<string, string[]>>({});
  const [descartado, setDescartado] = useState(false);
  const encabezado = useRef<HTMLHeadingElement>(null);
  const idAvance = useId();

  /* ---- 4 · Pausar y continuar ----------------------------------------- */
  const almacenado = useStoredDraft(draftKey);
  const borradorPrevio = useMemo<Record<string, string>>(() => {
    if (almacenado === null || descartado) return {};
    try {
      const valores = JSON.parse(almacenado) as Record<string, string>;
      return typeof valores === 'object' && valores !== null ? valores : {};
    } catch {
      // Un borrador ilegible no puede impedir empezar el trámite.
      return {};
    }
  }, [almacenado, descartado]);

  // Lo escrito en esta sesión se superpone a lo recuperado.
  const [edicion, setEdicion] = useState<Record<string, string>>({});
  const draft = useMemo(() => ({ ...borradorPrevio, ...edicion }), [borradorPrevio, edicion]);
  const recuperado = Object.keys(borradorPrevio).length > 0 && Object.keys(edicion).length === 0;

  const enResumen = indice === steps.length;

  /* ---- 3 · Guardado automático ---------------------------------------- */
  //
  // El estado del indicador se **deriva** de comparar lo escrito con lo último
  // que llegó a guardarse. Ponerlo en un efecto obligaría a un `setState`
  // durante el renderizado, que es la clase de cascada que React 19 señala.
  const [ultimoGuardado, setUltimoGuardado] = useState<string | null>(null);
  const serializado = useMemo(() => JSON.stringify(draft), [draft]);
  const guardado =
    Object.keys(draft).length === 0 ? 'inicial' : serializado === ultimoGuardado ? 'guardado' : 'guardando';

  useEffect(() => {
    if (Object.keys(edicion).length === 0) return;
    const temporizador = window.setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, serializado);
        setUltimoGuardado(serializado);
      } catch {
        // Sin espacio o con el almacenamiento bloqueado: el trámite sigue.
      }
    }, 400);
    return () => window.clearTimeout(temporizador);
  }, [serializado, draftKey, edicion]);

  const set = useCallback((campo: string, valor: string) => {
    setEdicion((previo) => ({ ...previo, [campo]: valor }));
    // El error de un campo desaparece en cuanto se toca: mantenerlo mientras la
    // persona corrige es decirle que sigue equivocada mientras deja de estarlo.
    setErrores((previo) => {
      if (previo[campo] === undefined) return previo;
      const siguiente = { ...previo };
      delete siguiente[campo];
      return siguiente;
    });
  }, []);

  const minutosRestantes = useMemo(
    () => steps.slice(indice).reduce((total, paso) => total + paso.minutes, 0),
    [steps, indice],
  );

  const irA = useCallback((destino: number) => {
    setIndice(destino);
    // Se mueve el foco al encabezado del paso: sin esto, quien navega con
    // teclado o lector de pantalla se queda al final del paso anterior.
    window.requestAnimationFrame(() => encabezado.current?.focus());
  }, []);

  function avanzar() {
    const paso = steps[indice];
    const problemas = paso?.validate?.(draft) ?? {};
    if (Object.keys(problemas).length > 0) {
      setErrores(problemas);
      return;
    }
    irA(indice + 1);
  }

  const pasoActual = steps[indice];

  return (
    <div className="space-y-6">
      {/* ---- 2 · Indicador de avance y tiempo estimado -------------------- */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p id={idAvance} className="font-medium">
            {enResumen ? `Resumen · último paso` : `Paso ${indice + 1} de ${steps.length}: ${pasoActual?.title ?? ''}`}
          </p>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {enResumen ? 'Casi terminas' : `Quedan unos ${minutosRestantes} minutos`}
          </p>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-sunken)]"
          role="progressbar"
          aria-labelledby={idAvance}
          aria-valuenow={indice}
          aria-valuemin={0}
          aria-valuemax={steps.length}
        >
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out)]"
            style={{ width: `${(indice / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* ---- 4 · Pausar y continuar -------------------------------------- */}
      {recuperado && (
        <div role="status" className="rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-4">
          <p className="font-semibold text-[var(--color-accent-ink)]">Recuperamos lo que habías escrito</p>
          <p className="mt-1 text-sm">
            Puedes seguir donde lo dejaste. Si prefieres empezar de nuevo, borra el borrador.
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                window.localStorage.removeItem(draftKey);
              } catch {
                // Nada que borrar si el almacenamiento está bloqueado.
              }
              setDescartado(true);
              setEdicion({});
              setUltimoGuardado(null);
              irA(0);
            }}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-[var(--color-line-strong)] px-4 font-medium"
          >
            Empezar de nuevo
          </button>
        </div>
      )}

      <form
        action={action}
        onSubmit={(evento) => {
          // Solo se envía desde el resumen. Enviar antes saltaría la revisión.
          if (!enResumen) evento.preventDefault();
        }}
        className="space-y-6"
      >
        {/* El borrador viaja como campos ocultos: el envío funciona igual que
            cualquier formulario del servidor. */}
        {enResumen &&
          Object.entries(draft).map(([campo, valor]) => <input key={campo} type="hidden" name={campo} value={valor} />)}

        <h2 ref={encabezado} tabIndex={-1} className="text-xl font-semibold outline-none">
          {enResumen ? summaryTitle : (pasoActual?.title ?? '')}
        </h2>

        {!enResumen && pasoActual !== undefined && (
          <>
            {/* ---- 6 · Una decisión principal por bloque ------------------ */}
            <p className="max-w-[var(--width-prose)] text-[var(--color-ink-soft)]">{pasoActual.summary}</p>

            {Object.keys(errores).length > 0 && (
              <div role="alert" className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4">
                <p className="font-semibold text-[var(--color-danger)]">Revisa lo marcado para continuar</p>
              </div>
            )}

            <div className="space-y-5">{pasoActual.render({ draft, set })}</div>
          </>
        )}

        {/* ---- 5 · Resumen antes de enviar ----------------------------- */}
        {enResumen && (
          <>
            <p className="max-w-[var(--width-prose)] text-[var(--color-ink-soft)]">
              Esto es lo que vas a enviar. Puedes corregir cualquier paso antes de confirmar.
            </p>
            <dl className="divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
              {steps.map((paso, numero) => (
                <div key={paso.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <dt className="font-medium">{paso.title}</dt>
                    <dd className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      {resumirPaso(paso, draft)}
                    </dd>
                  </div>
                  <button
                    type="button"
                    onClick={() => irA(numero)}
                    className="min-h-11 shrink-0 rounded-lg px-3 font-medium text-[var(--color-accent-ink)] underline underline-offset-4"
                  >
                    Corregir
                    <span className="sr-only"> el paso {paso.title}</span>
                  </button>
                </div>
              ))}
            </dl>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {indice > 0 && (
            <button
              type="button"
              onClick={() => irA(indice - 1)}
              className="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-line-strong)] px-5 font-medium"
            >
              Atrás
            </button>
          )}

          {enResumen ? (
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-lg bg-[var(--color-accent)] px-5 font-medium text-[var(--color-ink-inverse)]"
            >
              {submitLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={avanzar}
              className="inline-flex min-h-11 items-center rounded-lg bg-[var(--color-accent)] px-5 font-medium text-[var(--color-ink-inverse)]"
            >
              Continuar
            </button>
          )}

          {/* ---- 3 · Guardado automático, dicho sin alarmar --------------- */}
          <p aria-live="polite" className="text-sm text-[var(--color-ink-soft)]">
            {guardado === 'guardado'
              ? 'Guardado en este dispositivo. Puedes cerrar y volver.'
              : guardado === 'guardando'
                ? 'Guardando…'
                : ''}
          </p>
        </div>
      </form>
    </div>
  );
}

/** Qué se escribió en un paso, en una línea. Vacío se dice, no se omite. */
function resumirPaso(paso: Step, draft: Record<string, string>): string {
  const problemas = paso.validate?.(draft) ?? {};
  if (Object.keys(problemas).length > 0) return 'Falta completar este paso';

  const valores = Object.entries(draft)
    .filter(([, valor]) => valor.trim() !== '')
    .map(([, valor]) => valor.trim());

  return valores.length === 0 ? 'Sin completar' : valores.slice(0, 3).join(' · ');
}
