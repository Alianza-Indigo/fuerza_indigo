import type { Metadata } from 'next';
import { NetworkExplorer } from '@/components/network-map/network-explorer';
import { publicNetworkMap } from '@/modules/network-map';
import { isMapCategory } from '@/modules/network-map/public';
import { socialMetadata } from '@/platform/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = socialMetadata({ title: 'Mapa nacional', description: 'Encuentra delegaciones estatales, municipales, seccionales y agremiados honorarios de Fuerza Índigo, con sus datos de contacto.', path: '/mapa' });

export default async function NetworkMapPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const [entries, params] = await Promise.all([publicNetworkMap(), searchParams]);
  return <main id="contenido" className="fi-dark min-h-full bg-[#030923] px-4 py-12 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <p className="text-sm font-bold uppercase tracking-widest text-cyan-300">Fuerza Índigo cerca de ti</p>
      <h1 className="mt-3 text-4xl font-black uppercase">Mapa nacional</h1>
      <p className="mb-8 mt-4 max-w-3xl text-blue-100">Encuentra tu delegación o contacta a los agremiados honorarios de nuestra red. Elige qué quieres ver y selecciona una ubicación para consultar sus datos.</p>
      <NetworkExplorer entries={entries} initialCategory={isMapCategory(params.tipo) ? params.tipo : ''} />
    </div>
  </main>;
}
