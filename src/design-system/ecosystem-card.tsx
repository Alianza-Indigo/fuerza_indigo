import { Card, ModuleBadge, type Module } from './primitives';

/**
 * Lo que esta tarjeta necesita saber para pintarse.
 *
 * Se declara aquí y no se importa del módulo a propósito: el sistema de diseño
 * no depende de los módulos, y una ficha del catálogo satisface esta forma sin
 * que ninguno de los dos tenga que conocer al otro.
 *
 * `accesoUrl` llega **ya resuelta**. La tarjeta no interpreta cadenas ni decide
 * si una dirección sirve: eso se hizo una vez, en la consulta, para que las dos
 * pantallas que enseñan estas fichas no puedan discrepar.
 */
export interface FichaVisible {
  readonly name: string;
  readonly summary: string;
  readonly audienceText: string;
  readonly modulo: Module;
  readonly accesoUrl: string | null;
  readonly responsable: string | null;
}

/**
 * Ficha de una plataforma o herramienta del ecosistema (PRD §12.2).
 *
 * Vive en un solo componente porque hay **dos** pantallas que la enseñan —el
 * sitio público y el portal personal— y el PRD §12.4 exige que sean las mismas.
 * Escribirla dos veces es como el aviso de que se sale del sitio acaba puesto en
 * una y olvidado en la otra.
 *
 * **El aviso de salida no es decorativo.** Quien pulsa tiene que saber, antes de
 * pulsar, que deja Fuerza Índigo y entra en una plataforma con su propia cuenta
 * y sus propias reglas. Va en el texto del enlace y no solo en un icono: quien
 * navega con lector de pantalla oye el nombre del enlace, no ve la flechita.
 *
 * **Sin dirección no hay botón.** No un botón deshabilitado, que sigue siendo un
 * botón y se lee como algo roto: no hay botón, y en su lugar una línea que dice
 * la verdad, para que la ficha siga sirviendo para saber qué es esa plataforma.
 */
export function EcosystemCard({ ficha, etiqueta }: { ficha: FichaVisible; etiqueta: string }) {
  return (
    <Card as="article">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{ficha.name}</h3>
          <ModuleBadge module={ficha.modulo}>{etiqueta}</ModuleBadge>
        </div>

        <p className="text-sm">{ficha.summary}</p>

        <p className="text-sm">
          <span className="font-medium">Para quién es: </span>
          {ficha.audienceText}
        </p>

        {ficha.responsable === null ? null : (
          <p className="text-sm text-[var(--color-ink-soft)]">
            <span className="font-medium">Responsable: </span>
            {ficha.responsable}
          </p>
        )}

        {ficha.accesoUrl === null ? (
          <p className="text-sm text-[var(--color-ink-soft)]">
            El acceso a {ficha.name} todavía no está configurado. Cuando lo esté, el botón aparece aquí.
          </p>
        ) : (
          <p>
            <a
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              href={ficha.accesoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ir a {ficha.name} (se abre otra plataforma, fuera de Fuerza Índigo)
            </a>
          </p>
        )}
      </div>
    </Card>
  );
}

/** Nombre humano del módulo, para la insignia. */
export function etiquetaDelModulo(modulo: Module): string {
  switch (modulo) {
    case 'sindicato':
      return 'Fuerza Índigo';
    case 'alianza':
      return 'Alianza Índigo';
    case 'cian':
      return 'CIAN';
    case 'ceni':
      return 'CENI';
    case 'herramientas':
      return 'Herramienta';
  }
}
