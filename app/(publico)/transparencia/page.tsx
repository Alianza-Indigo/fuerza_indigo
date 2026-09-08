import type { Metadata } from 'next';
import { Card, PageShell, Prose, Section } from '@/design-system/primitives';
import { transparenciaPublica } from '@/modules/dashboards';
import { CIFRA_SUPRIMIDA, type Celda } from '@/platform/privacy/threshold';
import { formatNumber } from '@/platform/i18n/format';

export const metadata: Metadata = {
  title: 'Transparencia',
  description:
    'Cifras públicas de Fuerza Índigo: cuántas personas la integran, su vida institucional y la formación que imparte. Solo agregados, ningún dato personal.',
};

/**
 * Transparencia pública (PRD §6.1, §24 Fase 9).
 *
 * Se lee en vivo y no se cachea de más: las cifras cambian cuando cambia la
 * organización, no cuando expira una copia. Solo agregados; ningún dato de
 * ninguna persona.
 */
export const dynamic = 'force-dynamic';

function Cifra({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <Card>
      <p className="text-sm text-[var(--color-ink-soft)]">{titulo}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{formatNumber(valor)}</p>
    </Card>
  );
}

function CifraCelda({ titulo, celda }: { titulo: string; celda: Celda }) {
  return (
    <Card>
      <p className="text-sm text-[var(--color-ink-soft)]">{titulo}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">
        {celda.publicable ? formatNumber(celda.valor) : CIFRA_SUPRIMIDA}
      </p>
    </Card>
  );
}

export default async function TransparenciaPage() {
  const datos = await transparenciaPublica();

  if (!datos.ok) {
    return (
      <PageShell title="Transparencia">
        <Prose>
          <p>Las cifras no están disponibles en este momento. Vuelve a intentarlo más tarde.</p>
        </Prose>
      </PageShell>
    );
  }

  const t = datos.data;
  const algoSuprimido = !t.personasFormadas.publicable || !t.constanciasVigentes.publicable;

  return (
    <PageShell
      title="Transparencia"
      description="Las cifras públicas de la organización, en este momento. Solo agregados: ningún dato de ninguna persona."
    >
      <div className="space-y-8">
        <Section title="Quiénes la integran">
          <div className="grid gap-4 sm:grid-cols-3">
            <Cifra titulo="Agremiados activos" valor={t.agremiadosActivos} />
            <Cifra titulo="Afiliados honorarios" valor={t.afiliadosHonorarios} />
            <Cifra titulo="Unidades territoriales" valor={t.unidadesTerritoriales} />
          </div>
        </Section>

        <Section title="Vida institucional">
          <div className="grid gap-4 sm:grid-cols-3">
            <Cifra titulo="Asambleas con quórum" valor={t.asambleasCelebradas} />
            <Cifra titulo="Eventos realizados" valor={t.eventosRealizados} />
            <CifraCelda titulo="Personas formadas" celda={t.personasFormadas} />
          </div>
        </Section>

        <Section title="Formación que acredita">
          <div className="grid gap-4 sm:grid-cols-3">
            <CifraCelda titulo="Constancias vigentes" celda={t.constanciasVigentes} />
          </div>
        </Section>

        <Prose>
          <p>
            Estas cifras son <strong>agregados</strong>: cuentan, no nombran. No verás aquí a ninguna
            persona, ni podrás deducir quién hizo qué.
          </p>
          {algoSuprimido && (
            <p>
              Una cifra que aparece como «{CIFRA_SUPRIMIDA}» se oculta porque, con tan pocas personas
              detrás, el número empezaría a señalar a alguien. No es un error: es la privacidad de las
              personas.
            </p>
          )}
        </Prose>
      </div>
    </PageShell>
  );
}
