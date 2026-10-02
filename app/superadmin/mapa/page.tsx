import { EmptyState, ErrorNotice, PageShell } from '@/design-system/primitives';
import { manageNetworkMap } from '@/modules/network-map';
import { currentActor } from '@/platform/http/request-context';
import { MapManager } from './map-manager';

export const metadata = { title: 'Mapa nacional', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function MapManagementPage() {
  const result = await manageNetworkMap(await currentActor());
  return <PageShell title="Mapa nacional" description="Revisa solicitudes de honorarios y administra la ubicación pública de toda la red.">
    {!result.ok ? <ErrorNotice title={result.error.message} /> : result.data.length === 0 ?
      <EmptyState title="Todavía no hay registros públicos disponibles" description="Las delegaciones aparecerán al estar constituidas y activas. Los honorarios deben tener membresía vigente y autorización de publicación en el directorio." /> :
      <MapManager entries={result.data} />}
  </PageShell>;
}
