'use client';

import { useActionState } from 'react';
import type { NotificationCategory } from '@prisma-client/enums';
import { ErrorNotice, Field, Notice, Select, SubmitButton, TextArea } from '@/design-system/primitives';
import { CLASE } from '../etiquetas';
import { draftTemplateAction, type PlantillaState } from '../actions';

// Las clases salen de las etiquetas locales, no del módulo: importar un valor
// del módulo de notificaciones a un componente de cliente arrastraría su código
// de servidor (Prisma, la base) al paquete del navegador. `CLASE` las tiene
// todas, en orden, y solo depende de tipos.
const CLASES = Object.keys(CLASE) as NotificationCategory[];

const INICIAL: PlantillaState = { status: 'idle' };

/**
 * Redacción de una plantilla de aviso.
 *
 * El canal es el correo y el idioma es es-MX: son los que hoy envían de verdad.
 * Otros canales llegan con su entrega (la web, en el bloque siguiente), y hasta
 * entonces una plantilla suya sería texto que nada usa. Van fijos y a la vista,
 * no ocultos, para que quien redacta sepa para qué está escribiendo.
 */
export function NewTemplateForm() {
  const [estado, accion] = useActionState(draftTemplateAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo guardar'} />}

      <input type="hidden" name="channel" value="EMAIL" />
      <input type="hidden" name="locale" value="es-MX" />
      <Notice tone="neutral" title="Canal: correo electrónico · Idioma: es-MX">
        <p>Es lo que hoy se envía. Cada plantilla se versiona por su código, y publicar retira la versión anterior.</p>
      </Notice>

      <Field
        name="code"
        label="Código"
        hint="Mayúsculas, números y guiones bajos. Por ejemplo: EVENTO_INSCRIPCION."
        required
        defaultValue={estado.values?.['code']}
        errors={estado.fieldErrors?.['code']}
      />

      <Select
        name="category"
        label="Clase de aviso"
        hint="Decide si la persona puede silenciarlo. La obligatoria de gobierno no se puede silenciar."
        required
        defaultValue={estado.values?.['category']}
        options={CLASES.map((category) => ({ value: category, label: CLASE[category] }))}
        errors={estado.fieldErrors?.['category']}
      />

      <Field
        name="subject"
        label="Asunto"
        hint="Puede llevar variables entre llaves dobles: {{givenName}}."
        defaultValue={estado.values?.['subject']}
        errors={estado.fieldErrors?.['subject']}
      />

      <TextArea
        name="bodyTemplate"
        label="Cuerpo"
        rows={8}
        required
        hint="El texto del aviso. Las variables van entre llaves dobles: {{activationUrl}}."
        defaultValue={estado.values?.['bodyTemplate']}
        errors={estado.fieldErrors?.['bodyTemplate']}
      />

      <Field
        name="variables"
        label="Variables declaradas"
        hint="Los nombres que el cuerpo usa, separados por coma o espacio. Al publicar se comprueba que coincidan con las del texto."
        defaultValue={estado.values?.['variables']}
        errors={estado.fieldErrors?.['variables']}
      />

      <SubmitButton>Guardar borrador</SubmitButton>
    </form>
  );
}
