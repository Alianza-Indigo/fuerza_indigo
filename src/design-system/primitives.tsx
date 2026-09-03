import type { ReactNode } from 'react';

/**
 * Primitivas mínimas de la Fase 1.
 *
 * El sistema de diseño completo es alcance de la Fase 2 (PRD §24). Estas
 * primitivas existen para que las pantallas de esta fase cumplan lo que el PRD
 * §5 exige desde ya: etiquetas visibles, errores junto al campo, foco visible,
 * objetivos táctiles cómodos y estados vacíos que distingan «aún no hay nada»
 * de «no hay resultados para estos filtros».
 */

/* -------------------------------------------------------------------------- */
/* Estructura                                                                 */
/* -------------------------------------------------------------------------- */

export function PageShell({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string | undefined;
  children: ReactNode;
  actions?: ReactNode | undefined;
}) {
  return (
    <main id="contenido" className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {description !== undefined && (
            <p className="max-w-prose text-[var(--color-ink-soft)]">{description}</p>
          )}
        </div>
        {actions !== undefined && <div className="flex shrink-0 gap-2">{actions}</div>}
      </header>
      {children}
    </main>
  );
}

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string | undefined;
  children: ReactNode;
  footer?: ReactNode | undefined;
}) {
  return (
    <main id="contenido" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description !== undefined && (
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{description}</p>
        )}
        <div className="mt-6">{children}</div>
      </div>
      {footer !== undefined && <div className="mt-6 text-center text-sm">{footer}</div>}
    </main>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-5 ${className}`}
    >
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Formularios                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Campo con etiqueta **visible** y error junto al campo.
 *
 * La etiqueta nunca se sustituye por un texto de marcador: al escribir, el
 * marcador desaparece y la persona pierde la referencia de qué se le pedía
 * (PRD §5.2).
 */
export function Field({
  name,
  label,
  type = 'text',
  hint,
  errors,
  required = false,
  autoComplete,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string | undefined;
  hint?: string | undefined;
  errors?: readonly string[] | undefined;
  required?: boolean | undefined;
  autoComplete?: string | undefined;
  defaultValue?: string | undefined;
}) {
  const hintId = hint === undefined ? undefined : `${name}-ayuda`;
  const errorId = errors === undefined || errors.length === 0 ? undefined : `${name}-error`;
  const describedBy = [hintId, errorId].filter((value) => value !== undefined).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
        {required && (
          <span className="ml-1 text-[var(--color-danger)]" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (obligatorio)</span>}
      </label>

      {hint !== undefined && (
        <p id={hintId} className="text-sm text-[var(--color-ink-soft)]">
          {hint}
        </p>
      )}

      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-describedby={describedBy}
        aria-invalid={errorId !== undefined}
        className="min-h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-base"
      />

      {errorId !== undefined && (
        <ul id={errorId} className="space-y-1 text-sm text-[var(--color-danger)]">
          {errors!.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SubmitButton({ children, variant = 'primary' }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'danger' | undefined }) {
  const styles = {
    primary: 'bg-[var(--color-indigo-600)] text-white hover:bg-[var(--color-indigo-700)]',
    secondary: 'border border-[var(--color-line)] hover:bg-[var(--color-indigo-50)]',
    danger: 'bg-[var(--color-danger)] text-white',
  }[variant];

  return (
    <button
      type="submit"
      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-2.5 font-medium transition-colors ${styles}`}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Estados obligatorios (PRD §5.4)                                            */
/* -------------------------------------------------------------------------- */

export function ErrorNotice({ title, children }: { title: string; children?: ReactNode | undefined }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4 text-sm"
    >
      <p className="font-semibold">{title}</p>
      {children !== undefined && <div className="mt-1">{children}</div>}
    </div>
  );
}

export function SuccessNotice({ title, children }: { title: string; children?: ReactNode | undefined }) {
  return (
    <div role="status" className="rounded-lg border border-[var(--color-success)] p-4 text-sm">
      <p className="font-semibold">{title}</p>
      {children !== undefined && <div className="mt-1">{children}</div>}
    </div>
  );
}

/**
 * Vacío genuino: **aún no existe nada**.
 *
 * Es deliberadamente distinto de `NoResults`: confundirlos hace que alguien
 * crea que el sistema está vacío cuando en realidad su filtro es demasiado
 * estrecho (PRD §5.4).
 */
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode | undefined }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-line)] p-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-prose text-sm text-[var(--color-ink-soft)]">{description}</p>
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Sin resultados **para los filtros actuales**. */
export function NoResults({ action }: { action?: ReactNode | undefined }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-line)] p-8 text-center">
      <p className="font-medium">Ningún resultado con estos filtros</p>
      <p className="mx-auto mt-1 max-w-prose text-sm text-[var(--color-ink-soft)]">
        Hay registros en el sistema, pero ninguno coincide con lo que buscas. Prueba a quitar algún filtro.
      </p>
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'neutral' | 'success' | 'danger' | 'warning'; children: ReactNode }) {
  const styles = {
    neutral: 'border-[var(--color-line)] text-[var(--color-ink-soft)]',
    success: 'border-[var(--color-success)] text-[var(--color-success)]',
    danger: 'border-[var(--color-danger)] text-[var(--color-danger)]',
    warning: 'border-[var(--color-indigo-500)] text-[var(--color-indigo-600)]',
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}>
      {children}
    </span>
  );
}

/** Tabla con desplazamiento propio: el cuerpo de la página nunca se desplaza en horizontal. */
export function ScrollableTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-line)]">
      <table className="w-full min-w-[40rem] border-collapse text-sm">{children}</table>
    </div>
  );
}
