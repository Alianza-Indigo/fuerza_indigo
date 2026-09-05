import Link from 'next/link';
import { Badge, EmptyState, NoResults, ScrollableTable } from '@/design-system/primitives';
import type { RosterRow } from '@/modules/membership';
import { CALIDAD_EXACTA } from './etiquetas';
import { ESTADO_DE_MEMBRESIA } from '../membresias/etiquetas';

/**
 * La tabla de un padrón.
 *
 * Comparte la presentación, **no** la consulta: cada padrón se lee con su
 * propia función que filtra su categoría en la base (PRD §7.1). Compartir la
 * consulta con un parámetro sería el primer paso hacia la vista que mezcla
 * categorías que el PRD prohíbe.
 *
 * La columna de calidad exacta va siempre, aunque en un padrón de una sola
 * categoría parezca redundante: una tabla se copia, se recorta y se pega en
 * otro documento, y la columna viaja con ella.
 */
export function RosterView({
  filas,
  filtrado,
  vacio,
  formatter,
}: {
  filas: readonly RosterRow[];
  filtrado: boolean;
  vacio: { title: string; description: string };
  formatter: Intl.DateTimeFormat;
}) {
  if (filas.length === 0) {
    return filtrado ? (
      <NoResults hint="Prueba sin filtros, o con el número de miembro completo." />
    ) : (
      <EmptyState title={vacio.title} description={vacio.description} />
    );
  }

  return (
    <ScrollableTable>
      <thead>
        <tr className="border-b border-[var(--color-line)] text-left">
          <th scope="col" className="p-3 font-medium">Número</th>
          <th scope="col" className="p-3 font-medium">Persona</th>
          <th scope="col" className="p-3 font-medium">Calidad exacta</th>
          <th scope="col" className="p-3 font-medium">Estado</th>
          <th scope="col" className="p-3 font-medium">Alta</th>
          <th scope="col" className="p-3 font-medium">Vigencia</th>
          <th scope="col" className="p-3 font-medium">Territorio</th>
          <th scope="col" className="p-3 font-medium">Ante autoridades</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((fila) => (
          <tr key={fila.membershipId} className="border-b border-[var(--color-line)] last:border-0">
            <td className="p-3 font-mono text-sm">
              <Link
                href={`/gestion/afiliacion/membresias/${fila.membershipId}`}
                className="underline underline-offset-4"
              >
                {fila.memberNumber}
              </Link>
            </td>
            <td className="p-3">{fila.personName}</td>
            <td className="p-3">{CALIDAD_EXACTA[fila.category] ?? fila.category}</td>
            <td className="p-3">
              <Badge tone={fila.status === 'ACTIVE' ? 'success' : 'neutral'}>
                {ESTADO_DE_MEMBRESIA[fila.status] ?? fila.status}
              </Badge>
            </td>
            <td className="p-3 tabular-nums">{formatter.format(fila.startedAt)}</td>
            <td className="p-3 tabular-nums">
              {fila.expiresAt === null ? 'Sin vencimiento' : formatter.format(fila.expiresAt)}
            </td>
            <td className="p-3">{fila.territory ?? '—'}</td>
            <td className="p-3">{fila.appearsInAuthorityRoster ? 'Sí' : 'No'}</td>
          </tr>
        ))}
      </tbody>
    </ScrollableTable>
  );
}
