import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { catalogoPublicado } from '@/modules/ecosystem';

export const metadata: Metadata = {
  title: 'Plataformas y herramientas',
  description:
    'ADIA, NeuroPlan, NEXO, CIAN y CENI: herramientas y plataformas que convierten la inclusión en apoyo concreto.',
};

export const dynamic = 'force-dynamic';

type IconName = 'conexion' | 'familia-comunidad' | 'formacion' | 'neurodiversidad' | 'persona';

interface ToolPresentation {
  readonly icon: IconName;
  readonly eyebrow: string;
  readonly description: string;
  readonly audience: string;
  readonly features: readonly string[];
}

const presentation: Record<string, ToolPresentation> = {
  ADIA: {
    icon: 'formacion',
    eyebrow: 'Educación inclusiva',
    description:
      'Asistente para crear planeaciones didácticas inclusivas y adaptar la enseñanza a las necesidades reales del aula.',
    audience: 'Docentes y equipos educativos.',
    features: ['Planeación inclusiva', 'DUA', 'Mejora y retroalimentación'],
  },
  NEUROPLAN: {
    icon: 'persona',
    eyebrow: 'Organización y autonomía',
    description:
      'Herramienta cotidiana para organizar actividades, apoyos, objetivos y seguimiento de manera clara y accesible.',
    audience: 'Personas neurodivergentes, familias y equipos de acompañamiento.',
    features: ['Planeación personal', 'Seguimiento', 'Autonomía'],
  },
  NEXO: {
    icon: 'conexion',
    eyebrow: 'Red de acompañamiento',
    description:
      'Espacio de vinculación para conectar necesidades, personas, familias, profesionales y recursos de apoyo.',
    audience: 'Personas y organizaciones que buscan construir una red de apoyo.',
    features: ['Vinculación', 'Comunidad', 'Acompañamiento'],
  },
  CIAN: {
    icon: 'familia-comunidad',
    eyebrow: 'Atención integral',
    description:
      'Centro Integral de Atención Neurodivergente para articular valoración, atención y acompañamiento profesional.',
    audience: 'Personas neurodivergentes y sus familias.',
    features: ['Atención integral', 'Seguimiento', 'Familias'],
  },
  CENI: {
    icon: 'neurodiversidad',
    eyebrow: 'Entornos neuroinclusivos',
    description:
      'Certificación que ayuda a evaluar, transformar y acreditar entornos comprometidos con la neuroinclusión.',
    audience: 'Empresas, escuelas, instituciones y organizaciones.',
    features: ['Evaluación', 'Mejora de entornos', 'Certificación'],
  },
};

const ecosystemFlow = [
  ['01', 'Aprender y planear', 'ADIA apoya a docentes para llevar la inclusión a la práctica educativa.'],
  ['02', 'Organizar el día a día', 'NeuroPlan ayuda a convertir necesidades y objetivos en acciones claras.'],
  ['03', 'Conectar apoyos', 'NEXO articula personas, recursos y redes de acompañamiento.'],
  ['04', 'Atender integralmente', 'CIAN reúne rutas de valoración, atención y seguimiento profesional.'],
  ['05', 'Transformar entornos', 'CENI impulsa cambios verificables en organizaciones e instituciones.'],
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

export default async function HerramientasPage() {
  const fichas = await catalogoPublicado();

  return (
    <main
      id="contenido"
      className="fi-dark overflow-hidden bg-[linear-gradient(180deg,#030923_0%,#061132_50%,#030923_100%)] text-white"
    >
      <section className="relative isolate border-b border-cyan-400/20">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_16%_22%,rgba(102,51,255,.34),transparent_32%),radial-gradient(circle_at_82%_36%,rgba(0,196,255,.2),transparent_32%),linear-gradient(120deg,#07072d_0%,#071548_55%,#020b2d_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-20 [background-image:linear-gradient(rgba(76,151,255,.15)_1px,transparent_1px),linear-gradient(90deg,rgba(76,151,255,.15)_1px,transparent_1px)] [background-size:56px_56px]"
        />

        <div className="mx-auto grid min-h-[610px] w-full max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[.92fr_1.08fr] lg:px-8 lg:py-20">
          <div className="relative z-10">
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-cyan-300">Ecosistema Fuerza Índigo</p>
            <h1 className="mt-4 max-w-[13ch] text-[clamp(2.8rem,5.1vw,4.9rem)] font-black uppercase leading-[.94] tracking-[-.035em]">
              Tecnología para convertir la inclusión en acción
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-blue-100/80">
              Herramientas para aprender, organizarse, conectar apoyos, recibir atención y transformar los espacios
              donde vivimos, estudiamos y trabajamos.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href="#plataformas"
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400 px-6 py-3 text-sm font-bold uppercase tracking-wide shadow-[0_0_28px_rgba(0,207,255,.2)] transition hover:brightness-110"
              >
                Conocer herramientas <Arrow />
              </a>
              <Link
                href="/afiliate/agremiado"
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-cyan-300/55 bg-white/5 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:bg-white/10"
              >
                Afiliarme sin costo <Arrow />
              </Link>
            </div>
          </div>

          <div className="relative mx-auto grid w-full max-w-xl grid-cols-2 gap-4 sm:grid-cols-3">
            <div aria-hidden="true" className="absolute inset-[12%] -z-10 rounded-full bg-indigo-500/25 blur-3xl" />
            {[
              ['formacion', 'ADIA'],
              ['persona', 'NeuroPlan'],
              ['conexion', 'NEXO'],
              ['familia-comunidad', 'CIAN'],
              ['neurodiversidad', 'CENI'],
            ].map(([icon, name], index) => (
              <div
                key={name}
                className={`rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5 text-center shadow-[0_16px_45px_rgba(0,0,0,.2)] ${
                  index === 4 ? 'col-span-2 sm:col-span-1' : ''
                }`}
              >
                <LandingIcon name={icon as IconName} className="mx-auto size-14" />
                <p className="mt-3 font-black">{name}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-cyan-300/20 bg-[#02071e]/75">
          <ul className="mx-auto grid w-full max-w-7xl grid-cols-2 px-4 py-4 text-center text-xs font-bold uppercase tracking-wider text-blue-100/75 sm:px-6 lg:grid-cols-4 lg:px-8">
            <li>Educación</li>
            <li>Autonomía</li>
            <li>Acompañamiento</li>
            <li>Neuroinclusión</li>
          </ul>
        </div>
      </section>

      <section id="plataformas" className="scroll-mt-24 border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Plataformas y servicios</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight">Una herramienta para cada necesidad</h2>
            <p className="mx-auto mt-3 max-w-2xl text-blue-100/70">
              El catálogo se administra desde Fuerza Índigo, pero cada plataforma funciona de manera independiente.
            </p>
          </header>

          {fichas.length === 0 ? (
            <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-7 text-center">
              <h3 className="text-xl font-bold">El catálogo se está preparando</h3>
              <p className="mt-3 text-blue-100/70">Las herramientas aparecerán aquí cuando sean publicadas.</p>
            </div>
          ) : (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fichas.map((ficha) => {
                const details = presentation[ficha.code] ?? {
                  icon: 'conexion' as const,
                  eyebrow: 'Ecosistema',
                  description: ficha.summary,
                  audience: ficha.audienceText,
                  features: [] as readonly string[],
                };

                return (
                  <li key={ficha.code} className="flex">
                    <article className="flex w-full flex-col rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5 shadow-[0_14px_38px_rgba(0,0,0,.16)]">
                      <div className="flex items-center gap-4">
                        <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-300/5">
                          <LandingIcon name={details.icon} className="size-11" />
                        </span>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">{details.eyebrow}</p>
                          <h3 className="mt-1 text-2xl font-black">{ficha.name}</h3>
                        </div>
                      </div>

                      <p className="mt-4 flex-1 text-sm leading-relaxed text-blue-100/75">{details.description}</p>
                      <p className="mt-4 text-sm">
                        <span className="font-bold text-white">Para quién: </span>
                        <span className="text-blue-100/70">{details.audience}</span>
                      </p>

                      {details.features.length > 0 && (
                        <ul className="mt-4 flex flex-wrap gap-2">
                          {details.features.map((feature) => (
                            <li
                              key={feature}
                              className="rounded-full border border-cyan-300/25 bg-cyan-300/5 px-3 py-1 text-xs font-semibold text-cyan-100"
                            >
                              {feature}
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="mt-5 border-t border-cyan-300/15 pt-4">
                        {ficha.accesoUrl === null ? (
                          <p className="text-sm font-semibold text-blue-100/55">Acceso en preparación</p>
                        ) : (
                          <a
                            href={ficha.accesoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center gap-2 text-sm font-bold uppercase tracking-wide text-cyan-300 underline-offset-4 hover:underline"
                          >
                            Abrir {ficha.name} <span aria-hidden="true">↗</span>
                          </a>
                        )}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Un solo ecosistema</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight">Soluciones que se complementan</h2>
            <p className="mx-auto mt-3 max-w-2xl text-blue-100/70">
              Cada herramienta resuelve una parte distinta del camino; juntas construyen capacidad personal,
              comunitaria e institucional.
            </p>
          </header>

          <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {ecosystemFlow.map(([number, title, description], index) => (
              <li key={number} className="relative rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5">
                <p className="text-sm font-black text-cyan-300">{number}</p>
                <h3 className="mt-2 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-blue-100/70">{description}</p>
                {index < ecosystemFlow.length - 1 && (
                  <span aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden text-2xl text-cyan-300 lg:block">
                    ›
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Acceso claro</p>
            <h2 className="mt-3 text-2xl font-black uppercase tracking-tight sm:text-3xl">
              Tú decides qué herramienta utilizar
            </h2>
            <p className="mt-4 leading-relaxed text-blue-100/75">
              El catálogo no determina automáticamente tu elegibilidad ni recomienda una plataforma mediante un
              perfil. Puedes conocer cada opción y decidir cuál responde mejor a tu necesidad.
            </p>
          </article>

          <article className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-300/5 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-fuchsia-200">Cuentas independientes</p>
            <h2 className="mt-3 text-2xl font-black uppercase tracking-tight sm:text-3xl">
              Tus datos no viajan al abrir otra plataforma
            </h2>
            <p className="mt-4 leading-relaxed text-blue-100/75">
              Cada servicio tiene su propio acceso, sus propias reglas y su propia operación. Al abrirlo sales de
              Fuerza Índigo; no existe inicio de sesión único ni transferencia automática de tu información.
            </p>
          </article>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl border border-cyan-300/30 bg-[radial-gradient(circle_at_80%_20%,rgba(0,196,255,.16),transparent_34%),linear-gradient(120deg,#10083d,#061846)] px-6 py-10 text-center sm:px-10">
          <LandingIcon name="conexion" className="mx-auto size-16" />
          <h2 className="mt-4 text-3xl font-black uppercase tracking-tight">Herramientas con propósito colectivo</h2>
          <p className="mx-auto mt-4 max-w-2xl text-blue-100/75">
            La tecnología es útil cuando fortalece autonomía, facilita apoyos y abre oportunidades reales para la
            comunidad neurodivergente.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href="#plataformas"
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:brightness-110"
            >
              Explorar herramientas <Arrow />
            </a>
            <Link
              href="/contacto"
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-cyan-300/55 bg-white/5 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:bg-white/10"
            >
              Contactar a Fuerza Índigo <Arrow />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
