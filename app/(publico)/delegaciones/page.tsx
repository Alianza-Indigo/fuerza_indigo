import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { publicDelegations } from '@/modules/governance';

export const metadata: Metadata = {
  title: 'Delegaciones',
  description:
    'Conoce la red territorial de Fuerza Índigo, encuentra una delegación activa o participa en la construcción de una nueva.',
};

export const dynamic = 'force-dynamic';

type IconName = 'alianza' | 'comunidad' | 'conexion' | 'participacion' | 'red-territorial';

const functions = [
  {
    icon: 'comunidad' as const,
    title: 'Organizar comunidad',
    description: 'Reunir a las personas agremiadas y facilitar su participación en la vida del sindicato.',
  },
  {
    icon: 'conexion' as const,
    title: 'Acercar el acompañamiento',
    description: 'Conectar necesidades locales con los canales de orientación, defensa y seguimiento.',
  },
  {
    icon: 'participacion' as const,
    title: 'Impulsar participación',
    description: 'Facilitar asambleas, consultas, acuerdos y procesos democráticos en el territorio.',
  },
  {
    icon: 'alianza' as const,
    title: 'Construir vínculos',
    description: 'Relacionarse con instituciones, organizaciones y comunidades sin perder la unidad nacional.',
  },
] as const;

const structure = [
  {
    number: '01',
    level: 'Nacional',
    title: 'Coordinación común',
    description: 'Articula la estrategia, la representación institucional y los criterios compartidos.',
  },
  {
    number: '02',
    level: 'Estatal',
    title: 'Delegaciones estatales',
    description: 'Atienden la realidad de cada entidad y coordinan el desarrollo territorial.',
  },
  {
    number: '03',
    level: 'Municipal',
    title: 'Delegaciones municipales',
    description: 'Acercan organización y acompañamiento a las comunidades locales.',
  },
  {
    number: '04',
    level: 'Seccional',
    title: 'Secciones específicas',
    description: 'Pueden organizar centros de trabajo, sectores profesionales o comunidades concretas.',
  },
] as const;

const formation = [
  ['Afíliate', 'La construcción territorial comienza con personas agremiadas y una comunidad organizada.'],
  ['Conecta', 'Identifica a otras personas interesadas en participar dentro de tu estado o municipio.'],
  ['Presenta la iniciativa', 'Fuerza Índigo revisa la necesidad, el alcance y la viabilidad de la propuesta.'],
  ['Formaliza', 'La unidad se incorpora a la estructura mediante el acuerdo y el proceso institucional correspondiente.'],
] as const;

const typeLabel = {
  NATIONAL: 'Nacional',
  FOREIGN_COUNTRY: 'País',
  STATE: 'Estatal',
  MUNICIPALITY: 'Municipal',
  SECTION: 'Seccional',
  DELEGATION: 'Delegación',
  OFFICE: 'Oficina',
  VIRTUAL_THEMATIC: 'Temática',
} as const;

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

export default async function DelegacionesPage() {
  const delegaciones = await publicDelegations();

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

        <div className="mx-auto grid min-h-[610px] w-full max-w-7xl items-center gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[.82fr_1.18fr] lg:px-8 lg:py-20">
          <div className="relative z-10">
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-cyan-300">Red territorial</p>
            <h1 className="mt-4 max-w-[12ch] text-[clamp(2.9rem,5.3vw,5.1rem)] font-black uppercase leading-[.94] tracking-[-.035em]">
              Una fuerza cerca de ti
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-blue-100/80">
              La representación nacional cobra vida en los estados, municipios y comunidades donde las personas se
              organizan.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href="#directorio"
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400 px-6 py-3 text-sm font-bold uppercase tracking-wide shadow-[0_0_28px_rgba(0,207,255,.2)] transition hover:brightness-110"
              >
                Encontrar delegación <Arrow />
              </a>
              <Link
                href="/contacto"
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-cyan-300/55 bg-white/5 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:bg-white/10"
              >
                Impulsar una delegación <Arrow />
              </Link>
            </div>
          </div>

          <div className="relative aspect-[2/1] w-full lg:-ml-6 lg:w-[120%]">
            <div aria-hidden="true" className="absolute inset-[10%] -z-10 rounded-full bg-indigo-500/25 blur-3xl" />
            <Image
              src="/landing/05-mapa-red-territorial.png"
              alt="Mapa ilustrado de México y América Latina unidos por una red índigo"
              fill
              preload
              sizes="(max-width: 1024px) 100vw, 64vw"
              className="fi-hero-community object-contain object-center"
            />
          </div>
        </div>

        <div className="border-t border-cyan-300/20 bg-[#02071e]/75">
          <ul className="mx-auto grid w-full max-w-7xl grid-cols-2 px-4 py-4 text-center text-xs font-bold uppercase tracking-wider text-blue-100/75 sm:px-6 lg:grid-cols-4 lg:px-8">
            <li>Nacional</li>
            <li>Estatal</li>
            <li>Municipal</li>
            <li>Seccional</li>
          </ul>
        </div>
      </section>

      <section className="border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Presencia organizada</p>
            <h2 className="mt-3 text-3xl font-black uppercase tracking-tight">Qué hace una delegación</h2>
            <p className="mt-4 leading-relaxed text-blue-100/75">
              Una delegación acerca el sindicato al territorio. No funciona como una organización separada: forma
              parte de Fuerza Índigo, trabaja bajo sus reglas y conecta la realidad local con la estrategia común.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {functions.map((item) => (
              <article key={item.title} className="rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5">
                <div className="flex items-center gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-cyan-300/30 bg-cyan-300/5">
                    <LandingIcon name={item.icon} className="size-9" />
                  </span>
                  <h3 className="text-lg font-black uppercase">{item.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-blue-100/70">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="directorio" className="scroll-mt-24 border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Directorio territorial</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight">
              {delegaciones.length === 0 ? 'La red pública está en formación' : 'Delegaciones constituidas'}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-blue-100/70">
              Solo aparecen unidades activas constituidas mediante un acuerdo institucional. Una entidad disponible
              en el sistema no se presenta como delegación hasta que ese proceso exista.
            </p>
          </header>

          {delegaciones.length === 0 ? (
            <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-7 text-center">
              <LandingIcon name="red-territorial" className="mx-auto size-16" />
              <h3 className="mt-4 text-2xl font-black uppercase">Sé parte del inicio</h3>
              <p className="mx-auto mt-3 max-w-xl leading-relaxed text-blue-100/70">
                Todavía no hay delegaciones constituidas publicadas en el directorio. Puedes afiliarte, reunir
                comunidad en tu territorio o contactar a Fuerza Índigo para presentar una iniciativa.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href="/afiliate/agremiado"
                  className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:brightness-110"
                >
                  Afiliarme sin costo <Arrow />
                </Link>
                <Link
                  href="/contacto"
                  className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-cyan-300/55 bg-white/5 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:bg-white/10"
                >
                  Contactar <Arrow />
                </Link>
              </div>
            </div>
          ) : (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {delegaciones.map((delegacion) => (
                <li key={delegacion.publicId}>
                  <article className="h-full rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5">
                    <div className="flex items-center gap-4">
                      <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-cyan-300/30 bg-cyan-300/5">
                        <LandingIcon name="red-territorial" className="size-9" />
                      </span>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">
                          {typeLabel[delegacion.type]}
                        </p>
                        <h3 className="mt-1 text-xl font-black">{delegacion.name}</h3>
                      </div>
                    </div>
                    {delegacion.parentName !== null && (
                      <p className="mt-4 text-sm text-blue-100/65">Forma parte de {delegacion.parentName}.</p>
                    )}
                    <p className="mt-2 text-sm text-blue-100/65">
                      {delegacion.countryCode}
                      {delegacion.stateCode === null ? '' : ` · ${delegacion.stateCode}`}
                    </p>
                    <div className="mt-5 border-t border-cyan-300/15 pt-4">
                      {delegacion.contactEmail === null ? (
                        <Link href="/contacto" className="text-sm font-bold text-cyan-300 underline-offset-4 hover:underline">
                          Contactar mediante Fuerza Índigo
                        </Link>
                      ) : (
                        <a
                          href={`mailto:${delegacion.contactEmail}`}
                          className="text-sm font-bold text-cyan-300 underline-offset-4 hover:underline"
                        >
                          Escribir a la delegación
                        </a>
                      )}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="border-b border-cyan-400/15 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Estructura territorial</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight">Unidad nacional, presencia local</h2>
          </header>

          <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {structure.map((item, index) => (
              <li key={item.number} className="relative rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5">
                <p className="text-sm font-black text-cyan-300">{item.number} · {item.level}</p>
                <h3 className="mt-2 text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-blue-100/70">{item.description}</p>
                {index < structure.length - 1 && (
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
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[.78fr_1.22fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Construir territorio</p>
            <h2 className="mt-3 text-3xl font-black uppercase tracking-tight">Cómo impulsar una delegación</h2>
            <p className="mt-4 leading-relaxed text-blue-100/75">
              Una delegación no se crea solo colocando un nombre en el mapa. Necesita comunidad, propósito,
              responsabilidades claras y formalización dentro de la estructura institucional.
            </p>
          </div>

          <ol className="grid gap-4 sm:grid-cols-2">
            {formation.map(([title, description], index) => (
              <li key={title} className="rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-5">
                <p className="text-sm font-black text-cyan-300">{String(index + 1).padStart(2, '0')}</p>
                <h3 className="mt-2 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-blue-100/70">{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl border border-cyan-300/30 bg-[radial-gradient(circle_at_80%_20%,rgba(0,196,255,.16),transparent_34%),linear-gradient(120deg,#10083d,#061846)] px-6 py-10 text-center sm:px-10">
          <LandingIcon name="red-territorial" className="mx-auto size-16" />
          <h2 className="mt-4 text-3xl font-black uppercase tracking-tight">La red empieza con personas organizadas</h2>
          <p className="mx-auto mt-4 max-w-2xl text-blue-100/75">
            Afíliate, conecta con tu comunidad y ayúdanos a construir representación cercana, responsable y
            verificable.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/afiliate/agremiado"
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:brightness-110"
            >
              Afiliarme sin costo <Arrow />
            </Link>
            <Link
              href="/contacto"
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-cyan-300/55 bg-white/5 px-6 py-3 text-sm font-bold uppercase tracking-wide transition hover:bg-white/10"
            >
              Proponer una delegación <Arrow />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
