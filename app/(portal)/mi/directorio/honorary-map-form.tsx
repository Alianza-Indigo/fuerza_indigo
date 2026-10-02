'use client';

import dynamic from 'next/dynamic';
import { useActionState, useMemo, useState } from 'react';
import { ErrorNotice, Field, Notice, SubmitButton, SuccessNotice } from '@/design-system/primitives';
import type { OwnHonoraryMapEntry } from '@/modules/network-map';
import { submitMapLocationRequestAction, type DirectorioPropioState } from './actions';

const MapCanvas = dynamic(() => import('@/components/network-map/map-canvas'), {
  ssr: false,
  loading: () => <p role="status">Cargando selector de ubicación…</p>,
});
const INITIAL: DirectorioPropioState = { status: 'idle' };

export function HonoraryMapRequestForm({ item }: { item: OwnHonoraryMapEntry }) {
  const proposal = item.latestRequest;
  const initialLatitude = proposal?.latitude ?? item.entry.latitude;
  const initialLongitude = proposal?.longitude ?? item.entry.longitude;
  const [result, action, pending] = useActionState(submitMapLocationRequestAction, INITIAL);
  const [latitude, setLatitude] = useState(initialLatitude?.toString() ?? '');
  const [longitude, setLongitude] = useState(initialLongitude?.toString() ?? '');
  const points = useMemo(() => [{
    ...item.entry,
    latitude: latitude === '' ? null : Number(latitude),
    longitude: longitude === '' ? null : Number(longitude),
  }], [item.entry, latitude, longitude]);
  const values = proposal ?? item.entry;

  return (
    <form action={action} className="space-y-5">
      <div>
        <h3 className="text-xl font-semibold">{item.entry.name}</h3>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Haz clic en el punto exacto del mapa o captura las coordenadas.
        </p>
      </div>
      <input type="hidden" name="subjectKey" value={item.entry.id} />

      {proposal?.status === 'PENDING' && (
        <Notice tone="warning" title="Solicitud pendiente de autorización">
          <p>La ubicación anterior, si existe, permanece sin cambios mientras el Superadmin revisa esta propuesta.</p>
        </Notice>
      )}
      {proposal?.status === 'APPROVED' && (
        <Notice tone="success" title="Ubicación autorizada y publicada" />
      )}
      {proposal?.status === 'REJECTED' && (
        <Notice tone="danger" title="La ubicación necesita correcciones">
          <p>{proposal.reviewNote ?? 'Revisa la información y envíala nuevamente.'}</p>
        </Notice>
      )}
      {result.status === 'error' && (
        <ErrorNotice title={result.message ?? 'No se pudo enviar la ubicación'}>
          <ul>{Object.values(result.fieldErrors ?? {}).flat().map((message) => <li key={message}>{message}</li>)}</ul>
        </ErrorNotice>
      )}
      {result.status === 'ok' && <SuccessNotice title={result.message ?? 'Solicitud enviada'} />}

      <MapCanvas entries={points} onPick={(lat, lng) => {
        setLatitude(String(lat));
        setLongitude(String(lng));
      }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          Latitud
          <input name="latitude" type="number" min={-90} max={90} step="any" required value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
            className="mt-2 min-h-11 w-full rounded border border-[var(--color-line)] bg-[var(--color-surface)] p-3" />
        </label>
        <label>
          Longitud
          <input name="longitude" type="number" min={-180} max={180} step="any" required value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
            className="mt-2 min-h-11 w-full rounded border border-[var(--color-line)] bg-[var(--color-surface)] p-3" />
        </label>
        <Field name="city" label="Ciudad o municipio" defaultValue={values.city ?? ''} />
        <Field name="state" label="Estado" defaultValue={values.state ?? ''} />
        <Field name="address" label="Dirección pública de atención" defaultValue={values.address ?? ''} />
        <Field name="contactName" label="Persona o área de contacto público" defaultValue={values.contactName ?? ''} />
        <Field name="email" type="email" label="Correo público" defaultValue={values.email ?? ''} />
        <Field name="phone" type="tel" label="Teléfono público" defaultValue={values.phone ?? ''} />
        <Field name="website" type="url" label="Sitio web" defaultValue={values.website ?? ''} />
      </div>
      <Notice tone="neutral" title="La ubicación no se publica automáticamente">
        <p>Al enviarla autorizas que estos datos se muestren si el Superadmin aprueba la solicitud.</p>
      </Notice>
      <SubmitButton>{pending ? 'Enviando…' : proposal?.status === 'PENDING' ? 'Reemplazar solicitud pendiente' : 'Enviar para autorización'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pending ? 'Enviando solicitud' : ''}</p>
    </form>
  );
}
