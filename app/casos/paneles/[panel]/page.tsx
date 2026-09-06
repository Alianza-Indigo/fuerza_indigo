import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorNotice, PageShell, ScrollableTable, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { casePanel } from '@/modules/cases';
import { NOMBRE_DE_ESTADO, NOMBRE_DE_PRIORIDAD, TONO_DE_PRIORIDAD } from '@/modules/cases/domain';
import { REQUEST_TYPE_LABELS } from '../../../(publico)/contacto/labels';

export const metadata = { title: 'Panel de coordinación', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Un panel de coordinación (PRD §24 Fase 6).
 *
 * Lo primero que se ve son los números que duelen: cuántos no lleva nadie,
 * cuántos pasaron su plazo de primera respuesta, cuántos tienen el plazo encima
 * y cuántos arrastran un riesgo que nadie recogió. Un panel que empezara por
 * «expedientes abiertos» serviría para no enterarse.
 */
export default async function PanelPage({ params }: { params: Promise<{ panel: string }> }) {
  const { panel } = await params;
  const actor = await currentActor();
  const datos = await casePanel(actor, panel);

  if (!datos.ok) {
    return (
      <PageShell title="Panel de coordinación" width="ancha">
        <ErrorNotice title={datos.error.message}>
          <Link href="/casos/paneles" className="underline underline-offset-4">
            Volver a los paneles
          </Link>
        </ErrorNotice>
      </PageShell>
    );
  }

  const { totales, expedientes } = datos.data;
  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  const cifras = [
    { etiqueta: 'Sin responsable', valor: totales.sinResponsable, alarma: totales.sinResponsable > 0 },
    { etiqueta: 'Sin primera respuesta', valor: totales.sinValorar, alarma: totales.sinValorar > 0 },
    { etiqueta: 'Fuera de plazo', valor: totales.fueraDePlazo, alarma: totales.fueraDePlazo > 0 },
    {
      etiqueta: 'Riesgo sin recoger',
      valor: totales.conRiesgoSinRecoger,
      alarma: totales.conRiesgoSinRecoger > 0,
    },
    { etiqueta: 'Abiertos en total', valor: totales.abiertos, alarma: false },
  ];

  return (
    <PageShell title={datos.data.nombre} description={datos.data.descripcion} width="ancha">
      <div className="space-y-8">
        <Section title="Cómo va el área" level={2}>
          <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {cifras.map((cifra) => (
              <li key={cifra.etiqueta}>
                <Card>
                  <p className="text-3xl font-semibold" data-alarma={cifra.alarma ? 'si' : undefined}>
                    {cifra.valor}
                  </p>
                  <p className="text-sm text-[var(--color-ink-soft)]">{cifra.etiqueta}</p>
                </Card>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-[var(--color-ink-soft)]" data-secondary>
            Todo esto se calcula al abrir la pantalla y solo alcanza tu entidad, tu materia y tu territorio.
            Coordinar no es ver el sistema entero.
          </p>
        </Section>

        <Section title="Expedientes del área" level={2}>
          {expedientes.length === 0 ? (
            <EmptyState
              title="No hay expedientes abiertos en esta área"
              description="Cuando se abra uno de estas materias en tu territorio, aparecerá aquí aunque todavía no lo lleve nadie."
            />
          ) : (
            <ScrollableTable caption="Expedientes abiertos del área, con quién los lleva y qué les falta">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Folio</th>
                  <th scope="col" className="p-3 font-medium">Materia</th>
                  <th scope="col" className="p-3 font-medium">Prioridad</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Quién lo lleva</th>
                  <th scope="col" className="p-3 font-medium">Plazo</th>
                  <th scope="col" className="p-3 font-medium">Qué le falta</th>
                </tr>
              </thead>
              <tbody>
                {expedientes.map((fila) => (
                  <tr key={fila.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3">
                      <Link href={`/casos/${fila.publicId}`} className="underline underline-offset-4">
                        {fila.folio}
                      </Link>
                    </td>
                    <td className="p-3">{REQUEST_TYPE_LABELS[fila.materia as 'OTHER'].label}</td>
                    <td className="p-3">
                      <Badge tone={TONO_DE_PRIORIDAD[fila.prioridad]}>{NOMBRE_DE_PRIORIDAD[fila.prioridad]}</Badge>
                    </td>
                    <td className="p-3">{NOMBRE_DE_ESTADO[fila.estado]}</td>
                    <td className="p-3">
                      {fila.responsable ?? <span className="text-[var(--color-danger)]">Nadie</span>}
                    </td>
                    <td className="p-3">{fila.plazo === null ? '—' : fecha.format(fila.plazo)}</td>
                    <td className="p-3">
                      <span className="flex flex-wrap gap-2">
                        {fila.riesgoSinRecoger && <Badge tone="danger">Riesgo sin recoger</Badge>}
                        {fila.fueraDePlazo && <Badge tone="danger">Fuera de plazo</Badge>}
                        {fila.sinValorar && <Badge tone="warning">Sin primera respuesta</Badge>}
                        {fila.tareasPendientes > 0 && (
                          <Badge tone="neutral">{fila.tareasPendientes} tarea(s)</Badge>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </Section>
      </div>
    </PageShell>
  );
}
