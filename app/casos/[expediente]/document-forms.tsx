'use client';

import { useActionState, useState } from 'react';
import {
  Checkbox,
  ErrorNotice,
  Field,
  Notice,
  RadioGroup,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
} from '@/design-system/primitives';
import type { CaseDocumentKind } from '@prisma-client/enums';
import { CLASIFICACION_MINIMA, NOMBRE_DE_DOCUMENTO, SE_ENSENAN_A_LA_PERSONA } from '@/modules/cases/domain';
import {
  attachDocumentAction,
  openClinicalDocumentAction,
  removeDocumentAction,
  type CaseFormState,
} from './actions';

const INICIAL: CaseFormState = { status: 'idle' };

/** Qué es cada clase, para que quien sube no elija por el nombre más corto. */
const PARA_QUE_SIRVE: Record<CaseDocumentKind, string> = {
  EVIDENCE: 'Lo que prueba lo que se cuenta: recibos, capturas, fotografías.',
  IDENTIFICATION: 'Documentos de identidad. Siempre dato personal sensible.',
  LEGAL_FILING: 'Demandas, contestaciones y promociones. Siempre privilegiado.',
  MEDICAL_OR_CLINICAL: 'Diagnósticos e informes clínicos. Abrirlos exige autorización expresa.',
  CORRESPONDENCE: 'Lo que se ha cruzado con la otra parte o con una autoridad.',
  INTERNAL_WORKING: 'Notas y borradores del equipo. No se le enseñan a la persona.',
  OTHER: 'Lo que no encaja en las demás.',
};

const CLASES: readonly CaseDocumentKind[] = [
  'EVIDENCE',
  'IDENTIFICATION',
  'LEGAL_FILING',
  'MEDICAL_OR_CLINICAL',
  'CORRESPONDENCE',
  'INTERNAL_WORKING',
  'OTHER',
];

/** Con qué reserva se guarda, cuando la clase no lo decide. */
const RESERVAS: readonly { value: string; label: string }[] = [
  { value: 'INTERNAL', label: 'Interno — lo ve el equipo de la entidad' },
  { value: 'RESTRICTED', label: 'Restringido — hace falta facultad expresa' },
  { value: 'SENSITIVE_PERSONAL', label: 'Dato personal sensible — pase de descarga corto' },
  { value: 'LEGAL_PRIVILEGED', label: 'Privilegiado — estrategia y escritos' },
];

/**
 * Alta de documento del expediente (PRD §10.2, §10.3).
 *
 * La clasificación **no se pide** cuando la clase la fija: una identificación
 * es dato personal sensible y un escrito judicial es privilegiado, siempre.
 * Ofrecerla como desplegable invitaría a marcar «interno» a lo que no lo es, y
 * la clasificación decide cuánto dura el pase de descarga y qué facultad hace
 * falta para abrirlo.
 */
export function AttachDocumentForm({ caseId }: { caseId: string }) {
  const [estado, accion, pendiente] = useActionState(attachDocumentAction, INICIAL);
  const [clase, setClase] = useState<CaseDocumentKind>('EVIDENCE');
  const errores = estado.fieldErrors ?? {};

  const fija = CLASIFICACION_MINIMA[clase];
  const seLePuedeEnsenar = SE_ENSENAN_A_LA_PERSONA.includes(clase);

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Agregado'} />}

      <input type="hidden" name="caseId" value={caseId} />

      <RadioGroup
        name="kind"
        legend="¿Qué clase de documento es?"
        help="De la clase dependen la reserva con que se guarda y quién puede abrirlo."
        options={CLASES.map((valor) => ({
          value: valor,
          label: NOMBRE_DE_DOCUMENTO[valor],
          hint: PARA_QUE_SIRVE[valor],
        }))}
        value={clase}
        onChange={(valor) => setClase(valor as CaseDocumentKind)}
        {...(errores['kind'] === undefined ? {} : { errors: errores['kind'] })}
      />

      {fija === null ? (
        <Select
          name="classification"
          label="¿Con qué reserva se guarda?"
          hint="Esta clase admite varias. Nada de un expediente se guarda como público."
          required
          options={[...RESERVAS]}
          {...(errores['classification'] === undefined ? {} : { errors: errores['classification'] })}
        />
      ) : (
        <Notice title="La clasificación la fija la clase" tone="neutral" live="status">
          <p>
            Un documento de esta clase se guarda siempre con la misma reserva. No se elige aquí porque de ella
            dependen cuánto dura el pase de descarga y qué facultad hace falta para abrirlo.
          </p>
        </Notice>
      )}

      <Field
        name="description"
        label="¿Qué es?"
        hint="Una frase que se entienda sin abrir el archivo."
        required
        {...(errores['description'] === undefined ? {} : { errors: errores['description'] })}
      />

      <Field
        name="file"
        type="file"
        label="Archivo"
        required
        {...(errores['file'] === undefined ? {} : { errors: errores['file'] })}
      />

      {seLePuedeEnsenar ? (
        <Checkbox
          name="visibleToPerson"
          label="Enseñárselo a la persona del expediente"
          help="Por omisión no. Marcarlo hace que lo vea desde su portal."
        />
      ) : (
        <Notice title="Esta clase no se le enseña a la persona" tone="neutral" live="status">
          <p>El trabajo interno del equipo no es el asunto de quien pidió ayuda: es cómo se discute su asunto.</p>
        </Notice>
      )}

      {clase === 'MEDICAL_OR_CLINICAL' && (
        <Notice title="Abrirlo exigirá autorización expresa" tone="warning" live="status">
          <p>
            Los diagnósticos y los datos clínicos se ocultan a quien no tiene la facultad de leerlos, y quien la
            tiene escribe por qué lo abre. Queda registrado con su nombre.
          </p>
        </Notice>
      )}

      <SubmitButton>{pendiente ? 'Agregando…' : 'Agregar el documento'}</SubmitButton>
    </form>
  );
}

/** Retirada de un documento, con su motivo. El archivo se conserva. */
export function RemoveDocumentForm({ documentId, descripcion }: { documentId: string; descripcion: string }) {
  const [estado, accion, pendiente] = useActionState(removeDocumentAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') {
    return <SuccessNotice title={estado.message ?? 'Retirado'} />;
  }

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="documentId" value={documentId} />
      <TextArea
        id={`retiro-${documentId}`}
        name="reason"
        label={`¿Por qué se retira «${descripcion}»?`}
        hint="El archivo no se borra: sigue guardado con su política de retención."
        required
        rows={2}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />
      <SubmitButton variant="secondary">{pendiente ? 'Retirando…' : 'Retirar del expediente'}</SubmitButton>
    </form>
  );
}

/**
 * Apertura de un documento clínico, con el motivo que el PRD §10.3 exige.
 *
 * Va por formulario y no por enlace porque el motivo se escribe: en una
 * dirección acabaría en el historial del navegador y en los registros de
 * cualquier intermediario.
 */
export function OpenClinicalDocumentForm({ fileObjectId }: { fileObjectId: string }) {
  const [estado, accion, pendiente] = useActionState(openClinicalDocumentAction, INICIAL);
  const [abierto, setAbierto] = useState(false);
  const errores = estado.fieldErrors ?? {};

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-sm underline underline-offset-4 text-[var(--color-ink-soft)]"
      >
        Abrir el documento clínico
      </button>
    );
  }

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="fileObjectId" value={fileObjectId} />
      <TextArea
        id={`clinico-${fileObjectId}`}
        name="reason"
        label="¿Por qué necesitas abrirlo?"
        hint="Queda registrado con tu nombre. Abrir el diagnóstico de alguien es un acto."
        required
        rows={2}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />
      <SubmitButton variant="secondary">{pendiente ? 'Abriendo…' : 'Abrir el documento'}</SubmitButton>
    </form>
  );
}
