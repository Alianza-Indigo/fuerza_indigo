import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'El sindicato',
  description:
    'Conoce qué es Fuerza Índigo, a quién reúne y cómo construye representación, defensa y capacidad colectiva para la comunidad neurodivergente.',
};

type IconName =
  | 'alianza'
  | 'comunidad'
  | 'defensa'
  | 'familia-comunidad'
  | 'neurodiversidad'
  | 'participacion'
  | 'persona'
  | 'red-territorial'
  | 'trabajo';

const audiences = [
  {
    icon: 'neurodiversidad' as const,
    title: 'Personas trabajadoras neurodivergentes',
    description:
      'Personas asalariadas o independientes que buscan representación, acompañamiento y participación sindical.',
  },
  {
    icon: 'trabajo' as const,
    title: 'Quienes trabajan con la comunidad neurodivergente',
    description:
      'Docentes, profesionales, personal de apoyo y otras personas cuya actividad tiene contacto directo con personas neurodivergentes.',
  },
  {
    icon: 'persona' as const,
    title: 'Trabajadores independientes',
    description:
      'Profesionistas, prestadores de servicios, emprendedores y trabajadores por cuenta propia vinculados con la inclusión.',
  },
  {
    icon: 'familia-comunidad' as const,
    title: 'Comunidad honoraria',
    description:
      'Personas neurodivergentes, familiares y cuidadores que desean integrarse a la comunidad sin adquirir derechos políticos sindicales.',
  },
] as const;

const principles = [
  {
    icon: 'defensa' as const,
    title: 'Defensa con respaldo',
    description: 'Cada caso se documenta, se acompaña y se canaliza con responsabilidad.',
  },
  {
    icon: 'participacion' as const,
    title: 'Participación real',
    description: 'Las personas agremiadas construyen las decisiones y la vida democrática del sindicato.',
  },
  {
    icon: 'alianza' as const,
    title: 'Fuerza colectiva',
    description: 'Una comunidad amplia tiene mayor capacidad para abrir espacios y exigir derechos.',
  },
  {
    icon: 'comunidad' as const,
    title: 'Inclusión sin caridad',
    description: 'Promovemos autonomía, oportunidades y trato digno; no relaciones de dependencia.',
  },
] as const;

const territory = [
  {
    level: 'Nacional',
    title: 'Coordinación general',
    description: 'Define la estrategia común, articula la representación y resguarda la unidad institucional.',
  },
  {
    level: 'Estatal',
    title: 'Delegaciones estatales',
    description: 'Acercan la organización a las realidades y autoridades de cada entidad federativa.',
  },
  {
    level: 'Municipal',
    title: 'Delegaciones municipales',
    description: 'Facilitan la atención, la participación y la construcción de comunidad en el territorio.',
  },
  {
    level: 'Seccional',
    title: 'Secciones donde sean necesarias',
    description: 'Permiten organizar centros de trabajo, sectores profesionales o comunidades específicas.',
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

export default function ElSindicatoPage() {
  return (
    <main
      id="contenido"
      className="fi-dark overflow-hidden bg-[linear-gradient(180deg,#030923_0%,#061132_52%,#030923_100%)] text-white"
    >
      <section className="relative isolate border-b border-cyan-400/20">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_24%,rgba(102,51,255,.32),transparent_32%),radial-gradient(circle_at_83%_34%,rgba(0,196,255,.2),transparent_30%),linear-gradient(120deg,#07072d_0%,#071548_55%,#020b2d_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-20 [background-image:linear-gradient(rgba(76,151,255,.15)_1px,transparent_1px),linear-gradient(90deg,rgba(76,151,255,.15)_1px,transparent_1px)] [background-size:56px_56px]"
        />

        <div className="mx-auto grid min-h-[620px] w-full max-w-7xl items-center gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:px-8 lg:py-20">
          <div className="relative z-10">
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-cyan-300">El sindicato</p>
            <h1 className="mt-4 max-w-[15ch] text-[clamp(2.7rem,5vw,4.8rem)] font-black uppercase leading-[.94] tracking-[-.035em]">
              Una fuerza colectiva para la inclusión y los derechos
            </h1>
            <p className="mt-6 max-w-xl text-xl font-semibold leading-relaxed text-blue-100/85">
              Somos el Sindicato Unión de Inclusión y Derechos Neurodivergentes «Fuerza Índigo».
            </p>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-blue-100/70">
              Reunimos a personas trabajadoras neurodivergentes y a quienes, desde su actividad laboral o profesional,
              tienen contacto con la comunidad neurodivergente.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/afiliate/agremiado"
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400 px-6 py-3 text-sm font-bold uppercase tracking-wide shadow-[0_0_28px_rgba(0,207,255,.2)] transition hover:brightness-110"
              >
                Afíliate sin costo <Arrow />
              </Link>
              <Link
                href="/solicitar-apoyo"
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-cyan-300/55 bg-white/5 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:bg-white/10"
              >
                Solicitar apoyo <Arrow />
              </Link>
            </div>
          </div>

          <div className="relative aspect-[3/2] w-full lg:-ml-8 lg:w-[120%]">
            <div aria-hidden="true" className="absolute inset-[14%] -z-10 rounded-full bg-indigo-500/20 blur-3xl" />
            <Image
              src="/landing/02-hero-comunidad-fuerza-indigo.png"
              alt="Comunidad diversa reunida como parte de Fuerza Índigo"
              fill
              preload
              sizes="(max-width: 1024px) 100vw, 58vw"
              className="fi-hero-community object-contain object-center"
            />
          </div>
        </div>

        <div className="border-t border-cyan-300/20 bg-[#02071e]/75">
          <ul className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-px px-4 py-4 text-center text-xs font-bold uppercase tracking-wider text-blue-100/75 sm:px-6 lg:grid-cols-4 lg:px-8">
            <li>Afiliación gratuita</li>
            <li>Representación</li>
            <li>Participación</li>
            <li>Red territorial</li>
          </ul>
        </div>
      </section>

      <section className="border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Qué somos</p>
            <h2 className="mt-3 text-2xl font-black uppercase tracking-tight sm:text-3xl">
              Organización, representación y comunidad
            </h2>
            <p className="mt-4 leading-relaxed text-blue-100/75">
              Fuerza Índigo es un sindicato creado para convertir necesidades individuales en capacidad colectiva.
              Organizamos a personas trabajadoras, defendemos sus derechos y construimos herramientas que fortalezcan
              su autonomía y desarrollo.
            </p>
          </article>

          <article className="rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Nuestro propósito</p>
            <h2 className="mt-3 text-2xl font-black uppercase tracking-tight sm:text-3xl">
              Que nadie enfrente la exclusión en soledad
            </h2>
            <p className="mt-4 leading-relaxed text-blue-100/75">
              Buscamos que la neurodivergencia no sea motivo de discriminación, precariedad o aislamiento. Actuamos
              para impulsar relaciones laborales dignas, entornos inclusivos, acceso a oportunidades y participación
              efectiva.
            </p>
          </article>
        </div>
      </section>

      <section className="border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Quiénes pueden participar</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight">Una comunidad laboral amplia</h2>
            <p className="mx-auto mt-3 max-w-2xl text-blue-100/70">
              No es necesario ser una persona neurodivergente para agremiarse: también pueden hacerlo quienes trabajan
              directamente con esta comunidad.
            </p>
          </header>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {audiences.map((audience) => (
              <article
                key={audience.title}
                className="rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5"
              >
                <span className="grid size-14 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-300/5">
                  <LandingIcon name={audience.icon} className="size-11" />
                </span>
                <h3 className="mt-4 text-lg font-black uppercase leading-tight">{audience.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-blue-100/70">{audience.description}</p>
              </article>
            ))}
          </div>

          <p className="mt-6 text-center text-lg font-bold text-cyan-300">
            La afiliación sindical a Fuerza Índigo es gratuita.
          </p>
        </div>
      </section>

      <section className="border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Nuestra forma de actuar</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight">Un sindicato diferente</h2>
          </header>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {principles.map((principle) => (
              <article
                key={principle.title}
                className="rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5 text-center"
              >
                <span className="mx-auto grid size-14 place-items-center rounded-full border border-fuchsia-300/30 bg-fuchsia-300/5">
                  <LandingIcon name={principle.icon} className="size-10" />
                </span>
                <h3 className="mt-4 text-lg font-black uppercase">{principle.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-blue-100/70">{principle.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div aria-hidden="true" className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(94,72,255,.24),transparent_65%)]" />
        <div className="relative mx-auto w-full max-w-7xl">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Organización territorial</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight">Una estructura preparada para crecer</h2>
            <p className="mx-auto mt-3 max-w-2xl text-blue-100/70">
              El modelo territorial permite acercar representación y acompañamiento a cada comunidad conforme se
              constituyan sus delegaciones.
            </p>
          </header>

          <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {territory.map((item, index) => (
              <li
                key={item.level}
                className="relative rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5"
              >
                <p className="text-sm font-black text-cyan-300">{String(index + 1).padStart(2, '0')} · {item.level}</p>
                <h3 className="mt-2 text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-blue-100/70">{item.description}</p>
                {index < territory.length - 1 && (
                  <span aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden text-2xl text-cyan-300 lg:block">
                    ›
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl border border-cyan-300/30 bg-[radial-gradient(circle_at_80%_20%,rgba(0,196,255,.16),transparent_34%),linear-gradient(120deg,#10083d,#061846)] px-6 py-10 text-center sm:px-10">
          <LandingIcon name="red-territorial" className="mx-auto size-16" />
          <h2 className="mt-4 text-3xl font-black uppercase tracking-tight">
            La fuerza del sindicato está en su comunidad
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-blue-100/75">
            Entre más personas se organizan, mayor es nuestra capacidad para defender derechos, impulsar cambios y
            construir entornos verdaderamente neuroinclusivos.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/afiliate/agremiado"
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:brightness-110"
            >
              Quiero afiliarme <Arrow />
            </Link>
            <Link
              href="/#formas-de-participar"
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-cyan-300/55 bg-white/5 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:bg-white/10"
            >
              Ver formas de participar <Arrow />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
