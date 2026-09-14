import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/design-system/primitives';
import { publicHonoraryDirectory } from '@/modules/membership';
import { socialMetadata } from '@/platform/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = socialMetadata({
  title: 'Agremiados honorarios',
  description:
    'Personas, empresas y organizaciones que participan con voz en Fuerza Índigo y autorizaron aparecer públicamente.',
  path: '/agremiados-honorarios',
});

function text(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function list(fields: Record<string, unknown>, key: string): string[] {
  const value = fields[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : [];
}

export default async function HonoraryMembersPage() {
  const members = await publicHonoraryDirectory();

  return (
    <main
      id="contenido"
      className="fi-dark min-h-full overflow-hidden bg-[linear-gradient(180deg,#030923_0%,#07143d_52%,#030923_100%)] text-white"
    >
      <section className="relative isolate border-b border-cyan-300/20 px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_20%,rgba(114,55,255,.34),transparent_34%),radial-gradient(circle_at_82%_40%,rgba(0,200,255,.16),transparent_30%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-20 [background-image:linear-gradient(rgba(76,151,255,.14)_1px,transparent_1px),linear-gradient(90deg,rgba(76,151,255,.14)_1px,transparent_1px)] [background-size:56px_56px]"
        />
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
          <header>
            <p className="text-xs font-bold uppercase tracking-[.24em] text-cyan-300">Comunidad Fuerza Índigo</p>
            <h1 className="mt-4 max-w-[15ch] text-[clamp(2.5rem,5vw,4.8rem)] font-black uppercase leading-[.94] tracking-[-.04em]">
              Agremiados honorarios
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-blue-100/80 sm:text-xl">
              Personas, empresas y organizaciones que ponen su experiencia al servicio de la inclusión y participan
              con voz en la vida de Fuerza Índigo.
            </p>
          </header>

          <div className="border-l-2 border-cyan-300 pl-5">
            <p className="text-2xl font-black">Personas y organizaciones</p>
            <p className="mt-2 text-sm leading-relaxed text-blue-100/70">
              La cuota se determina de forma individual durante la revisión de cada solicitud. La presencia en esta
              red requiere autorización expresa.
            </p>
            <Link
              href="/afiliate/honoraria"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-gradient-to-r from-violet-600 to-cyan-400 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Solicitar afiliación →
            </Link>
          </div>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto w-full max-w-7xl">
          <div className="flex flex-col gap-3 border-b border-cyan-300/20 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-300">Red pública</p>
              <h2 className="mt-2 text-2xl font-black uppercase tracking-tight">Quienes decidieron presentarse</h2>
            </div>
            <p className="text-sm text-blue-100/65">
              {members.length} {members.length === 1 ? 'agremiado honorario visible' : 'agremiados honorarios visibles'}
            </p>
          </div>

          {members.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-cyan-300/20 bg-white/[.045] p-6">
              <EmptyState
                title="La red pública está comenzando"
                description="Las fichas aparecerán cuando los primeros agremiados honorarios activos autoricen su publicación."
              />
            </div>
          ) : (
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((member) => {
                const name = text(member.fields, 'nombre') ?? 'Agremiado honorario';
                const headline = text(member.fields, 'titular');
                const territory = text(member.fields, 'territorio');
                const specialties = list(member.fields, 'especialidades');
                const website = text(member.fields, 'sitioWeb');
                return (
                  <li
                    key={member.slug}
                    className="flex min-h-64 flex-col rounded-2xl border border-cyan-300/25 bg-[#071133]/80 p-6 shadow-[0_16px_44px_rgba(0,0,0,.18)]"
                  >
                    <div className="flex items-start gap-4">
                      <span
                        aria-hidden="true"
                        className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-400 text-lg font-black"
                      >
                        {name.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <h3 className="text-lg font-bold">{name}</h3>
                        <p className="mt-1 text-xs font-bold uppercase tracking-wider text-cyan-300">
                          Agremiado honorario activo
                        </p>
                      </div>
                    </div>

                    {headline !== null && <p className="mt-5 font-semibold text-blue-50">{headline}</p>}
                    {territory !== null && <p className="mt-2 text-sm text-blue-100/65">{territory}</p>}
                    {specialties.length > 0 && (
                      <ul className="mt-4 flex flex-wrap gap-2">
                        {specialties.slice(0, 3).map((specialty) => (
                          <li key={specialty} className="rounded-full border border-cyan-300/25 px-3 py-1 text-xs text-cyan-100">
                            {specialty}
                          </li>
                        ))}
                      </ul>
                    )}

                    {member.profileHref !== null ? (
                      <Link
                        href={member.profileHref}
                        className="mt-auto pt-6 text-sm font-bold text-cyan-300 underline underline-offset-4"
                      >
                        Ver ficha pública →
                      </Link>
                    ) : website !== null ? (
                      <a
                        href={website}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-auto pt-6 text-sm font-bold text-cyan-300 underline underline-offset-4"
                      >
                        Visitar sitio web →
                      </a>
                    ) : (
                      <p className="mt-auto pt-6 text-xs font-bold uppercase tracking-wider text-blue-100/55">
                        Organización agremiada
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-8 max-w-4xl text-sm leading-relaxed text-blue-100/60">
            Esta lista no es el padrón completo. Solo aparecen personas y organizaciones con membresía honoraria
            vigente y autorización expresa. La autorización puede retirarse en cualquier momento.
          </p>
        </div>
      </section>
    </main>
  );
}
