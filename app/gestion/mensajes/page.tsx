import Link from 'next/link';
import { Badge, EmptyState, ErrorNotice, PageShell, ScrollableTable } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import type { SupportRequestStatus } from '@prisma-client/enums';
import { requestList } from '@/modules/support';
import { REQUEST_TYPE_LABELS } from '../../(publico)/contacto/labels';

export const metadata = { title: 'Mensajes recibidos', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ESTADO: Readonly<Record<SupportRequestStatus, { etiqueta: string; tono: 'neutral' | 'warning' | 'success' }>> = {
  RECEIVED: { etiqueta: 'Sin atender', tono: 'warning' },
  // Los tres estados de la Fase 6 se etiquetan aunque ninguna ruta de esta fase
  // los escriba: el enumerado está contratado y una pantalla que enseñara su
  // nombre interno sería peor que una que ya sepa nombrarlos.
  TRIAGE: { etiqueta: 'En valoración', tono: 'warning' },
  CONVERTED_TO_CASE: { etiqueta: 'Convertida en expediente', tono: 'success' },
  REFERRED_EXTERNALLY: { etiqueta: 'Canalizada fuera', tono: 'success' },
  HANDLED: { etiqueta: 'Atendida', tono: 'success' },
  CLOSED_NO_ACTION: { etiqueta: 'Cerrada sin acción', tono: 'neutral' },
  DUPLICATE: { etiqueta: 'Duplicada', tono: 'neutral' },
};

/**
 * Bandeja de la entrada pública.
 *
 * El orden lo decide el módulo y no esta pantalla: primero lo que nadie ha
 * atendido, dentro de eso lo que la propia persona marcó como urgencia, y
 * después lo más antiguo. Una bandeja ordenada por novedad entierra justo lo
 * que lleva más tiempo esperando.
 *
 * El listado no muestra el texto del mensaje. Se ve al abrirlo, y abrirlo queda
 * registrado: un dato sensible no se enseña de pasada en una tabla.
 */
export default async function MensajesPage() {
  const actor = await currentActor();
  const mensajes = await requestList(actor);

  const formatter = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: actor.timeZone,
  });

  return (
    <PageShell
      title="Mensajes recibidos"
      description="Lo que llega por los formularios públicos de contacto y de solicitud de apoyo. Primero lo sin atender, las urgencias antes, y de ahí lo que lleva más tiempo esperando."
      width="ancha"
    >
      {!mensajes.ok ? (
        <ErrorNotice title={mensajes.error.message} />
      ) : mensajes.data.length === 0 ? (
        <EmptyState
          title="No hay mensajes"
          description="Cuando alguien escriba por el formulario público aparecerá aquí, con su folio y su asunto."
        />
      ) : (
        <ScrollableTable caption="Mensajes recibidos por el formulario público, con su folio, asunto y estado">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-left">
              <th scope="col" className="p-3 font-medium">Folio</th>
              <th scope="col" className="p-3 font-medium">Asunto</th>
              <th scope="col" className="p-3 font-medium">De qué se trata</th>
              <th scope="col" className="p-3 font-medium">Entidad</th>
              <th scope="col" className="p-3 font-medium">Estado</th>
              <th scope="col" className="p-3 font-medium">Recibido</th>
            </tr>
          </thead>
          <tbody>
            {mensajes.data.map((mensaje) => (
              <tr key={mensaje.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                <td className="p-3">
                  <Link href={`/gestion/mensajes/${mensaje.id}`} className="font-mono text-sm underline underline-offset-4">
                    {mensaje.folio}
                  </Link>
                </td>
                <td className="p-3">
                  <span className="font-medium">{mensaje.subject}</span>
                  <span className="block text-xs text-[var(--color-ink-faint)]">De {mensaje.contactName}</span>
                </td>
                <td className="p-3 text-sm">{REQUEST_TYPE_LABELS[mensaje.requestType].label}</td>
                <td className="p-3 text-sm">{mensaje.legalEntityShortName}</td>
                <td className="p-3">
                  <Badge tone={ESTADO[mensaje.status].tono}>{ESTADO[mensaje.status].etiqueta}</Badge>
                  {mensaje.handledByLabel !== null && (
                    <span className="mt-1 block text-xs text-[var(--color-ink-soft)]">
                      Por {mensaje.handledByLabel}
                    </span>
                  )}
                </td>
                <td className="p-3 tabular-nums text-sm">{formatter.format(mensaje.receivedAt)}</td>
              </tr>
            ))}
          </tbody>
        </ScrollableTable>
      )}
    </PageShell>
  );
}
