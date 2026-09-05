import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, Notice, PageShell, Prose } from '@/design-system/primitives';
import { publicVoteProcess } from '@/modules/voting';
import { BallotForm } from './ballot-form';

export const metadata: Metadata = {
  title: 'Depositar tu voto',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * Papeleta pública (PRD §9.5; ADR-0012).
 *
 * **No exige sesión, y ese es el punto.** Si hubiera que entrar con la cuenta,
 * el servidor sabría quién abre la papeleta y a qué hora, y comparar esa hora
 * con el orden de las boletas volvería a permitir emparejar persona y voto.
 * Quien deposita se autoriza con su credencial, que no dice de quién es.
 *
 * La página no se indexa ni se guarda en caché: una versión guardada podría
 * enseñar el estado del proceso a destiempo, y con él, quién llegó cuándo.
 */
export default async function VotarPage({ params }: { params: Promise<{ proceso: string }> }) {
  const { proceso: publicId } = await params;
  const proceso = await publicVoteProcess(publicId);
  if (proceso === null) notFound();

  const ahora = new Date();
  const fechaHora = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  });

  const abierta = proceso.status === 'OPEN' && ahora >= proceso.opensAt && ahora <= proceso.closesAt;

  return (
    <PageShell title={proceso.title} description="Votación de Fuerza Índigo" width="lectura">
      <div className="space-y-6">
        {!abierta ? (
          <Notice
            tone={proceso.status === 'SCHEDULED' ? 'accent' : 'neutral'}
            title={
              proceso.status === 'SCHEDULED'
                ? 'La votación todavía no abre'
                : proceso.status === 'ANNULLED'
                  ? 'Esta votación fue anulada'
                  : 'La votación está cerrada'
            }
          >
            <p>
              Abre el {fechaHora.format(proceso.opensAt)} y cierra el {fechaHora.format(proceso.closesAt)}.
            </p>
          </Notice>
        ) : (
          <Card>
            <BallotForm voteProcessId={publicId} opciones={proceso.options} />
          </Card>
        )}

        {proceso.verificationCodes.length > 0 && (
          <section>
            <h2 className="mb-2 text-lg font-semibold">Boletas contadas</h2>
            <Prose>
              <p>
                Estos son los códigos de las boletas escrutadas. Busca el tuyo: si está, tu voto se contó. La lista no
                dice el sentido de ninguna boleta, y por eso nadie puede exigirte que demuestres qué votaste.
              </p>
            </Prose>
            <p className="mt-3 font-mono text-sm break-all">{proceso.verificationCodes.join(' · ')}</p>
          </section>
        )}

        <Prose>
          <h2 className="text-lg font-semibold">Cómo se protege tu voto</h2>
          <p>
            Tu credencial no se guardó en ningún sitio cuando te la entregaron: se generó, se firmó y se te dio. La
            boleta que deposites no lleva tu nombre, ni tu número de miembro, ni la hora en que la depositaste. Lo
            único que queda del cruce entre las dos es una marca que impide usar la misma credencial dos veces, y esa
            marca tampoco tiene nombre ni hora.
          </p>
          <p>
            Como consecuencia, quien recibe una credencial y decide no votar es indistinguible de quien votó. Es el
            precio de no crear el vínculo, y se paga a propósito.
          </p>
        </Prose>
      </div>
    </PageShell>
  );
}
