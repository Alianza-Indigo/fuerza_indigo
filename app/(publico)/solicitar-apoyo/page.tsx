import type { Metadata } from 'next';
import { Card, Notice, PageShell, Prose, Section } from '@/design-system/primitives';
import { RequestForm } from '../contacto/request-form';
import { socialMetadata } from '@/platform/seo';

export const metadata: Metadata = socialMetadata({
  title: 'Solicitar apoyo',
  description:
    'Si vives una situación laboral, educativa, de salud o de accesibilidad difícil, empieza aquí. Preguntas de información, no de derecho.',
  path: '/solicitar-apoyo',
});

/**
 * Entrada única de ayuda (PRD §10.1, F2-UI-010).
 *
 * Las preguntas son de información y no técnicas ni jurídicas: quien pide ayuda
 * no tiene por qué saber si lo suyo es un «conflicto colectivo». La
 * clasificación que propone una canalización, y la confirmación humana que
 * exige el PRD antes de canalizar, son de la Fase 6; aquí el mensaje se recibe,
 * se acusa con folio y queda en una bandeja que alguien lee.
 *
 * No se promete un plazo de respuesta. La organización todavía no ha fijado
 * uno, y ponerlo aquí sería comprometerla a algo que nadie acordó.
 */
export default function SolicitarApoyoPage() {
  return (
    <PageShell
      title="Solicitar apoyo"
      description="Cuéntanos qué está pasando. No necesitas términos técnicos ni jurídicos, ni saber a qué área te toca."
      width="lectura"
    >
      <div className="space-y-10">
        <Notice title="Si estás en peligro ahora mismo, llama al 911" tone="danger" live="none">
          <p>
            Este formulario no es un canal de urgencias y no está atendido las veinticuatro horas. El 911 funciona en
            todo México, a cualquier hora y sin costo. Puedes mandarnos tu mensaje después o al mismo tiempo.
          </p>
        </Notice>

        <Section title="Qué pasa cuando envías esto" level={2}>
          <Prose>
            <ol className="list-decimal space-y-2 pl-6 marker:text-[var(--color-accent)]">
              <li>Recibes un folio en pantalla y, si dejaste correo, un acuse con ese mismo folio.</li>
              <li>
                Tu mensaje entra a una bandeja que solo lee el personal con nombramiento vigente de la entidad a la
                que escribiste. Cada lectura queda registrada con nombre y fecha.
              </li>
              <li>Una persona —no un programa— valora qué sigue y te contesta por el medio que pediste.</li>
            </ol>
            <p>
              Lo que escribas se guarda tal cual y nadie lo edita: el sistema no tiene permiso para modificarlo. Es tu
              relato y sigue siendo tuyo.
            </p>
          </Prose>
        </Section>

        <Card>
          <RequestForm modo="apoyo" />
        </Card>
      </div>
    </PageShell>
  );
}
