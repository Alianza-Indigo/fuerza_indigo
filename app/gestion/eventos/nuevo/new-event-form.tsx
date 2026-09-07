'use client';

import { useActionState } from 'react';
import type { EventKind, EventModality, EventVisibility } from '@prisma-client/enums';
import { Checkbox, ErrorNotice, Field, Select, SubmitButton } from '@/design-system/primitives';
import { CLASE_DE_EVENTO, MODALIDAD, VISIBILIDAD } from '../etiquetas';
import { createEventAction, type EventoState } from '../actions';

const INICIAL: EventoState = { status: 'idle' };
const CLASES = Object.keys(CLASE_DE_EVENTO) as EventKind[];
const MODALIDADES = Object.keys(MODALIDAD) as EventModality[];
const VISIBILIDADES = Object.keys(VISIBILIDAD) as EventVisibility[];

export function NewEventForm({ legalEntityId }: { legalEntityId: string }) {
  const [estado, accion] = useActionState(createEventAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo crear'} />}
      <input type="hidden" name="legalEntityId" value={legalEntityId} />

      <Field name="title" label="Título" required defaultValue={estado.values?.['title']} errors={estado.fieldErrors?.['title']} />
      <Select name="kind" label="Clase de evento" required defaultValue={estado.values?.['kind']}
        options={CLASES.map((k) => ({ value: k, label: CLASE_DE_EVENTO[k] }))} errors={estado.fieldErrors?.['kind']} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="startsAt" label="Inicio" type="datetime-local" required defaultValue={estado.values?.['startsAt']} errors={estado.fieldErrors?.['startsAt']} />
        <Field name="endsAt" label="Fin" type="datetime-local" required defaultValue={estado.values?.['endsAt']} errors={estado.fieldErrors?.['endsAt']} />
      </div>

      <Select name="modality" label="Modalidad" required defaultValue={estado.values?.['modality']}
        options={MODALIDADES.map((m) => ({ value: m, label: MODALIDAD[m] }))} errors={estado.fieldErrors?.['modality']} />
      <Field name="venue" label="Lugar" hint="Dónde ocurre, o la liga si es a distancia." defaultValue={estado.values?.['venue']} errors={estado.fieldErrors?.['venue']} />
      <Field name="capacity" label="Aforo" type="text" inputMode="numeric" hint="Déjalo vacío si no hay límite. Un cupo lleno pasa a las siguientes a lista de espera." defaultValue={estado.values?.['capacity']} errors={estado.fieldErrors?.['capacity']} />

      <Select name="visibility" label="Quién lo ve" required defaultValue={estado.values?.['visibility'] ?? 'MEMBERS'}
        options={VISIBILIDADES.map((v) => ({ value: v, label: VISIBILIDAD[v] }))} errors={estado.fieldErrors?.['visibility']} />
      <Checkbox name="membersOnly" label="Solo pueden inscribirse personas agremiadas con membresía activa" />

      <SubmitButton>Crear evento</SubmitButton>
    </form>
  );
}
