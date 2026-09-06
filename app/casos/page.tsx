import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorNotice, PageShell, ScrollableTable, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { caseList } from '@/modules/cases';
import { NOMBRE_DE_ESTADO, NOMBRE_DE_PRIORIDAD, NOMBRE_DE_DOMINIO, TONO_DE_PRIORIDAD } from '@/modules/cases/domain';
import { REQUEST_TYPE_LABELS } from '../(publico)/contacto/labels';

export const metadata = { title: 'Mis expedientes', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Los expedientes que lleva quien mira, y ninguno más (PRD §10.3).
 *
 * No es una bandeja del área: es la lista de lo que esta persona tiene a su
 * cargo. Un expediente al que no está asignada no aparece aquí ni existe para
 * ella, y eso no es una decisión de la pantalla —el caso de uso solo devuelve
 * los suyos—.
 */
export default async function CasosPage() {
  const actor = await currentActor();
  const expedientes = await caseList(actor);

  if (!expedientes.ok) {
    return (
      <PageShell title="Mis expedientes" width="ancha">
        <ErrorNotice title={expedientes.error.message} />
      </PageShell>
    );
  }

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  return (
    <PageShell
      title="Mis expedientes"
      description="Lo que llevas a tu cargo, ordenado por lo que más daño hace si no se atiende."
      width="ancha"
    >
      <Section title="A tu cargo" level={2}>
        {expedientes.data.length === 0 ? (
          <EmptyState
            title="No llevas ningún expediente"
            description="Cuando se te asigne uno aparecerá aquí. Los expedientes se abren desde un mensaje de la entrada pública, una vez confirmada su canalización."
          />
        ) : (
          <ScrollableTable caption="Expedientes a tu cargo, con su materia, prioridad, estado y plazo">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left">
                <th scope="col" className="p-3 font-medium">Folio</th>
                <th scope="col" className="p-3 font-medium">Persona</th>
                <th scope="col" className="p-3 font-medium">Materia</th>
                <th scope="col" className="p-3 font-medium">Prioridad</th>
                <th scope="col" className="p-3 font-medium">Estado</th>
                <th scope="col" className="p-3 font-medium">Plazo</th>
                <th scope="col" className="p-3 font-medium">Tareas</th>
              </tr>
            </thead>
            <tbody>
              {expedientes.data.map((expediente) => (
                <tr key={expediente.id} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="p-3">
                    <Link
                      href={`/casos/${expediente.publicId}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {expediente.folio}
                    </Link>
                    <span className="block text-sm text-[var(--color-ink-soft)]" data-secondary>
                      {NOMBRE_DE_DOMINIO[expediente.domain]}
                    </span>
                  </td>
                  <td className="p-3">{expediente.solicitante ?? 'Sin persona registrada'}</td>
                  <td className="p-3">{REQUEST_TYPE_LABELS[expediente.caseType].label}</td>
                  <td className="p-3">
                    <Badge tone={TONO_DE_PRIORIDAD[expediente.priority]}>
                      {NOMBRE_DE_PRIORIDAD[expediente.priority]}
                    </Badge>
                  </td>
                  <td className="p-3">{NOMBRE_DE_ESTADO[expediente.status]}</td>
                  <td className="p-3">{expediente.dueAt === null ? 'Sin plazo' : fecha.format(expediente.dueAt)}</td>
                  <td className="p-3">{expediente.tareasPendientes}</td>
                </tr>
              ))}
            </tbody>
          </ScrollableTable>
        )}
      </Section>

      <Section title="Cómo se abre un expediente" level={2}>
        <Card>
          <p>
            Un expediente nace de un mensaje de la entrada pública cuya canalización ya confirmó una persona. La
            propuesta que hace el sistema no abre nada por sí sola: hasta que alguien la confirma, no hay expediente.
          </p>
          <p className="mt-2">
            <Link href="/gestion/mensajes" className="underline underline-offset-4">
              Ir a los mensajes recibidos
            </Link>
          </p>
        </Card>
      </Section>
    </PageShell>
  );
}
