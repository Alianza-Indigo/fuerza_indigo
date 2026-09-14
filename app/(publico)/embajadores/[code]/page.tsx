import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { publicIndigoAmbassador } from '@/modules/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Afiliación con Embajador Índigo',
  robots: { index: false, follow: false },
};

export default async function AmbassadorAffiliationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ambassador = await publicIndigoAmbassador(code);
  if (ambassador === null) notFound();

  const promoter = encodeURIComponent(ambassador.code);
  return (
    <main id="contenido" className="min-h-dvh bg-[var(--color-surface-sunken)] px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-7">
        <header>
          <p className="text-sm font-bold uppercase tracking-[.18em] text-[var(--color-accent-ink)]">Embajadores Índigo</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">Registro acompañado por {ambassador.displayName}</h1>
          <p className="mt-4 text-lg text-[var(--color-ink-soft)]">
            Elige la categoría que corresponde. El código {ambassador.code} identificará quién acompañó el registro,
            pero no le permitirá aprobarlo ni consultar el expediente.
          </p>
          <p className="mt-3 text-sm font-medium">
            Completa el formulario con la persona presente: ella debe proporcionar los datos y aceptar personalmente los avisos y declaraciones.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <CategoryLink href={`/afiliate/agremiado?promotor=${promoter}`} title="Agremiado" description="Con voz y voto." />
          <CategoryLink href={`/afiliate/honoraria?promotor=${promoter}`} title="Agremiado honorario" description="Con voz y sin voto." />
          <CategoryLink href={`/afiliate/beneficiario?promotor=${promoter}`} title="Beneficiario protegido" description="Ayuda y protección." />
        </div>

        <p className="text-sm text-[var(--color-ink-soft)]">
          La afiliación y el registro protegido no dependen de comprar una credencial física.
        </p>
      </div>
    </main>
  );
}

function CategoryLink({ href, title, description }: { readonly href: string; readonly title: string; readonly description: string }) {
  return (
    <Link href={href} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-5 shadow-[var(--shadow-subtle)] hover:border-[var(--color-accent)]">
      <span className="block font-semibold">{title}</span>
      <span className="mt-1 block text-sm text-[var(--color-ink-soft)]">{description}</span>
    </Link>
  );
}
