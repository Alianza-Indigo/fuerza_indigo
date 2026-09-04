import type { ReactNode } from 'react';

/**
 * Primitivas del sistema de diseño (PRD §5).
 *
 * Todas son componentes de servidor: no llevan estado ni interacción propia.
 * Lo que necesita el navegador —un diálogo, un formulario por pasos— vive en
 * archivos aparte marcados como cliente, para que la interactividad sea una
 * decisión visible y no algo que se cuela por herencia.
 *
 * Ninguna acepta `className` libre. Un componente que se puede repintar desde
 * fuera deja de ser un sistema: a los tres meses hay cinco botones que se
 * parecen y ninguno cumple el contraste verificado. Lo que varía se expresa
 * como variante con nombre.
 */

/* -------------------------------------------------------------------------- */
/* Estructura                                                                 */
/* -------------------------------------------------------------------------- */

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
export type Module = 'sindicato' | 'alianza' | 'cian' | 'ceni' | 'herramientas';

const MODULE_ACCENT: Record<Module, string> = {
  sindicato: 'text-[var(--color-indigo-600)] border-[var(--color-indigo-500)] bg-[var(--color-indigo-50)]',
  alianza: 'text-[var(--color-alianza-600)] border-[var(--color-alianza-500)] bg-[var(--color-alianza-50)]',
  cian: 'text-[var(--color-cian-600)] border-[var(--color-cian-500)] bg-[var(--color-cian-50)]',
  ceni: 'text-[var(--color-ceni-600)] border-[var(--color-ceni-500)] bg-[var(--color-ceni-50)]',
  herramientas: 'text-[var(--color-tools-600)] border-[var(--color-tools-500)] bg-[var(--color-tools-50)]',
};

export function PageShell({
  title,
  description,
  children,
  actions,
  width = 'normal',
}: {
  title: string;
  description?: string | undefined;
  children: ReactNode;
  actions?: ReactNode | undefined;
  width?: 'normal' | 'ancha' | 'lectura' | undefined;
}) {
  const anchura =
    width === 'ancha' ? 'max-w-6xl' : width === 'lectura' ? 'max-w-[var(--width-prose)]' : 'max-w-5xl';

  return (
    <main id="contenido" className={`mx-auto w-full ${anchura} px-4 py-8 sm:px-6 sm:py-12`}>
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h1>
          {description !== undefined && (
            <p className="max-w-[var(--width-prose)] text-lg text-[var(--color-ink-soft)]">{description}</p>
          )}
        </div>
        {actions !== undefined && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
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
      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-6 shadow-[var(--shadow-raised)] sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description !== undefined && (
          <p className="mt-2 text-[var(--color-ink-soft)]">{description}</p>
        )}
        <div className="mt-6">{children}</div>
      </div>
      {footer !== undefined && <div className="mt-6 text-center text-sm">{footer}</div>}
    </main>
  );
}

export function Card({
  children,
  tone = 'neutral',
  as: Etiqueta = 'section',
}: {
  children: ReactNode;
  tone?: Tone | undefined;
  as?: 'section' | 'article' | 'div' | undefined;
}) {
  const borde =
    tone === 'danger'
      ? 'border-[var(--color-danger)]'
      : tone === 'warning'
        ? 'border-[var(--color-warning)]'
        : tone === 'success'
          ? 'border-[var(--color-success)]'
          : tone === 'accent'
            ? 'border-[var(--color-accent)]'
            : 'border-[var(--color-line)]';

  return (
    <Etiqueta
      className={`rounded-xl border ${borde} bg-[var(--color-surface-raised)] p-5 shadow-[var(--shadow-subtle)] sm:p-6`}
    >
      {children}
    </Etiqueta>
  );
}

/** Sección con título accesible. Evita los `div` anidados sin semántica. */
export function Section({
  title,
  description,
  children,
  level = 2,
  secondary = false,
}: {
  title: string;
  description?: string | undefined;
  children: ReactNode;
  level?: 2 | 3 | undefined;
  /** Marca la sección como secundaria para el modo de enfoque (PRD §5.3). */
  secondary?: boolean | undefined;
}) {
  const Encabezado = level === 3 ? 'h3' : 'h2';
  return (
    <section {...(secondary ? { 'data-secondary': '' } : {})}>
      <Encabezado className={level === 3 ? 'text-lg font-semibold' : 'text-xl font-semibold'}>{title}</Encabezado>
      {description !== undefined && (
        <p className="mt-1 max-w-[var(--width-prose)] text-[var(--color-ink-soft)]">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Acciones                                                                   */
/* -------------------------------------------------------------------------- */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-accent)] text-[var(--color-ink-inverse)] hover:bg-[var(--color-accent-hover)] shadow-[var(--shadow-subtle)]',
  secondary:
    'border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]',
  ghost: 'text-[var(--color-accent-ink)] hover:bg-[var(--color-accent-soft)]',
  danger: 'bg-[var(--color-danger)] text-[var(--color-ink-inverse)] hover:brightness-110',
};

/**
 * Base compartida por botones y enlaces con apariencia de botón.
 *
 * `min-h-11` son 44 px: el objetivo táctil mínimo del PRD §5.2. Está aquí y no
 * en cada llamada para que no pueda olvidarse en una.
 */
const BUTTON_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2.5 font-medium transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] disabled:cursor-not-allowed disabled:opacity-60';

export function SubmitButton({
  children,
  variant = 'primary',
  full = false,
}: {
  children: ReactNode;
  variant?: ButtonVariant | undefined;
  full?: boolean | undefined;
}) {
  return (
    <button type="submit" className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${full ? 'w-full' : ''}`}>
      {children}
    </button>
  );
}

/** Enlace con apariencia de botón. Sigue siendo un enlace: navega y se comparte. */
export function LinkButton({
  href,
  children,
  variant = 'primary',
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant | undefined;
}) {
  return (
    <a href={href} className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]}`}>
      {children}
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/* Formularios                                                                */
/* -------------------------------------------------------------------------- */

interface CampoBase {
  name: string;
  label: string;
  hint?: string | undefined;
  errors?: readonly string[] | undefined;
  required?: boolean | undefined;
}

/** Estructura común: etiqueta visible, ayuda y error, todos asociados al control. */
function Envoltura({
  name,
  label,
  hint,
  errors,
  required,
  children,
}: CampoBase & { children: (ids: { describedBy: string | undefined; invalid: boolean }) => ReactNode }) {
  const idAyuda = hint === undefined ? undefined : `${name}-ayuda`;
  const idError = errors === undefined || errors.length === 0 ? undefined : `${name}-error`;
  const describedBy = [idAyuda, idError].filter((v) => v !== undefined).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block font-medium">
        {label}
        {required === true && (
          <>
            <span className="ml-1 text-[var(--color-danger)]" aria-hidden="true">
              *
            </span>
            <span className="sr-only"> (obligatorio)</span>
          </>
        )}
      </label>

      {hint !== undefined && (
        <p id={idAyuda} className="text-sm text-[var(--color-ink-soft)]">
          {hint}
        </p>
      )}

      {children({ describedBy, invalid: idError !== undefined })}

      {idError !== undefined && (
        <ul id={idError} className="space-y-1 text-sm font-medium text-[var(--color-danger)]">
          {errors!.map((mensaje) => (
            <li key={mensaje}>{mensaje}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CONTROL =
  'min-h-11 w-full rounded-lg border bg-[var(--color-surface-raised)] px-3 py-2 text-base text-[var(--color-ink)] transition-colors duration-[var(--duration-fast)]';

/**
 * Campo de texto con etiqueta **visible**.
 *
 * La etiqueta nunca se sustituye por un texto de marcador: al escribir, el
 * marcador desaparece y la persona pierde la referencia de qué se le pedía
 * (PRD §5.2).
 */
export function Field({
  type = 'text',
  autoComplete,
  defaultValue,
  inputMode,
  ...base
}: CampoBase & {
  type?: string | undefined;
  autoComplete?: string | undefined;
  defaultValue?: string | undefined;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric' | 'search' | undefined;
}) {
  return (
    <Envoltura {...base}>
      {({ describedBy, invalid }) => (
        <input
          id={base.name}
          name={base.name}
          type={type}
          required={base.required}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          inputMode={inputMode}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={`${CONTROL} ${invalid ? 'border-[var(--color-danger)]' : 'border-[var(--color-line-strong)]'}`}
        />
      )}
    </Envoltura>
  );
}

export function TextArea({
  rows = 5,
  defaultValue,
  maxLength,
  ...base
}: CampoBase & { rows?: number | undefined; defaultValue?: string | undefined; maxLength?: number | undefined }) {
  return (
    <Envoltura {...base}>
      {({ describedBy, invalid }) => (
        <textarea
          id={base.name}
          name={base.name}
          rows={rows}
          required={base.required}
          defaultValue={defaultValue}
          maxLength={maxLength}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={`${CONTROL} min-h-32 ${invalid ? 'border-[var(--color-danger)]' : 'border-[var(--color-line-strong)]'}`}
        />
      )}
    </Envoltura>
  );
}

export interface Option {
  readonly value: string;
  readonly label: string;
  /**
   * Una línea que explica la opción. Solo la usa `RadioGroup`; `Select` no
   * puede mostrarla porque un `<option>` nativo no admite contenido.
   *
   * Cuando las opciones no se distinguen por su nombre —«conflicto individual»
   * frente a «conflicto colectivo»— la explicación no es un adorno: es lo que
   * permite elegir sin saber el vocabulario de la institución (PRD §5.3).
   */
  readonly hint?: string | undefined;
}

export function Select({
  options,
  defaultValue,
  placeholder = 'Elige una opción',
  ...base
}: CampoBase & {
  options: readonly Option[];
  defaultValue?: string | undefined;
  placeholder?: string | undefined;
}) {
  return (
    <Envoltura {...base}>
      {({ describedBy, invalid }) => (
        <select
          id={base.name}
          name={base.name}
          required={base.required}
          defaultValue={defaultValue ?? ''}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={`${CONTROL} ${invalid ? 'border-[var(--color-danger)]' : 'border-[var(--color-line-strong)]'}`}
        >
          <option value="">{placeholder}</option>
          {options.map((opcion) => (
            <option key={opcion.value} value={opcion.value}>
              {opcion.label}
            </option>
          ))}
        </select>
      )}
    </Envoltura>
  );
}

/**
 * Grupo de opciones excluyentes.
 *
 * Se usa `fieldset` con `legend` y no un `div` con texto: es lo que hace que un
 * lector de pantalla anuncie de qué grupo forma parte cada opción al recorrerlas.
 */
export function RadioGroup({
  name,
  legend,
  help,
  options,
  value,
  errors,
  onChange,
}: {
  name: string;
  legend: string;
  help?: string | undefined;
  options: readonly Option[];
  value?: string | undefined;
  errors?: readonly string[] | undefined;
  /**
   * Se avisa del cambio sin tomar el control del campo: los `input` siguen
   * siendo del navegador (`defaultChecked`), de modo que el formulario funciona
   * igual sin JavaScript. Sirve para lo que **acompaña** a la elección —un
   * aviso que aparece, una sección que se muestra—, nunca para lo que se envía.
   */
  onChange?: ((value: string) => void) | undefined;
}) {
  const idAyuda = help === undefined ? undefined : `${name}-ayuda`;
  const idError = errors === undefined || errors.length === 0 ? undefined : `${name}-error`;
  const describedBy = [idAyuda, idError].filter((v) => v !== undefined).join(' ') || undefined;
  const conExplicacion = options.some((opcion) => opcion.hint !== undefined);

  return (
    <fieldset aria-describedby={describedBy}>
      <legend className="font-medium">{legend}</legend>
      {help !== undefined && (
        <p id={idAyuda} className="mt-1 text-sm text-[var(--color-ink-soft)]">
          {help}
        </p>
      )}
      <div className={conExplicacion ? 'mt-3 grid gap-2' : 'mt-3 flex flex-wrap gap-2'}>
        {options.map((opcion) => (
          <label
            key={opcion.value}
            className={`${conExplicacion ? 'flex items-start' : 'inline-flex items-center'} min-h-11 cursor-pointer gap-3 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 has-[:checked]:border-[var(--color-accent)] has-[:checked]:bg-[var(--color-accent-soft)] has-[:checked]:font-medium has-[:checked]:text-[var(--color-accent-ink)]`}
          >
            <input
              type="radio"
              name={name}
              value={opcion.value}
              defaultChecked={value === opcion.value}
              aria-describedby={opcion.hint === undefined ? undefined : `${name}-${opcion.value}-detalle`}
              onChange={onChange === undefined ? undefined : () => onChange(opcion.value)}
              className={`size-4 shrink-0 accent-[var(--color-accent)] ${conExplicacion ? 'mt-1' : ''}`}
            />
            <span>
              {opcion.label}
              {opcion.hint !== undefined && (
                <span
                  id={`${name}-${opcion.value}-detalle`}
                  className="mt-0.5 block text-sm font-normal text-[var(--color-ink-soft)]"
                >
                  {opcion.hint}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
      {idError !== undefined && (
        <ul id={idError} className="mt-2 space-y-1 text-sm font-medium text-[var(--color-danger)]">
          {errors!.map((mensaje) => (
            <li key={mensaje}>{mensaje}</li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

export function Checkbox({
  name,
  label,
  help,
  defaultChecked = false,
  required = false,
  errors,
}: {
  name: string;
  label: ReactNode;
  help?: string | undefined;
  defaultChecked?: boolean | undefined;
  required?: boolean | undefined;
  errors?: readonly string[] | undefined;
}) {
  const idAyuda = help === undefined ? undefined : `${name}-ayuda`;
  const idError = errors === undefined || errors.length === 0 ? undefined : `${name}-error`;
  const describedBy = [idAyuda, idError].filter((v) => v !== undefined).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label className="flex min-h-11 items-start gap-3 py-2">
        <input
          id={name}
          name={name}
          type="checkbox"
          defaultChecked={defaultChecked}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={idError !== undefined}
          className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]"
        />
        <span>{label}</span>
      </label>
      {help !== undefined && (
        <p id={idAyuda} className="pl-8 text-sm text-[var(--color-ink-soft)]">
          {help}
        </p>
      )}
      {idError !== undefined && (
        <ul id={idError} className="pl-8 text-sm font-medium text-[var(--color-danger)]">
          {errors!.map((mensaje) => (
            <li key={mensaje}>{mensaje}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Los once estados obligatorios (PRD §5.4)                                   */
/*                                                                            */
/* No son adornos: cada uno responde a una situación real en la que la persona */
/* necesita saber qué pasa y qué puede hacer. Están aquí juntos para que una   */
/* pantalla nueva no tenga que inventarlos, que es como acaban siendo once     */
/* mensajes distintos para la misma situación.                                 */
/* -------------------------------------------------------------------------- */

const NOTICE_TONE: Record<Tone, string> = {
  neutral: 'border-[var(--color-line-strong)] bg-[var(--color-surface-sunken)]',
  accent: 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]',
  success: 'border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]',
  warning: 'border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
  danger: 'border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
};

/**
 * Aviso con papel accesible según su urgencia.
 *
 * `alert` interrumpe al lector de pantalla y se reserva para errores: usarlo en
 * un mensaje de éxito interrumpiría la lectura por una buena noticia. `status`
 * espera a que termine la frase en curso.
 */
export function Notice({
  title,
  tone,
  children,
  live = tone === 'danger' ? 'alert' : 'status',
}: {
  title: string;
  tone: Tone;
  children?: ReactNode | undefined;
  live?: 'alert' | 'status' | 'none' | undefined;
}) {
  return (
    <div
      {...(live === 'none' ? {} : { role: live })}
      className={`rounded-lg border p-4 ${NOTICE_TONE[tone]}`}
    >
      <p className="font-semibold">{title}</p>
      {children !== undefined && <div className="mt-1 text-[var(--color-ink)]">{children}</div>}
    </div>
  );
}

/** 5 · Error recuperable. */
export function ErrorNotice({ title, children }: { title: string; children?: ReactNode | undefined }) {
  return (
    <Notice title={title} tone="danger">
      {children}
    </Notice>
  );
}

/** 8 · Funcionamiento exitoso. */
export function SuccessNotice({ title, children }: { title: string; children?: ReactNode | undefined }) {
  return (
    <Notice title={title} tone="success">
      {children}
    </Notice>
  );
}

/**
 * 6 · Error de autorización.
 *
 * Nunca dice qué recurso era ni de quién: en superficies públicas la existencia
 * de un expediente ajeno es en sí misma información (docs/SECURITY.md §4).
 */
export function ForbiddenNotice({ action }: { action?: ReactNode | undefined }) {
  return (
    <Notice title="No tienes autorización para ver esto" tone="warning">
      <p>Si crees que deberías poder, habla con quien te otorgó tu cargo.</p>
      {action !== undefined && <div className="mt-3">{action}</div>}
    </Notice>
  );
}

/** 7 · Sesión expirada. Conserva a dónde volver. */
export function ExpiredSessionNotice({ returnTo }: { returnTo?: string | undefined }) {
  const destino = returnTo === undefined ? '/acceso' : `/acceso?volver=${encodeURIComponent(returnTo)}`;
  return (
    <Notice title="Tu sesión se cerró por inactividad" tone="warning">
      <p>Vuelve a entrar y te devolvemos donde estabas. No perdiste nada de lo que habías escrito.</p>
      <p className="mt-3">
        <a href={destino} className="font-medium underline underline-offset-4">
          Volver a entrar
        </a>
      </p>
    </Notice>
  );
}

/**
 * 3 · Vacío genuino: **aún no existe nada**.
 *
 * Deliberadamente distinto de `NoResults`. Confundirlos hace que alguien crea
 * que el sistema está vacío cuando en realidad su filtro es demasiado estrecho,
 * y al revés (PRD §5.4).
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-line-strong)] p-8 text-center sm:p-12">
      <p className="text-lg font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-[var(--width-prose)] text-[var(--color-ink-soft)]">{description}</p>
      {action !== undefined && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** 4 · Sin resultados **para los filtros actuales**. */
export function NoResults({ action, hint }: { action?: ReactNode | undefined; hint?: string | undefined }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-line-strong)] p-8 text-center sm:p-12">
      <p className="text-lg font-medium">Ningún resultado con estos filtros</p>
      <p className="mx-auto mt-2 max-w-[var(--width-prose)] text-[var(--color-ink-soft)]">
        {hint ?? 'Hay contenido en el sistema, pero ninguno coincide con lo que buscas. Prueba a quitar algún filtro.'}
      </p>
      {action !== undefined && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * 1 y 2 · Carga inicial e incremental.
 *
 * El esqueleto reproduce la forma de lo que va a llegar, para que el contenido
 * no salte al aparecer. `aria-hidden` porque un lector de pantalla no debe leer
 * la decoración; el aviso de carga viaja en el texto vivo de al lado.
 */
export function Skeleton({ lines = 3, label = 'Cargando' }: { lines?: number | undefined; label?: string | undefined }) {
  return (
    <div>
      <p className="sr-only" role="status">
        {label}
      </p>
      <div aria-hidden="true" className="space-y-3">
        {Array.from({ length: lines }, (_, indice) => (
          <div
            key={indice}
            className="h-4 rounded bg-[var(--color-surface-sunken)]"
            style={{ width: `${100 - indice * 12}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 11 · Funcionamiento con conexión lenta o intermitente.
 *
 * Se muestra donde una acción necesita red, para que la persona sepa **antes**
 * de intentarlo que no va a funcionar sin conexión (PRD §5.4).
 */
export function RequiresConnection({ what }: { what: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-[var(--color-ink-soft)]" data-requires-connection>
      <span aria-hidden="true">⚡</span>
      <span>{what} necesita conexión. Si estás sin señal, lo que escribiste se guarda y puedes enviarlo después.</span>
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Presentación de datos                                                      */
/* -------------------------------------------------------------------------- */

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const estilo: Record<Tone, string> = {
    neutral: 'border-[var(--color-line-strong)] text-[var(--color-ink-soft)]',
    accent: 'border-[var(--color-accent)] text-[var(--color-accent-ink)] bg-[var(--color-accent-soft)]',
    success: 'border-[var(--color-success)] text-[var(--color-success)]',
    warning: 'border-[var(--color-warning)] text-[var(--color-warning)]',
    danger: 'border-[var(--color-danger)] text-[var(--color-danger)]',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${estilo[tone]}`}>
      {children}
    </span>
  );
}

/** Distintivo del módulo. Es lo que diferencia sin fragmentar (PRD §24 Fase 2). */
export function ModuleBadge({ module, children }: { module: Module; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${MODULE_ACCENT[module]}`}>
      {children}
    </span>
  );
}

/** Tabla con desplazamiento propio: el cuerpo de la página nunca se desplaza en horizontal. */
export function ScrollableTable({ caption, children }: { caption?: string | undefined; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-line)]">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        {caption !== undefined && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

/** Revelación progresiva. Nativa: funciona sin JavaScript y ya es accesible. */
export function Disclosure({
  summary,
  children,
  open = false,
}: {
  summary: string;
  children: ReactNode;
  open?: boolean | undefined;
}) {
  return (
    <details
      open={open}
      className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-raised)] px-4"
    >
      <summary className="-mx-4 cursor-pointer px-4 py-3 font-medium marker:text-[var(--color-accent)]">
        {summary}
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

/**
 * Texto largo con ancho de lectura acotado.
 *
 * Más allá de unos setenta caracteres por línea, el ojo pierde el renglón al
 * saltar. Es una de las barreras de lectura más baratas de quitar.
 */
export function Prose({ children }: { children: ReactNode }) {
  return <div className="max-w-[var(--width-prose)] space-y-4 text-lg leading-relaxed">{children}</div>;
}
