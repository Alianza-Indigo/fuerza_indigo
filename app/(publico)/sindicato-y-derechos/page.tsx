import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Sindicato y derechos',
  description:
    'Conoce cómo Fuerza Índigo recibe, documenta, orienta y acompaña situaciones que afectan los derechos de la comunidad neurodivergente.',
};

type IconName =
  | 'alianza'
  | 'conexion'
  | 'defensa'
  | 'familia-comunidad'
  | 'neurodiversidad'
  | 'participacion'
  | 'persona'
  | 'trabajo';

const situations = [
  {
    icon: 'neurodiversidad' as const,
    title: 'Discriminación o exclusión',
    description:
      'Cuando la neurodivergencia, la discapacidad o una condición personal se utiliza para limitar, aislar o dar un trato desigual.',
  },
  {
    icon: 'trabajo' as const,
    title: 'Barreras en el trabajo',
    description:
      'Dificultades de acceso, comunicación, organización o permanencia que impiden desempeñar una actividad en condiciones dignas.',
  },
  {
    icon: 'defensa' as const,
    title: 'Conflictos o represalias',
    description:
      'Presiones, hostigamiento, sanciones o decisiones que necesitan ser comprendidas, registradas y revisadas con cuidado.',
  },
  {
    icon: 'familia-comunidad' as const,
    title: 'Situaciones educativas, de salud o accesibilidad',
    description:
      'Casos relacionados con servicios, instituciones o entornos donde una persona neurodivergente enfrenta una barrera.',
  },
] as const;

const response = [
  {
    number: '01',
    title: 'Escuchamos tu relato',
    description: 'No necesitas identificar una ley ni utilizar términos técnicos para explicar lo que está pasando.',
  },
  {
    number: '02',
    title: 'Generamos un folio',
    description: 'Tu solicitud queda registrada para que pueda consultarse y recibir seguimiento.',
  },
  {
    number: '03',
    title: 'Una persona revisa el caso',
    description: 'La valoración y la decisión sobre el siguiente paso son humanas, no automáticas.',
  },
  {
    number: '04',
    title: 'Orientamos y canalizamos',
    description: 'Te explicamos las opciones disponibles y, cuando corresponda, buscamos el apoyo adecuado.',
  },
] as const;

const actions = [
  {
    icon: 'persona' as const,
    title: 'Orientación inicial',
    description: 'Ayudarte a ordenar los hechos, identificar necesidades inmediatas y comprender posibles rutas.',
  },
  {
    icon: 'conexion' as const,
    title: 'Documentación',
    description: 'Conservar un relato claro, reunir información relevante y evitar que el caso dependa solo de la memoria.',
  },
  {
    icon: 'alianza' as const,
    title: 'Acompañamiento',
    description: 'Estar contigo durante el proceso y facilitar la comunicación con las personas o instituciones involucradas.',
  },
  {
    icon: 'participacion' as const,
    title: 'Canalización y seguimiento',
    description: 'Dirigir el asunto al área o profesional correspondiente y mantener trazabilidad sobre lo realizado.',
  },
] as const;

const references = [
  {
    title: 'Ley Federal del Trabajo',
    href: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf',
  },
  {
    title: 'Ley Federal para Prevenir y Eliminar la Discriminación',
    href: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPED.pdf',
  },
  {
    title: 'Ley General para la Inclusión de las Personas con Discapacidad',
    href: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LGIPD.pdf',
  },
  {
    title: 'NOM-035-STPS-2018',
    href: 'https://asinom.stps.gob.mx/upload/nom/48.pdf',
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

export default function SindicatoYDerechosPage() {
  return (
    <main
      id="contenido"
      className="fi-dark overflow-hidden bg-[linear-gradient(180deg,#030923_0%,#061132_50%,#030923_100%)] text-white"
    >
      <section className="relative isolate border-b border-cyan-400/20">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_16%_22%,rgba(102,51,255,.34),transparent_32%),radial-gradient(circle_at_84%_38%,rgba(0,196,255,.18),transparent_31%),linear-gradient(120deg,#07072d_0%,#071548_55%,#020b2d_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-20 [background-image:linear-gradient(rgba(76,151,255,.15)_1px,transparent_1px),linear-gradient(90deg,rgba(76,151,255,.15)_1px,transparent_1px)] [background-size:56px_56px]"
        />

        <div className="mx-auto grid min-h-[610px] w-full max-w-7xl items-center gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[.88fr_1.12fr] lg:px-8 lg:py-20">
          <div className="relative z-10">
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-cyan-300">Defensa y acompañamiento</p>
            <h1 className="mt-4 max-w-[13ch] text-[clamp(2.8rem,5.2vw,5rem)] font-black uppercase leading-[.94] tracking-[-.035em]">
              Tus derechos no se defienden en soledad
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-blue-100/80">
              Si enfrentas una situación laboral, educativa, de salud o de accesibilidad difícil, puedes empezar aquí.
              Cuéntanos qué ocurre con tus propias palabras.
            </p>
            <div className="mt-7">
              <Link
                href="/solicitar-apoyo"
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400 px-6 py-3 text-sm font-bold uppercase tracking-wide shadow-[0_0_28px_rgba(0,207,255,.2)] transition hover:brightness-110"
              >
                Solicitar apoyo ahora <Arrow />
              </Link>
            </div>
            <p className="mt-4 max-w-lg text-xs leading-relaxed text-blue-100/55">
              Este sitio no es un servicio de emergencias. Si existe peligro inmediato, llama al 911.
            </p>
          </div>

          <div className="relative aspect-[3/2] w-full lg:-ml-6 lg:w-[122%]">
            <div aria-hidden="true" className="absolute inset-[12%] -z-10 rounded-full bg-indigo-500/25 blur-3xl" />
            <Image
              src="/landing/03-defensa-acompanamiento-fuerza-indigo.png"
              alt="Mujer neurodivergente frente a un escudo con el mensaje Tus derechos, nuestra fuerza"
              fill
              preload
              sizes="(max-width: 1024px) 100vw, 60vw"
              className="fi-hero-community object-contain object-center"
            />
          </div>
        </div>

        <div className="border-t border-cyan-300/20 bg-[#02071e]/75">
          <ul className="mx-auto grid w-full max-w-7xl grid-cols-2 px-4 py-4 text-center text-xs font-bold uppercase tracking-wider text-blue-100/75 sm:px-6 lg:grid-cols-4 lg:px-8">
            <li>Escucha</li>
            <li>Documentación</li>
            <li>Acompañamiento</li>
            <li>Seguimiento</li>
          </ul>
        </div>
      </section>

      <section className="border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Cuándo acercarte</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight">No necesitas saber cómo se llama jurídicamente</h2>
            <p className="mx-auto mt-3 max-w-2xl text-blue-100/70">
              Lo importante es explicar los hechos. La revisión humana ayudará a identificar qué puede hacerse y cuál
              es la ruta adecuada.
            </p>
          </header>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {situations.map((situation) => (
              <article
                key={situation.title}
                className="rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5"
              >
                <span className="grid size-14 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-300/5">
                  <LandingIcon name={situation.icon} className="size-11" />
                </span>
                <h3 className="mt-4 text-lg font-black uppercase leading-tight">{situation.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-blue-100/70">{situation.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[.7fr_1.3fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Nuestra intervención</p>
            <h2 className="mt-3 text-3xl font-black uppercase tracking-tight">
              Actuamos contigo, no en tu lugar
            </h2>
            <p className="mt-4 leading-relaxed text-blue-100/75">
              El objetivo es que comprendas el proceso, conserves capacidad de decisión y cuentes con respaldo para
              avanzar. La ruta depende de los hechos, la documentación disponible y la valoración de una persona
              responsable.
            </p>
            <p className="mt-4 rounded-xl border border-fuchsia-300/25 bg-fuchsia-300/5 p-4 text-sm leading-relaxed text-blue-100/75">
              Pedir apoyo no exige estar afiliado. La afiliación fortalece la representación colectiva, pero no es una
              condición para que puedas contar lo que te sucede.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {actions.map((action) => (
              <article
                key={action.title}
                className="rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5"
              >
                <div className="flex items-center gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-fuchsia-300/30 bg-fuchsia-300/5">
                    <LandingIcon name={action.icon} className="size-9" />
                  </span>
                  <h3 className="text-lg font-black uppercase">{action.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-blue-100/70">{action.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Cómo empieza</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight">Un proceso claro y documentado</h2>
          </header>

          <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {response.map((step, index) => (
              <li
                key={step.number}
                className="relative rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5"
              >
                <p className="text-sm font-black text-cyan-300">{step.number}</p>
                <h3 className="mt-2 text-lg font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-blue-100/70">{step.description}</p>
                {index < response.length - 1 && (
                  <span aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden text-2xl text-cyan-300 lg:block">
                    ›
                  </span>
                )}
              </li>
            ))}
          </ol>

          <p className="mt-6 text-center text-sm text-blue-100/60">
            Tu relato se conserva tal como lo escribes y cada acceso autorizado queda registrado.
          </p>
        </div>
      </section>

      <section className="border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <article className="rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Marco de derechos</p>
            <h2 className="mt-3 text-2xl font-black uppercase tracking-tight sm:text-3xl">
              Cada situación se analiza en su contexto
            </h2>
            <p className="mt-4 leading-relaxed text-blue-100/75">
              En México existen normas sobre trabajo digno, igualdad y no discriminación, inclusión de las personas
              con discapacidad y prevención de factores de riesgo psicosocial. Su aplicación concreta depende de los
              hechos y no puede determinarse solo con una descripción general.
            </p>
            <ul className="mt-5 grid gap-2 text-sm">
              {references.map((reference) => (
                <li key={reference.href}>
                  <a
                    href={reference.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 text-cyan-300 underline-offset-4 hover:underline"
                  >
                    {reference.title} <span aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-amber-300/25 bg-amber-300/5 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-200">Límites claros</p>
            <h2 className="mt-3 text-2xl font-black uppercase tracking-tight sm:text-3xl">
              Acompañar también es hablar con honestidad
            </h2>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed text-blue-100/75">
              <li>• No prometemos un resultado favorable ni una respuesta inmediata.</li>
              <li>• El formulario no sustituye al 911 ni a los servicios de emergencia.</li>
              <li>• La orientación inicial no reemplaza la intervención de una autoridad o profesional competente.</li>
              <li>• No realizamos una canalización automática: una persona revisa primero la información.</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl border border-cyan-300/30 bg-[radial-gradient(circle_at_80%_20%,rgba(0,196,255,.16),transparent_34%),linear-gradient(120deg,#10083d,#061846)] px-6 py-10 text-center sm:px-10">
          <LandingIcon name="defensa" className="mx-auto size-16" />
          <h2 className="mt-4 text-3xl font-black uppercase tracking-tight">Da el primer paso</h2>
          <p className="mx-auto mt-4 max-w-2xl text-blue-100/75">
            Cuéntanos qué está pasando. No necesitas tener todos los documentos ni conocer la ruta correcta para
            comenzar.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/solicitar-apoyo"
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:brightness-110"
            >
              Solicitar apoyo <Arrow />
            </Link>
            <Link
              href="/afiliate/agremiado"
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-cyan-300/55 bg-white/5 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:bg-white/10"
            >
              Afiliarme sin costo <Arrow />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
