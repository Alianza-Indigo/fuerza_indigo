import { ESTADO_DE_MEMBRESIA } from '../membresias/etiquetas';

/**
 * Filtros de un padrón (PRD §7.2).
 *
 * Un formulario `GET` de toda la vida: los filtros quedan en la dirección, así
 * que se pueden compartir, marcar y volver a ellos con el botón de atrás. Un
 * filtro que solo vive en memoria obliga a rehacerlo cada vez que alguien entra
 * a una ficha y regresa.
 */
export function RosterFilters({
  accion,
  q,
  estado,
}: {
  accion: string;
  q?: string | undefined;
  estado?: string | undefined;
}) {
  return (
    <section>
      <form action={accion} method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1 space-y-1.5">
          <label htmlFor="q" className="block text-sm font-medium">
            Número de miembro o apellido
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q ?? ''}
            className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-base"
          />
        </div>
        <div className="min-w-44 space-y-1.5">
          <label htmlFor="estado" className="block text-sm font-medium">
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={estado ?? ''}
            className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-base"
          >
            <option value="">Todos</option>
            {Object.entries(ESTADO_DE_MEMBRESIA).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="min-h-11 rounded-lg border border-[var(--color-line-strong)] px-4 font-medium"
        >
          Filtrar
        </button>
      </form>
    </section>
  );
}
