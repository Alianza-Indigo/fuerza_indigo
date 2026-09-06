import { Card, ErrorNotice, Notice, PageShell, ScrollableTable, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { caseIndicators } from '@/modules/cases';
import {
  CIFRA_SUPRIMIDA,
  NOMBRE_DE_PRIORIDAD,
  NOMBRE_DE_RESULTADO,
  type Celda,
} from '@/modules/cases/domain';
import { REQUEST_TYPE_LABELS } from '../../(publico)/contacto/labels';

export const metadata = { title: 'Indicadores de casos', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Una celda: la cifra, o la raya que dice que no se publica. */
function cifra(celda: Celda): string {
  return celda.publicable ? String(celda.valor) : CIFRA_SUPRIMIDA;
}

/** Fecha en formato de día, desplazada los días indicados. */
function dia(desplazamiento: number): string {
  return new Date(Date.now() + desplazamiento * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Indicadores anonimizados de casos (PRD §24 Fase 6).
 *
 * La pantalla dice **en su propia cara** que hay celdas suprimidas y por qué.
 * Un indicador con huecos y sin explicación parece un error de cálculo, y quien
 * lo lee acaba pidiendo «los datos completos», que es exactamente lo que el
 * umbral existe para no dar.
 */
export default async function IndicadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { desde, hasta } = await searchParams;
  const actor = await currentActor();

  const datos = await caseIndicators(actor, {
    desde: desde ?? dia(-365),
    hasta: hasta ?? dia(0),
  });

  if (!datos.ok) {
    return (
      <PageShell title="Indicadores de casos" width="ancha">
        <ErrorNotice title={datos.error.message} />
      </PageShell>
    );
  }

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const { data } = datos;

  return (
    <PageShell
      title="Indicadores de casos"
      description={`Del ${fecha.format(data.desde)} al ${fecha.format(data.hasta)}, en tu compartimento y tu territorio.`}
      width="ancha"
    >
      <div className="space-y-8">
        <Notice title={`Las cifras por debajo de ${data.umbral} no se publican`} tone="accent" live="none">
          <p>
            Un conteo de uno o de dos dice qué le pasó a esa persona, dónde y cómo acabó, y quien conoce el barrio no
            necesita más. Esas celdas se suprimen enteras y aparecen como «{CIFRA_SUPRIMIDA}»: redondearlas seguiría
            diciendo que hubo algo.
          </p>
          {data.celdasSuprimidas > 0 && (
            <p className="mt-2">
              En este periodo se suprimieron <strong>{data.celdasSuprimidas}</strong> celda(s).
            </p>
          )}
        </Notice>

        <Section title="Cómo se atendió" level={2}>
          <Card>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-[var(--color-ink-soft)]">Mediana hasta la primera respuesta</dt>
                <dd className="text-2xl font-semibold">
                  {data.medianaDePrimeraRespuestaEnHoras === null
                    ? CIFRA_SUPRIMIDA
                    : `${data.medianaDePrimeraRespuestaEnHoras.toFixed(1)} h`}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--color-ink-soft)]">Marcas de riesgo levantadas</dt>
                <dd className="text-2xl font-semibold">{cifra(data.riesgosLevantados)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-[var(--color-ink-soft)]" data-secondary>
              La mediana también pasa por el umbral: con dos expedientes detrás, la mediana es uno de los dos, y
              publicarla sería publicar ese caso.
            </p>
          </Card>
        </Section>

        <Section title="Expedientes abiertos, por materia" level={2}>
          <ScrollableTable caption="Expedientes abiertos en el periodo, agrupados por materia">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left">
                <th scope="col" className="p-3 font-medium">Materia</th>
                <th scope="col" className="p-3 font-medium">Expedientes</th>
              </tr>
            </thead>
            <tbody>
              {data.porMateria.map((fila) => (
                <tr key={fila.materia} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="p-3">{REQUEST_TYPE_LABELS[fila.materia].label}</td>
                  <td className="p-3">{cifra(fila.celda)}</td>
                </tr>
              ))}
            </tbody>
          </ScrollableTable>
        </Section>

        <Section title="Expedientes abiertos, por prioridad" level={2}>
          <ScrollableTable caption="Expedientes abiertos en el periodo, agrupados por prioridad">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left">
                <th scope="col" className="p-3 font-medium">Prioridad</th>
                <th scope="col" className="p-3 font-medium">Expedientes</th>
              </tr>
            </thead>
            <tbody>
              {data.porPrioridad.map((fila) => (
                <tr key={fila.prioridad} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="p-3">{NOMBRE_DE_PRIORIDAD[fila.prioridad]}</td>
                  <td className="p-3">{cifra(fila.celda)}</td>
                </tr>
              ))}
            </tbody>
          </ScrollableTable>
        </Section>

        <Section title="Expedientes cerrados, por resultado" level={2}>
          <ScrollableTable caption="Expedientes cerrados en el periodo, agrupados por su resultado">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left">
                <th scope="col" className="p-3 font-medium">Resultado</th>
                <th scope="col" className="p-3 font-medium">Expedientes</th>
              </tr>
            </thead>
            <tbody>
              {data.porResultado.map((fila) => (
                <tr key={fila.resultado} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="p-3">{NOMBRE_DE_RESULTADO[fila.resultado]}</td>
                  <td className="p-3">{cifra(fila.celda)}</td>
                </tr>
              ))}
            </tbody>
          </ScrollableTable>
        </Section>
      </div>
    </PageShell>
  );
}
