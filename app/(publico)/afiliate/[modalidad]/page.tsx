import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { socialMetadata } from '@/platform/seo';
import { AffiliationRequestForm } from '../affiliation-request-form';

type Modality = 'agremiado' | 'honoraria';

const CONTENT = {
  agremiado: {
    eyebrow: 'Afiliación sindical',
    title: 'Solicitud para persona agremiada',
    description:
      'Para personas trabajadoras de 15 años o más, subordinadas o independientes, cuya actividad tiene contacto con personas neurodivergentes.',
    modality: 'UNION_MEMBER' as const,
    icon: 'comunidad',
    requirements: [
      'Tener 15 años o más.',
      'Realizar una actividad laboral subordinada, independiente, autónoma o por cuenta propia.',
      'Tener contacto con personas neurodivergentes a través de esa actividad.',
    ],
    benefits: ['Voz y voto conforme a los estatutos', 'Representación y defensa', 'Credencial sindical'],
  },
  honoraria: {
    eyebrow: 'Afiliación honoraria',
    title: 'Solicitud de afiliación honoraria',
    description:
      'Para personas neurodivergentes, familiares y personas cuidadoras que desean integrarse a la comunidad sin adquirir derechos políticos sindicales.',
    modality: 'HONORARY_AFFILIATE' as const,
    icon: 'familia-comunidad',
    requirements: [
      'Ser una persona neurodivergente, familiar o persona cuidadora.',
      'Compartir un correo donde podamos dar seguimiento al trámite.',
      'Aceptar el aviso de privacidad vigente.',
    ],
    benefits: ['Participación en comunidad', 'Acceso a programas', 'Herramientas y actividades'],
  },
} as const;

function isModality(value: string): value is Modality {
  return value === 'agremiado' || value === 'honoraria';
}

export function generateStaticParams() {
  return [{ modalidad: 'agremiado' }, { modalidad: 'honoraria' }];
}

export async function generateMetadata({ params }: { params: Promise<{ modalidad: string }> }): Promise<Metadata> {
  const { modalidad } = await params;
  if (!isModality(modalidad)) return { title: 'Solicitud de afiliación' };
  const content = CONTENT[modalidad];
  return socialMetadata({
    title: content.title,
    description: content.description,
    path: `/afiliate/${modalidad}`,
  });
}

export default async function AffiliationPage({ params }: { params: Promise<{ modalidad: string }> }) {
  const { modalidad } = await params;
  if (!isModality(modalidad)) notFound();
  const content = CONTENT[modalidad];

  return (
    <main
      id="contenido"
      className="fi-dark overflow-hidden bg-[linear-gradient(180deg,#030923_0%,#07143d_52%,#030923_100%)] text-white"
    >
      <section className="relative isolate border-b border-cyan-300/20">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_15%_10%,rgba(114,55,255,.35),transparent_34%),radial-gradient(circle_at_85%_36%,rgba(0,200,255,.18),transparent_30%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-20 [background-image:linear-gradient(rgba(76,151,255,.14)_1px,transparent_1px),linear-gradient(90deg,rgba(76,151,255,.14)_1px,transparent_1px)] [background-size:56px_56px]"
        />

        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.25fr_.75fr] lg:items-center lg:px-8 lg:py-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.24em] text-cyan-300">{content.eyebrow}</p>
            <h1 className="mt-4 max-w-[18ch] text-[clamp(2.35rem,5vw,4.65rem)] font-black uppercase leading-[.96] tracking-[-.035em]">
              {content.title}
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-blue-100/75 sm:text-xl">{content.description}</p>

            <nav aria-label="Modalidades de afiliación" className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/afiliate/agremiado"
                aria-current={modalidad === 'agremiado' ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-bold transition ${
                  modalidad === 'agremiado'
                    ? 'border-cyan-300 bg-cyan-300 text-[#04102f]'
                    : 'border-cyan-300/35 bg-white/5 text-blue-100 hover:bg-white/10'
                }`}
              >
                Persona agremiada
              </Link>
              <Link
                href="/afiliate/honoraria"
                aria-current={modalidad === 'honoraria' ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-bold transition ${
                  modalidad === 'honoraria'
                    ? 'border-cyan-300 bg-cyan-300 text-[#04102f]'
                    : 'border-cyan-300/35 bg-white/5 text-blue-100 hover:bg-white/10'
                }`}
              >
                Afiliación honoraria
              </Link>
            </nav>
          </div>

          <div className="mx-auto grid w-full max-w-sm place-items-center">
            <div className="relative grid aspect-square w-full max-w-[280px] place-items-center rounded-full border border-cyan-300/20 bg-[radial-gradient(circle,rgba(52,211,235,.14),rgba(79,70,229,.08)_55%,transparent_70%)]">
              <Image
                src={`/landing/iconos/icono-${content.icon}.png`}
                alt=""
                aria-hidden="true"
                width={512}
                height={512}
                sizes="220px"
                className="h-auto w-[76%] object-contain drop-shadow-[0_0_35px_rgba(0,205,255,.25)]"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
          <aside className="space-y-7 lg:sticky lg:top-28">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-300">Antes de empezar</p>
              <h2 className="mt-2 text-2xl font-black uppercase tracking-tight">Requisitos claros</h2>
              <ul className="mt-5 space-y-3">
                {content.requirements.map((requirement) => (
                  <li key={requirement} className="flex gap-3 text-blue-100/75">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-cyan-300/15 text-sm font-bold text-cyan-300"
                    >
                      ✓
                    </span>
                    <span>{requirement}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-cyan-300/20 bg-white/[.045] p-5">
              <h2 className="font-bold">Lo que incluye</h2>
              <ul className="mt-3 space-y-2 text-sm text-blue-100/70">
                {content.benefits.map((benefit) => (
                  <li key={benefit}>• {benefit}</li>
                ))}
              </ul>
            </div>

            <div className="border-l-2 border-fuchsia-400 pl-4 text-sm leading-relaxed text-blue-100/65">
              <p className="font-bold text-white">No necesitas defender tus derechos en soledad.</p>
              <p className="mt-1">La solicitud es gratuita y una persona revisa cada caso.</p>
            </div>
          </aside>

          <section
            aria-labelledby="form-title"
            className="rounded-2xl border border-cyan-200/25 bg-white p-5 text-slate-950 shadow-[0_28px_80px_rgba(0,0,0,.28)] sm:p-8"
          >
            <header className="mb-7 border-b border-slate-200 pb-6">
              <p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-700">Solicitud inicial</p>
              <h2 id="form-title" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                Cuéntanos quién eres
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                Toma entre 4 y 6 minutos. Al enviarla recibirás un folio; después te contactaremos para continuar el
                expediente formal.
              </p>
            </header>

            <AffiliationRequestForm modality={content.modality} />
          </section>
        </div>
      </section>

      <section className="border-t border-cyan-300/20 bg-[#02071e]/80 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">¿Ya recibiste una invitación?</h2>
            <p className="mt-1 text-sm text-blue-100/65">
              Activa tu cuenta desde el correo y continúa el expediente en el portal.
            </p>
          </div>
          <Link
            href="/acceso"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-cyan-300/45 px-5 font-bold text-white transition hover:bg-white/10"
          >
            Entrar al portal →
          </Link>
        </div>
      </section>
    </main>
  );
}
