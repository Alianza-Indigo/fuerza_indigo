import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { publishedList } from '@/modules/content';
import { formatDate } from '@/platform/i18n';
import { StructuredData, organizacion, sitioWeb, socialMetadata } from '@/platform/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = socialMetadata({
  title: 'Sindicato Unión de Inclusión y Derechos Neurodivergentes',
  description:
    'Fuerza Índigo representa, defiende y conecta a personas trabajadoras vinculadas con la comunidad neurodivergente.',
  path: '/',
});

type IconName =
  | 'users'
  | 'heart'
  | 'hand'
  | 'shield'
  | 'vote'
  | 'book'
  | 'briefcase'
  | 'file'
  | 'id'
  | 'person'
  | 'check'
  | 'message'
  | 'network'
  | 'map'
  | 'chart';

type LandingIconName =
  | 'alianza'
  | 'comunidad'
  | 'conexion'
  | 'defensa'
  | 'familia-comunidad'
  | 'formacion'
  | 'neurodiversidad'
  | 'oportunidades'
  | 'participacion'
  | 'persona'
  | 'red-territorial'
  | 'trabajo';

const participation = [
  {
    asset: 'comunidad' as const,
    title: 'Agremiado',
    description:
      'Persona trabajadora mayor de 15 años, subordinada o independiente, cuya actividad tiene contacto con personas neurodivergentes.',
    tags: ['Voz y voto', 'Representación', 'Credencial sindical'],
    href: '/afiliate/agremiado',
    cta: 'Solicitar afiliación',
  },
  {
    asset: 'familia-comunidad' as const,
    title: 'Afiliación honoraria',
    description:
      'Personas neurodivergentes, familiares y cuidadores que desean integrarse sin adquirir derechos políticos sindicales.',
    tags: ['Comunidad', 'Programas', 'Herramientas'],
    href: '/afiliate/honoraria',
    cta: 'Unirme como honorario',
  },
  {
    asset: 'alianza' as const,
    title: 'Beneficiario protegido',
    description:
      'Orientación, defensa o acompañamiento sin necesidad de afiliación y con una canalización responsable.',
    tags: ['Sin afiliación', 'Privacidad reforzada', 'Canalización'],
    href: '/solicitar-apoyo',
    cta: 'Solicitar apoyo',
  },
] as const;

const benefits = [
  {
    asset: 'defensa' as const,
    title: 'Defensa y representación',
    description: 'Acompañamiento laboral y administrativo ante vulneraciones de derechos.',
  },
  {
    asset: 'participacion' as const,
    title: 'Participación democrática',
    description: 'Tu voz cuenta en la toma de decisiones del sindicato.',
  },
  {
    asset: 'formacion' as const,
    title: 'Formación y certificaciones',
    description: 'Capacitación, talleres y rutas para tu desarrollo profesional.',
  },
  {
    asset: 'trabajo' as const,
    title: 'Herramientas y oportunidades',
    description: 'Recursos, vinculación y espacios para crecer en lo personal y profesional.',
  },
] as const;

const steps = [
  { asset: 'persona' as const, title: 'Crea tu solicitud', description: 'Completa un formulario en línea.' },
  { asset: 'oportunidades' as const, title: 'Acredita tu actividad', description: 'Comparte la documentación solicitada.' },
  { asset: 'alianza' as const, title: 'Revisión humana', description: 'Nuestro equipo revisa tu información.' },
  { asset: 'conexion' as const, title: 'Resolución y credencial', description: 'Recibe la confirmación y tu credencial.' },
] as const;

const ecosystem = [
  { title: 'ADIA', description: 'Planeaciones didácticas inclusivas', href: '/herramientas', asset: 'formacion' as const },
  { title: 'NeuroPlan', description: 'Organización y autonomía', href: '/herramientas', asset: 'persona' as const },
  { title: 'NEXO', description: 'Red de acompañamiento', href: '/herramientas', asset: 'conexion' as const },
  { title: 'CIAN', description: 'Atención integral', href: '/cian', asset: 'familia-comunidad' as const },
  {
    title: 'CENI',
    description: 'Certificación de entornos neuroinclusivos',
    href: '/ceni',
    asset: 'neurodiversidad' as const,
  },
] as const;

const transparency = [
  { icon: 'file' as const, title: 'Estatutos y acuerdos', description: 'Consulta los documentos fundamentales.' },
  { icon: 'users' as const, title: 'Asambleas', description: 'Infórmate y participa en nuestros procesos colectivos.' },
  { icon: 'check' as const, title: 'Votaciones verificables', description: 'Procesos claros, trazables y auditables.' },
  { icon: 'chart' as const, title: 'Rendición de cuentas', description: 'Información pública y accesible.' },
] as const;

function Icon({ name, className = 'size-7' }: { name: IconName; className?: string }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  const paths: Record<IconName, ReactNode> = {
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21.3l7.8-7.8 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    hand: <><path d="M2 16h5l3 3h6l6-6a2.1 2.1 0 0 0-3-3l-4 3" /><path d="M7 16V9h3l3 3h3a2 2 0 0 1 0 4h-5" /><circle cx="17" cy="5" r="3" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
    vote: <><path d="M4 11h16v10H4z" /><path d="m8 11 4-8 4 8M9 16h6" /></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 5.5v14M8 7h8" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2" /></>,
    file: <><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5M9 12h6M9 16h6" /></>,
    id: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.7-1.5 1.7-2 3-2s2.3.5 3 2M14 10h4M14 14h4" /></>,
    person: <><circle cx="12" cy="7" r="4" /><path d="M4 22a8 8 0 0 1 16 0" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></>,
    network: <><circle cx="12" cy="5" r="3" /><circle cx="5" cy="18" r="3" /><circle cx="19" cy="18" r="3" /><path d="m10.5 7.5-4 8M13.5 7.5l4 8M8 18h8" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20V7" /><path d="M2 20h22" /></>,
  };

  return <svg aria-hidden="true" viewBox="0 0 24 24" className={className} {...common}>{paths[name]}</svg>;
}

function LandingIcon({ name, className = 'size-12' }: { name: LandingIconName; className?: string }) {
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

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_28px_rgba(0,207,255,.2)] transition hover:brightness-110"
    >
      {children} <Arrow />
    </Link>
  );
}

function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-cyan-300/55 bg-white/5 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-white/10"
    >
      {children} <Arrow />
    </Link>
  );
}

function SectionTitle({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <header className="mx-auto max-w-3xl text-center">
      {eyebrow !== undefined && <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">{eyebrow}</p>}
      <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">{title}</h2>
      {description !== undefined && <p className="mx-auto mt-3 max-w-2xl text-base text-blue-100/75 sm:text-lg">{description}</p>}
    </header>
  );
}

export default async function InicioPage() {
  const noticias = await publishedList('NEWS', { limit: 3 });

  return (
    <main id="contenido" className="fi-dark overflow-hidden bg-[#030923] text-white">
      <StructuredData data={organizacion()} />
      <StructuredData data={sitioWeb()} />

      <section className="relative isolate border-b border-cyan-400/30">
        <div aria-hidden="true" className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_20%,rgba(102,51,255,.32),transparent_31%),radial-gradient(circle_at_82%_32%,rgba(0,196,255,.2),transparent_29%),linear-gradient(120deg,#07072d_0%,#071548_55%,#020b2d_100%)]" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 opacity-25 [background-image:linear-gradient(rgba(76,151,255,.15)_1px,transparent_1px),linear-gradient(90deg,rgba(76,151,255,.15)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="mx-auto grid min-h-[680px] w-full max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-24">
          <div className="relative z-10">
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-cyan-300">Fuerza Índigo</p>
            <h1 className="mt-4 max-w-[17ch] text-[clamp(2.55rem,4.2vw,4rem)] font-black uppercase leading-[.94] tracking-[-.035em] text-white">
              Sindicato Unión de Inclusión y Derechos Neurodivergentes
            </h1>
            <p className="mt-7 max-w-[28ch] text-2xl font-black uppercase leading-tight text-white sm:text-3xl">
              No tienes que defender tus derechos en soledad.
            </p>
            <p className="mt-5 max-w-xl text-lg text-blue-100/80">
              Representación, defensa y herramientas reales para una comunidad con fuerza colectiva.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PrimaryLink href="/afiliate/agremiado">Afíliate sin costo</PrimaryLink>
              <SecondaryLink href="/solicitar-apoyo">Necesito apoyo ahora</SecondaryLink>
            </div>
          </div>

          <div className="relative aspect-[3/2] w-full">
            <div aria-hidden="true" className="absolute -inset-4 rounded-[3rem] bg-gradient-to-br from-violet-600/25 via-transparent to-cyan-400/20 blur-2xl" />
            <Image
              src="/landing/02-hero-comunidad-fuerza-indigo.png"
              alt="Grupo diverso de personas trabajadoras reunidas con confianza y solidaridad"
              fill
              preload
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="rounded-[2rem] border border-cyan-300/25 object-contain object-center shadow-2xl"
            />
          </div>
        </div>

        <div className="border-t border-cyan-400/25 bg-[#02071e]/75">
          <ul className="mx-auto grid w-full max-w-7xl grid-cols-2 px-4 py-4 text-center text-xs font-bold uppercase tracking-wider text-blue-100/75 sm:px-6 lg:grid-cols-4 lg:px-8">
            {[
              { label: 'Representación', asset: 'alianza' as const },
              { label: 'Defensa', asset: 'defensa' as const },
              { label: 'Comunidad', asset: 'comunidad' as const },
              { label: 'Innovación', asset: 'neurodiversidad' as const },
            ].map((item) => (
              <li key={item.label} className="flex min-h-11 items-center justify-center gap-2">
                <LandingIcon name={item.asset} className="size-5" /> {item.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="formas-de-participar" className="border-b border-cyan-400/25 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <SectionTitle title="Tres formas de formar parte" description="Cada vínculo tiene derechos, alcance y participación propios." />
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {participation.map((option) => (
              <article key={option.title} className="flex flex-col rounded-2xl border border-indigo-400/45 bg-gradient-to-b from-indigo-950/65 to-[#050d35] p-6 shadow-[0_18px_50px_rgba(0,0,0,.18)]">
                <div className="flex items-center gap-4">
                  <span className="grid size-14 shrink-0 place-items-center rounded-xl border border-cyan-300/45 bg-cyan-300/5"><LandingIcon name={option.asset} className="size-11" /></span>
                  <h3 className="text-xl font-black uppercase tracking-tight">{option.title}</h3>
                </div>
                <p className="mt-5 flex-1 text-blue-100/75">{option.description}</p>
                <ul className="mt-5 flex flex-wrap gap-2">
                  {option.tags.map((tag) => <li key={tag} className="rounded-full border border-cyan-300/30 bg-cyan-300/5 px-3 py-1 text-xs font-semibold text-cyan-100">{tag}</li>)}
                </ul>
                <div className="mt-6"><PrimaryLink href={option.href}>{option.cta}</PrimaryLink></div>
              </article>
            ))}
          </div>
          <p className="mt-7 text-center text-xl font-bold text-cyan-300">La afiliación a Fuerza Índigo es gratuita.</p>
        </div>
      </section>

      <section className="border-b border-cyan-400/25 bg-[#061039] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <SectionTitle title="Tu afiliación crea respaldo real" description="No ofrecemos promesas vacías: construimos capacidad colectiva." />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((benefit) => (
              <article key={benefit.title} className="rounded-2xl border border-cyan-300/35 bg-[#06133f] p-6 text-center">
                <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-cyan-300/5"><LandingIcon name={benefit.asset} className="size-12" /></span>
                <h3 className="mt-5 text-lg font-black uppercase leading-tight">{benefit.title}</h3>
                <p className="mt-3 text-sm text-blue-100/70">{benefit.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-cyan-400/25 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <SectionTitle title="Afiliarte es sencillo y gratuito" />
          <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title} className="relative rounded-2xl border border-indigo-400/35 bg-indigo-950/35 p-5">
                <span className="grid size-12 place-items-center rounded-xl border border-fuchsia-400/40 bg-fuchsia-400/5"><LandingIcon name={step.asset} className="size-9" /></span>
                <p className="mt-4 text-sm font-black text-cyan-300">{index + 1}.</p>
                <h3 className="mt-1 font-bold">{step.title}</h3>
                <p className="mt-2 text-sm text-blue-100/65">{step.description}</p>
                {index < steps.length - 1 && <span aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden text-2xl text-cyan-300 lg:block">›</span>}
              </li>
            ))}
          </ol>
          <p className="mt-6 text-center text-blue-100/70">Tu ingreso queda identificado, documentado y sujeto a una revisión humana.</p>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-cyan-400/25 bg-[#071344] px-4 py-16 sm:px-6 lg:px-8">
        <div aria-hidden="true" className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(94,72,255,.35),transparent_62%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Defensa y acompañamiento</p>
            <h2 className="mt-3 text-3xl font-black uppercase tracking-tight sm:text-4xl">Cuando tus derechos están en riesgo, actuamos contigo.</h2>
            <ul className="mt-7 space-y-4 text-blue-100/80">
              <li className="flex items-center gap-3"><Icon name="message" className="size-6 text-cyan-300" /> Orientación inicial</li>
              <li className="flex items-center gap-3"><Icon name="file" className="size-6 text-cyan-300" /> Acompañamiento documentado</li>
              <li className="flex items-center gap-3"><Icon name="users" className="size-6 text-cyan-300" /> Canalización y seguimiento</li>
            </ul>
            <div className="mt-8"><PrimaryLink href="/solicitar-apoyo">Solicitar apoyo ahora</PrimaryLink></div>
            <p className="mt-4 text-xs text-blue-100/55">Fuerza Índigo no sustituye los servicios de emergencia.</p>
          </div>
          <div>
            <div className="relative aspect-[3/2] overflow-hidden rounded-[2rem] border border-cyan-300/35 shadow-[0_0_55px_rgba(78,71,255,.25)]">
              <Image
                src="/landing/03-defensa-acompanamiento-fuerza-indigo.png"
                alt="Mujer neurodivergente frente a un escudo con el mensaje Tus derechos, nuestra fuerza"
                fill
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-cover"
              />
            </div>
            <blockquote className="mt-5 rounded-2xl border border-fuchsia-300/25 bg-[#040a2c]/70 px-6 py-5 text-center">
              <p className="text-xl font-semibold italic text-white">“Una comunidad organizada siempre tiene más fuerza.”</p>
            </blockquote>
          </div>
        </div>
      </section>

      <section className="border-b border-cyan-400/25 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <SectionTitle title="Tecnología que fortalece a la comunidad" description="Plataformas y recursos de acceso para impulsar tu desarrollo." />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {ecosystem.map((tool, index) => (
              <Link key={tool.title} href={tool.href} className="group flex min-h-56 flex-col rounded-2xl border border-indigo-400/40 bg-indigo-950/30 p-5 text-center transition hover:-translate-y-1 hover:border-cyan-300/70">
                <span className={`mx-auto grid size-16 place-items-center rounded-full border ${index % 2 === 0 ? 'border-cyan-300/45' : 'border-fuchsia-300/45'}`}><LandingIcon name={tool.asset} className="size-12" /></span>
                <h3 className="mt-4 text-xl font-black">{tool.title}</h3>
                <p className="mt-2 flex-1 text-sm text-blue-100/65">{tool.description}</p>
                <p className="mt-4 text-sm font-bold text-cyan-300 group-hover:underline">Conocer {tool.title} <Arrow /></p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-cyan-400/25 bg-[#061039] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-[.7fr_1.3fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Membresía verificable</p>
            <h2 className="mt-3 text-3xl font-black uppercase tracking-tight sm:text-4xl">Una credencial que acredita tu vínculo vigente.</h2>
            <p className="mt-4 text-blue-100/75">Tú decides si apareces públicamente en el directorio.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <PrimaryLink href="/verificar">Verificar credencial</PrimaryLink>
              <SecondaryLink href="/directorio">Conocer el directorio</SecondaryLink>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="relative min-h-64 overflow-hidden rounded-2xl border border-cyan-300/50 shadow-[0_0_42px_rgba(0,212,255,.16)]">
              <Image
                src="/landing/04-credencial-sindical-ejemplo.png"
                alt="Ejemplo visual de una credencial sindical de Fuerza Índigo"
                fill
                sizes="(max-width: 640px) 100vw, 40vw"
                className="object-contain"
              />
            </div>
            <div className="rounded-2xl border border-indigo-400/40 bg-[#030a2c] p-6">
              <h3 className="font-bold">Directorio de personas agremiadas</h3>
              <div className="mt-4 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-blue-100/55">Busca por nombre, profesión o estado…</div>
              <ul className="mt-5 space-y-3 text-sm text-blue-100/75">
                <li className="flex items-center gap-3"><Icon name="check" className="size-5 text-cyan-300" /> Participación voluntaria</li>
                <li className="flex items-center gap-3"><Icon name="shield" className="size-5 text-cyan-300" /> Privacidad bajo tu control</li>
                <li className="flex items-center gap-3"><Icon name="id" className="size-5 text-cyan-300" /> Vínculo vigente y verificable</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-cyan-400/25 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-[.6fr_1.4fr]">
          <div className="relative z-10">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Territorio</p>
            <h2 className="mt-3 text-3xl font-black uppercase tracking-tight sm:text-4xl">Una red cerca de ti</h2>
            <p className="mt-4 text-blue-100/75">Consulta las delegaciones publicadas y encuentra el canal adecuado para tu territorio.</p>
            <ul className="mt-5 space-y-2 text-sm text-blue-100/65">
              <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-fuchsia-400" /> Delegaciones estatales</li>
              <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-violet-400" /> Delegaciones municipales</li>
              <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-cyan-300" /> Secciones</li>
            </ul>
            <div className="mt-7"><PrimaryLink href="/delegaciones">Encontrar mi delegación</PrimaryLink></div>
          </div>
          <div className="relative min-h-72 lg:min-h-[430px]">
            <Image src="/landing/05-mapa-red-territorial.png" alt="Mapa ilustrado de México y América Latina unidos por una red índigo" fill sizes="(max-width: 1024px) 100vw, 60vw" className="object-contain" />
          </div>
        </div>
      </section>

      <section className="border-b border-cyan-400/25 bg-[#061039] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <SectionTitle title="Transparencia y vida democrática" description="La fuerza colectiva también se construye con reglas de desarrollo, información pública y participación." />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {transparency.map((item) => (
              <article key={item.title} className="rounded-2xl border border-indigo-400/40 bg-[#040c31] p-5">
                <Icon name={item.icon} className="size-8 text-cyan-300" />
                <h3 className="mt-4 font-bold">{item.title}</h3>
                <p className="mt-2 text-sm text-blue-100/65">{item.description}</p>
              </article>
            ))}
          </div>
          <p className="mt-8 text-center"><SecondaryLink href="/transparencia">Consultar transparencia</SecondaryLink></p>
        </div>
      </section>

      {noticias.length > 0 && (
        <section className="border-b border-cyan-400/25 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Al día</p><h2 className="mt-2 text-3xl font-black uppercase tracking-tight">Actualidad de Fuerza Índigo</h2></div>
              <SecondaryLink href="/noticias">Ver todas las noticias</SecondaryLink>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {noticias.map((nota) => (
                <article key={nota.slug} className="rounded-2xl border border-indigo-400/35 bg-indigo-950/30 p-6">
                  {nota.publishedAt !== null && <time dateTime={nota.publishedAt.toISOString()} className="text-xs font-bold uppercase tracking-wider text-cyan-300">{formatDate(nota.publishedAt)}</time>}
                  <h3 className="mt-3 text-xl font-bold"><Link href={`/noticias/${nota.slug}`} className="hover:underline">{nota.title}</Link></h3>
                  <p className="mt-3 text-sm text-blue-100/65">{nota.summary}</p>
                  <p className="mt-5 text-sm font-bold text-cyan-300"><Link href={`/noticias/${nota.slug}`} className="inline-flex min-h-11 items-center gap-2">Leer más <Arrow /></Link></p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="cta-final-title" className="relative isolate overflow-hidden bg-gradient-to-r from-violet-700 via-indigo-600 to-blue-600 px-4 py-14 text-center sm:px-6 lg:px-8">
        <div aria-hidden="true" className="absolute inset-0 -z-10 opacity-25 [background-image:linear-gradient(135deg,transparent_44%,white_45%,white_47%,transparent_48%)] [background-size:38px_38px]" />
        <h2 id="cta-final-title" className="text-3xl font-black uppercase tracking-tight sm:text-4xl">Tu voz cuenta. Tu trabajo cuenta. Tú cuentas.</h2>
        <p className="mx-auto mt-3 max-w-2xl text-blue-50/80">Únete a una comunidad organizada para transformar derechos en realidad.</p>
        <div className="mt-7"><PrimaryLink href="/afiliate/agremiado">Afíliate sin costo</PrimaryLink></div>
      </section>
    </main>
  );
}
