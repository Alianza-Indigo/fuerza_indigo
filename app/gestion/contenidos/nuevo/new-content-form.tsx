'use client';

import { useActionState } from 'react';
import {
  ErrorNotice,
  Field,
  Select,
  SubmitButton,
  TextArea,
  type Option,
} from '@/design-system/primitives';
import { createPageAction, type EditorialState } from '../actions';

const INICIAL: EditorialState = { status: 'idle' };

const TIPOS: Option[] = [
  { value: 'PAGE', label: 'Página institucional' },
  { value: 'NEWS', label: 'Noticia' },
  { value: 'STATEMENT', label: 'Comunicado' },
  { value: 'CALL_FOR_APPLICATIONS', label: 'Convocatoria' },
  { value: 'FAQ', label: 'Pregunta frecuente' },
  { value: 'RESOURCE', label: 'Recurso descargable' },
  { value: 'DELEGATION_PROFILE', label: 'Perfil de delegación' },
  { value: 'LEGAL', label: 'Página legal' },
  { value: 'BANNER', label: 'Aviso destacado' },
  { value: 'PROTOCOL', label: 'Protocolo' },
];

const ACCESOS: Option[] = [
  { value: 'PUBLIC', label: 'Público: cualquier persona' },
  { value: 'MEMBERS', label: 'Agremiadas: solo con sesión iniciada' },
  { value: 'INTERNAL', label: 'Interno: solo dentro de la plataforma' },
];

export function NewContentForm({ entidades, territorios }: { entidades: Option[]; territorios: Option[] }) {
  const [estado, accion, pendiente] = useActionState(createPageAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo crear'} />}

      <Field
        name="title"
        label="Título"
        required
        hint="Es lo que se lee como encabezado de la página y en los listados."
        errors={estado.fieldErrors?.['title']}
      />

      <Field
        name="slug"
        label="Dirección en el sitio"
        required
        hint="Solo minúsculas, números y guiones. Por ejemplo: sindicato-y-derechos."
        errors={estado.fieldErrors?.['slug']}
      />

      <Select
        name="kind"
        label="Tipo de contenido"
        required
        options={TIPOS}
        hint="Determina en qué listados aparece."
        errors={estado.fieldErrors?.['kind']}
      />

      <TextArea
        name="summary"
        label="Resumen"
        required
        rows={3}
        maxLength={400}
        hint="Lo que se lee en los listados y lo que se comparte en redes. Hasta 400 caracteres."
        errors={estado.fieldErrors?.['summary']}
      />

      <TextArea
        name="bodyMarkdown"
        label="Contenido"
        required
        rows={14}
        hint="Se escribe en Markdown. Usa ## para los subtítulos y - para las listas."
        errors={estado.fieldErrors?.['bodyMarkdown']}
      />

      <Select
        name="legalEntityId"
        label="Entidad jurídica"
        options={entidades}
        placeholder="Sin acotar a una entidad"
        hint="Déjalo en blanco si el contenido es del ecosistema y no de una sola entidad."
        errors={estado.fieldErrors?.['legalEntityId']}
      />

      <Select
        name="territorialUnitId"
        label="Unidad territorial"
        options={territorios}
        placeholder="Sin acotar a un territorio"
        hint="Solo para perfiles de delegación y contenidos de una zona concreta."
        errors={estado.fieldErrors?.['territorialUnitId']}
      />

      <Select
        name="accessLevel"
        label="Quién puede verlo"
        options={ACCESOS}
        defaultValue="PUBLIC"
        placeholder="Público: cualquier persona"
        errors={estado.fieldErrors?.['accessLevel']}
      />

      <SubmitButton>{pendiente ? 'Creando…' : 'Crear borrador'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Creando el contenido' : ''}
      </p>
    </form>
  );
}
