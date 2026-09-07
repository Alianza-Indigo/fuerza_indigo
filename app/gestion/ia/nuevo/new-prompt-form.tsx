'use client';

import { useActionState } from 'react';
import { ErrorNotice, Field, Select, SubmitButton, TextArea, type Option } from '@/design-system/primitives';
import { createPromptAction, type PromptFormState } from '../actions';

const INICIAL: PromptFormState = { status: 'idle' };

const CRITICIDAD: Option[] = [
  { value: 'STANDARD', label: 'Estándar' },
  { value: 'CRITICAL', label: 'Crítico: su publicación es más delicada' },
];

export function NewPromptForm({ modelos }: { modelos: Option[] }) {
  const [estado, accion, pendiente] = useActionState(createPromptAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo crear'} />}

      <Field
        name="code"
        label="Código"
        required
        hint="Identificador estable. Minúsculas, números y . _ -. Por ejemplo: support.triage."
        errors={estado.fieldErrors?.['code']}
      />
      <TextArea
        name="purpose"
        label="Para qué sirve"
        required
        rows={2}
        maxLength={300}
        hint="Una frase que explique qué hace este prompt. Se lee en el listado."
        errors={estado.fieldErrors?.['purpose']}
      />
      <Field name="module" label="Módulo" required hint="El módulo al que sirve. Por ejemplo: support, cases." errors={estado.fieldErrors?.['module']} />
      <Select name="criticality" label="Criticidad" options={CRITICIDAD} defaultValue="STANDARD" errors={estado.fieldErrors?.['criticality']} />

      <TextArea
        name="systemText"
        label="Texto de sistema"
        required
        rows={8}
        hint="Lo que se le indica al modelo. No pongas aquí datos de personas: van por variables."
        errors={estado.fieldErrors?.['systemText']}
      />

      {modelos.length > 0 ? (
        <Select name="model" label="Modelo" required options={modelos} hint="Solo los modelos que el proveedor permite." errors={estado.fieldErrors?.['model']} />
      ) : (
        <Field
          name="model"
          label="Modelo"
          required
          hint="El proveedor todavía no tiene modelos permitidos configurados: escribe uno y ajústalo en la configuración."
          errors={estado.fieldErrors?.['model']}
        />
      )}

      <Field
        name="allowedVariables"
        label="Variables permitidas"
        hint="Separadas por comas. Lo que no esté aquí no se interpola en el texto. Por ejemplo: tramite, folio."
        errors={estado.fieldErrors?.['allowedVariables']}
      />

      <TextArea name="parameters" label="Parámetros" rows={3} defaultValue={'{\n  "temperature": 0.2\n}'} hint="Objeto JSON con los parámetros del modelo." errors={estado.fieldErrors?.['parameters']} />
      <TextArea name="outputSchema" label="Esquema de salida" rows={5} defaultValue={'{\n  "type": "object"\n}'} hint="Objeto JSON. La salida se valida contra él; lo que no encaje se rechaza." errors={estado.fieldErrors?.['outputSchema']} />
      <TextArea name="limits" label="Límites de la versión" rows={3} defaultValue={'{\n  "maxOutputTokens": 512\n}'} hint="Objeto JSON, por ejemplo el máximo de tokens de salida." errors={estado.fieldErrors?.['limits']} />

      <SubmitButton>{pendiente ? 'Creando…' : 'Crear borrador'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Creando el prompt' : ''}
      </p>
    </form>
  );
}
