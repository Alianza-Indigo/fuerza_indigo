import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { transparenciaPublica, type TransparenciaPublica } from '@/modules/dashboards';
import { CIFRA_SUPRIMIDA, type Celda } from '@/platform/privacy/threshold';
import { formatDate, formatNumber } from '@/platform/i18n/format';

export const metadata: Metadata = {
  title: 'Transparencia',
  description:
    'Consulta las cifras públicas de Fuerza Índigo, su vida institucional, presencia territorial y actividad formativa, con privacidad protegida.',
};

/**
 * Transparencia pública (PRD §6.1, §24 Fase 9).
 *
 * La consulta se resuelve en el servidor y solo devuelve agregados. Las cuentas
 * de participación de personas conservan el umbral compartido de privacidad;
 * esta capa únicamente las presenta y nunca recibe identificadores.
 */
export const dynamic = 'force-dynamic';

type IconName =
  | 'comunidad'
  | 'conexion'
  | 'defensa'
  | 'formacion'
  | 'neurodiversidad'
  | 'participacion'
  | 'persona'
  | 'red-territorial';

type PublicMetric = {
  readonly title: string;
  readonly description: string;
  readonly icon: IconName;
  readonly value: number | Celda;
  readonly personalCount?: boolean;
};

const publicationAreas = [
  {
    icon: 'comunidad' as const,
    title: 'Comunidad organizada',
    description: 'Membresías vigentes por categoría, expresadas como totales y sin publicar identidades.',
  },
  {
    icon: 'participacion' as const,
    title: 'Vida democrática',
    description: 'Asambleas en las que el quórum quedó declarado dentro del sistema institucional.',
  },
  {
    icon: 'red-territorial' as const,
    title: 'Estructura territorial',
    description: 'Unidades registradas como activas para organizar el trabajo en distintos territorios.',
  },
  {
    icon: 'formacion' as const,
    title: 'Actividad formativa',
    description: 'Eventos concluidos, participación acreditada y constancias que permanecen vigentes.',
  },
] as const;

const publicAccess = [
  {
    icon: 'persona' as const,
    eyebrow: 'Identidad pública voluntaria',
    title: 'Directorio',
    description: 'Consulta a las personas y organizaciones que decidieron aparecer públicamente.',
    href: '/directorio',
    cta: 'Abrir directorio',
  },
  {
    icon: 'defensa' as const,
    eyebrow: 'Comprobación institucional',
    title: 'Verificar credencial',
    description: 'Comprueba con el código de una credencial si el vínculo que acredita sigue vigente.',
    href: '/verificar',
    cta: 'Verificar ahora',
  },
  {
    icon: 'red-territorial' as const,
    eyebrow: 'Presencia organizada',
    title: 'Delegaciones',
    description: 'Conoce las unidades territoriales formalmente constituidas y sus canales de contacto.',
    href: '/delegaciones',
    cta: 'Ver delegaciones',
  },
  {
    icon: 'conexion' as const,
    eyebrow: 'Tus datos y tus derechos',
    title: 'Aviso de privacidad',
    description: 'Revisa qué información se trata, para qué se utiliza y cómo ejercer tus derechos.',
    href: '/legales/privacidad',
    cta: 'Consultar aviso',
  },
] as const;

function LandingIcon({ name, className = 'size-12' }: { name: IconName; className?: string }) {
  return (
    <Image
      src={`/landing/iconos/icono-${name}.png`}
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      sizes="64px"
      className={`object-contain ${className}`}
    />
  );
}

function Arrow() {
  return <span aria-hidden="true">→</span>;
}

function metricValue(value: number | Celda): string {
  if (typeof value === 'number') return formatNumber(value);
  return value.publicable ? formatNumber(value.valor) : CIFRA_SUPRIMIDA;
}

function MetricCard({ metric }: { metric: PublicMetric }) {
  const suppressed = typeof metric.value !== 'number' && !metric.value.publicable;

  return (
    <article className="rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5 shadow-[0_14px_38px_rgba(0,0,0,.16)]">
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-cyan-300/30 bg-cyan-300/5">
          <LandingIcon name={metric.icon} className="size-9" />
        </span>
        {metric.personalCount === true && (
          <span className="rounded-full border border-fuchsia-300/25 bg-fuchsia-300/5 px-3 py-1 text-[.68rem] font-bold uppercase tracking-wider text-fuchsia-100">
            Privacidad protegida
          </span>
        )}
      </div>
      <p className="mt-5 text-4xl font-black tabular-nums tracking-tight text-white">{metricValue(metric.value)}</p>
      <h3 className="mt-2 font-bold text-white">{metric.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-blue-100/65">
        {suppressed ? 'La cifra se reserva porque todavía no alcanza el umbral de publicación.' : metric.description}
      </p>
    </article>
  );
}

function TransparencyContent({ data }: { data: TransparenciaPublica }) {
  const metrics: readonly PublicMetric[] = [
    {
      title: 'Personas agremiadas activas',
      description: 'Membresías sindicales que se encuentran vigentes.',
      icon: 'comunidad',
      value: data.agremiadosActivos,
    },
    {
      title: 'Afiliaciones honorarias activas',
      description: 'Personas vinculadas mediante afiliación honoraria vigente.',
      icon: 'persona',
      value: data.afiliadosHonorarios,
    },
    {
      title: 'Unidades territoriales activas',
      description: 'Estructuras territoriales registradas como activas en el sistema.',
      icon: 'red-territorial',
      value: data.unidadesTerritoriales,
    },
    {
      title: 'Asambleas con quórum',
      description: 'Asambleas que dejaron constancia institucional de quórum.',
      icon: 'participacion',
      value: data.asambleasCelebradas,
    },
    {
      title: 'Eventos realizados',
      description: 'Cursos, talleres y actividades concluidos y no cancelados.',
      icon: 'conexion',
      value: data.eventosRealizados,
    },
    {
      title: 'Personas formadas',
      description: 'Participaciones cuya asistencia quedó registrada.',
      icon: 'formacion',
      value: data.personasFormadas,
      personalCount: true,
    },
    {
      title: 'Constancias vigentes',
      description: 'Constancias emitidas que no han sido revocadas.',
      icon: 'neurodiversidad',
      value: data.constanciasVigentes,
      personalCount: true,
    },
  ];

  return (
    <main
      id="contenido"
      className="fi-dark overflow-hidden bg-[linear-gradient(180deg,#030923_0%,#061132_50%,#030923_100%)] text-white"
    >
      <section className="relative isolate border-b border-cyan-400/20">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_16%_22%,rgba(102,51,255,.34),transparent_32%),radial-gradient(circle_at_83%_37%,rgba(0,196,255,.2),transparent_31%),linear-gradient(120deg,#07072d_0%,#071548_55%,#020b2d_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-20 [background-image:linear-gradient(rgba(76,151,255,.15)_1px,transparent_1px),linear-gradient(90deg,rgba(76,151,255,.15)_1px,transparent_1px)] [background-size:56px_56px]"
        />

        <div className="mx-auto grid min-h-[610px] w-full max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[.92fr_1.08fr] lg:px-8 lg:py-20">
          <div className="relative z-10">
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-cyan-300">Transparencia pública</p>
            <h1 className="mt-4 max-w-[12ch] text-[clamp(2.9rem,5.3vw,5.1rem)] font-black uppercase leading-[.94] tracking-[-.035em]">
              La confianza también se demuestra
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-blue-100/80">
              Consulta la dimensión real de Fuerza Índigo, su actividad institucional y el impacto de su trabajo sin
              poner en riesgo la identidad de ninguna persona.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href="#cifras"
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400 px-6 py-3 text-sm font-bold uppercase tracking-wide shadow-[0_0_28px_rgba(0,207,255,.2)] transition hover:brightness-110"
              >
                Consultar cifras <Arrow />
              </a>
              <Link
                href="/directorio"
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-cyan-300/55 bg-white/5 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:bg-white/10"
              >
                Ver directorio <Arrow />
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div aria-hidden="true" className="absolute inset-[12%] -z-10 rounded-full bg-indigo-500/25 blur-3xl" />
            <div className="rounded-3xl border border-cyan-300/30 bg-[#040b2c]/85 p-5 shadow-[0_24px_70px_rgba(0,0,0,.28)] backdrop-blur-sm sm:p-6">
              <div className="flex items-center justify-between gap-4 border-b border-cyan-300/15 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Datos al momento</p>
                  <p className="mt-1 text-sm text-blue-100/55">Consultados el {formatDate(data.generadoEl)}</p>
                </div>
                <span className="relative flex size-3" aria-label="Información actualizada">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-300 opacity-40 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-3 rounded-full bg-cyan-300" />
                </span>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3">
                {[
                  ['Agremiados activos', formatNumber(data.agremiadosActivos)],
                  ['Asambleas con quórum', formatNumber(data.asambleasCelebradas)],
                  ['Eventos realizados', formatNumber(data.eventosRealizados)],
                  ['Constancias vigentes', metricValue(data.constanciasVigentes)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-cyan-300/20 bg-[#071642]/80 p-4">
                    <dt className="text-xs leading-snug text-blue-100/60">{label}</dt>
                    <dd className="mt-2 text-3xl font-black tabular-nums text-white">{value}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-4 flex items-center gap-2 text-xs leading-relaxed text-blue-100/55">
                <span aria-hidden="true" className="text-cyan-300">●</span>
                Las cifras se calculan con los registros vigentes cada vez que abres esta página.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-cyan-300/20 bg-[#02071e]/75">
          <ul className="mx-auto grid w-full max-w-7xl grid-cols-2 px-4 py-4 text-center text-xs font-bold uppercase tracking-wider text-blue-100/75 sm:px-6 lg:grid-cols-4 lg:px-8">
            <li>Datos reales</li>
            <li>Solo agregados</li>
            <li>Privacidad protegida</li>
            <li>Consulta actualizada</li>
          </ul>
        </div>
      </section>

      <section id="cifras" className="scroll-mt-24 border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Organización en cifras</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight">Lo que está ocurriendo, sin simulaciones</h2>
            <p className="mx-auto mt-3 max-w-2xl text-blue-100/70">
              Cada indicador procede de la operación institucional registrada en Fuerza Índigo; no son metas ni datos
              escritos manualmente para esta página.
            </p>
          </header>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric) => (
              <MetricCard key={metric.title} metric={metric} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Alcance de la información</p>
            <h2 className="mt-3 text-3xl font-black uppercase tracking-tight">Qué medimos y publicamos</h2>
            <p className="mt-4 leading-relaxed text-blue-100/75">
              Transparencia no significa exponer personas. Significa mostrar de manera comprensible la dimensión, la
              actividad y la capacidad institucional del sindicato.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {publicationAreas.map((area) => (
              <article key={area.title} className="rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5">
                <div className="flex items-center gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-cyan-300/30 bg-cyan-300/5">
                    <LandingIcon name={area.icon} className="size-9" />
                  </span>
                  <h3 className="text-lg font-black uppercase">{area.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-blue-100/70">{area.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div aria-hidden="true" className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(94,72,255,.24),transparent_65%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-5 lg:grid-cols-[.85fr_1.15fr] lg:items-stretch">
          <article className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-300/5 p-6 sm:p-7">
            <div className="flex items-center gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-fuchsia-300/30 bg-fuchsia-300/5">
                <LandingIcon name="defensa" className="size-11" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-200">Umbral de privacidad</p>
                <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Un número nunca debe señalar a alguien</h2>
              </div>
            </div>
            <p className="mt-5 leading-relaxed text-blue-100/75">
              Las cuentas de participación personal solo se publican cuando reúnen al menos {formatNumber(data.umbral)}{' '}
              personas. Por debajo de ese límite, el total podría facilitar que alguien dedujera quién participó.
            </p>
          </article>

          <article className="grid rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6 sm:p-7">
            <div className="grid size-24 place-items-center rounded-2xl border border-cyan-300/30 bg-[#030923] text-5xl font-black text-cyan-300">
              {CIFRA_SUPRIMIDA}
            </div>
            <div className="mt-5 sm:mt-0">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Cuando veas este símbolo</p>
              <h3 className="mt-2 text-2xl font-black uppercase">La información está protegida</h3>
              <p className="mt-3 leading-relaxed text-blue-100/70">
                No significa que falten datos ni que exista un error. Significa que Fuerza Índigo eligió preservar la
                privacidad antes que exhibir una cifra demasiado pequeña.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Accesos públicos</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight">Consulta, comprueba y conoce</h2>
            <p className="mx-auto mt-3 max-w-2xl text-blue-100/70">
              Estos espacios complementan las cifras con información pública que puedes revisar directamente.
            </p>
          </header>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {publicAccess.map((item) => (
              <li key={item.href} className="flex">
                <Link
                  href={item.href}
                  className="group flex w-full flex-col rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5 transition hover:-translate-y-1 hover:border-cyan-300/60"
                >
                  <LandingIcon name={item.icon} className="size-12" />
                  <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">{item.eyebrow}</p>
                  <h3 className="mt-2 text-xl font-black">{item.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-blue-100/65">{item.description}</p>
                  <p className="mt-5 text-sm font-bold uppercase tracking-wide text-cyan-300 group-hover:underline">
                    {item.cta} <Arrow />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl border border-cyan-300/30 bg-[radial-gradient(circle_at_80%_20%,rgba(0,196,255,.16),transparent_34%),linear-gradient(120deg,#10083d,#061846)] px-6 py-10 text-center sm:px-10">
          <LandingIcon name="participacion" className="mx-auto size-16" />
          <h2 className="mt-4 text-3xl font-black uppercase tracking-tight">La transparencia también es participación</h2>
          <p className="mx-auto mt-4 max-w-2xl text-blue-100/75">
            Si necesitas aclarar una cifra, reportar una inconsistencia o solicitar información institucional,
            comunícate directamente con Fuerza Índigo.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/contacto"
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:brightness-110"
            >
              Solicitar información <Arrow />
            </Link>
            <a
              href="#cifras"
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-cyan-300/55 bg-white/5 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:bg-white/10"
            >
              Volver a las cifras <span aria-hidden="true">↑</span>
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

export default async function TransparenciaPage() {
  const result = await transparenciaPublica();

  if (!result.ok) {
    return (
      <main
        id="contenido"
        className="fi-dark grid min-h-[70vh] place-items-center bg-[radial-gradient(circle_at_50%_20%,rgba(102,51,255,.22),transparent_38%),#030923] px-4 py-16 text-white"
      >
        <div className="w-full max-w-2xl rounded-3xl border border-cyan-300/25 bg-[#071133]/85 p-8 text-center sm:p-10">
          <LandingIcon name="conexion" className="mx-auto size-16" />
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Transparencia pública</p>
          <h1 className="mt-3 text-3xl font-black uppercase tracking-tight">Las cifras no están disponibles</h1>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-blue-100/70">
            No pudimos consultar la información institucional en este momento. Inténtalo de nuevo más tarde o
            comunícate con Fuerza Índigo.
          </p>
          <Link
            href="/contacto"
            className="mt-7 inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-cyan-300/55 bg-white/5 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:bg-white/10"
          >
            Contactar <Arrow />
          </Link>
        </div>
      </main>
    );
  }

  return <TransparencyContent data={result.data} />;
}
