'use client';

import { useActionState } from 'react';
import { Disclosure, ErrorNotice, Field, RadioGroup, Select, SubmitButton, TextArea } from '@/design-system/primitives';
import { createProductAction, type CatalogState } from './actions';

const INICIAL: CatalogState = { status: 'idle' };

/**
 * Alta de un concepto cobrable.
 *
 * No pide importe. Un concepto y su precio son dos actos distintos: el concepto
 * dice qué se cobra y el precio cuánto, y el cuánto se versiona con fecha. Pedir
 * las dos cosas en el mismo formulario sugeriría que el importe forma parte de
 * la definición del concepto, que es justo lo que este módulo no hace.
 *
 * Ningún campo aparece ni desaparece según lo que se elija. Se probó a mostrar
 * el acuerdo de asamblea solo al elegir una cuota extraordinaria, y sin
 * JavaScript el campo no llegaba a existir: quien lo necesitara no podría crear
 * la cuota nunca. Un formulario que solo funciona con JavaScript no es un
 * formulario más limpio, es uno que a veces no está.
 */

const TIPOS = [
  { value: 'ENROLLMENT_FEE', label: 'Cuota de inscripción', hint: 'Se paga una vez, al afiliarse.' },
  { value: 'UNION_DUE_ORDINARY', label: 'Cuota sindical ordinaria', hint: 'La cuota periódica de quien está afiliado.' },
  {
    value: 'UNION_DUE_EXTRAORDINARY',
    label: 'Cuota sindical extraordinaria',
    hint: 'La acuerda la asamblea para un fin concreto. Exige decir de qué acuerdo sale.',
  },
  {
    value: 'HONORARY_MEMBERSHIP',
    label: 'Membresía honoraria',
    hint: 'Para quien acompaña sin ser persona trabajadora afiliada.',
  },
  {
    value: 'SERVICE_SUBSCRIPTION',
    label: 'Suscripción a una herramienta',
    hint: 'Acceso periódico a un servicio de la plataforma.',
  },
  { value: 'COURSE', label: 'Curso o taller', hint: 'Una formación con inscripción.' },
  { value: 'CIAN_SERVICE', label: 'Servicio del CIAN', hint: 'Atención del Centro Integral de Atención Neurodivergente.' },
  { value: 'CENI_PROGRAM', label: 'Programa del CENI', hint: 'Un programa completo del Centro de Estudios.' },
  { value: 'CENI_ASSESSMENT', label: 'Evaluación del CENI', hint: 'Una valoración suelta, sin programa.' },
  { value: 'CENI_CERTIFICATION', label: 'Certificación del CENI', hint: 'La emisión de una constancia o un certificado.' },
  { value: 'RENEWAL', label: 'Renovación', hint: 'La continuidad de algo que ya se tenía.' },
  { value: 'DONATION', label: 'Donativo', hint: 'Una aportación voluntaria, sin contraprestación.' },
] as const;

const VINCULOS = [
  { value: 'NONE', label: 'Ninguno: solo se cobra' },
  { value: 'MEMBERSHIP', label: 'Afiliación sindical' },
  { value: 'HONORARY_AFFILIATION', label: 'Afiliación honoraria' },
  { value: 'TOOL_ACCESS', label: 'Acceso a una herramienta' },
  { value: 'CIAN_SERVICE', label: 'Servicio del CIAN' },
  { value: 'CENI_PROGRAM', label: 'Programa del CENI' },
  { value: 'EVENT_REGISTRATION', label: 'Inscripción a un evento' },
] as const;

export function ProductForm({ entidades }: { entidades: readonly { id: string; label: string }[] }) {
  const [estado, accion, pendiente] = useActionState(createProductAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}

      <Select
        name="legalEntityId"
        label="¿Qué entidad recibe este cobro?"
        hint="El dinero entra a la cuenta de esta entidad y su contabilidad es la que lo registra."
        required
        options={entidades.map((entidad) => ({ value: entidad.id, label: entidad.label }))}
        {...(entidades.length === 1 ? { defaultValue: entidades[0]?.id } : {})}
        {...(errores['legalEntityId'] === undefined ? {} : { errors: errores['legalEntityId'] })}
      />

      <Field
        name="code"
        label="Código"
        hint="En mayúsculas, sin espacios. Es lo que aparecerá en los reportes. Por ejemplo: CUOTA_ORDINARIA_2026."
        required
        {...(errores['code'] === undefined ? {} : { errors: errores['code'] })}
      />

      <Field
        name="name"
        label="Nombre"
        hint="Como lo va a leer quien paga."
        required
        {...(errores['name'] === undefined ? {} : { errors: errores['name'] })}
      />

      <TextArea
        name="description"
        label="Qué se cobra"
        hint="Explícalo con claridad: es lo que leerá la persona antes de pagar."
        required
        maxLength={600}
        {...(errores['description'] === undefined ? {} : { errors: errores['description'] })}
      />

      <Select
        name="kind"
        label="Tipo de concepto"
        hint="Determina cómo se agrupa en los reportes y qué exige para crearse."
        required
        options={TIPOS.map((opcion) => ({ value: opcion.value, label: opcion.label }))}
        {...(errores['kind'] === undefined ? {} : { errors: errores['kind'] })}
      />

      {/* Un `option` nativo no admite explicación, así que las explicaciones van
          fuera y todas a la vez: quien no conoce el vocabulario puede compararlas
          antes de elegir en vez de descubrirlas de una en una. */}
      <Disclosure summary="Qué significa cada tipo">
        <dl className="space-y-2">
          {TIPOS.map((opcion) => (
            <div key={opcion.value}>
              <dt className="font-medium">{opcion.label}</dt>
              <dd className="text-sm text-[var(--color-ink-soft)]">{opcion.hint}</dd>
            </div>
          ))}
        </dl>
      </Disclosure>

      <RadioGroup
        name="billingMode"
        legend="¿Cómo se cobra?"
        help="Un concepto que se paga una vez y uno que se cobra cada mes no son el mismo concepto."
        options={[
          { value: 'ONE_TIME', label: 'Una sola vez' },
          { value: 'RECURRING', label: 'Cada cierto tiempo', hint: 'La periodicidad se define al ponerle precio.' },
        ]}
        value="ONE_TIME"
        {...(errores['billingMode'] === undefined ? {} : { errors: errores['billingMode'] })}
      />

      <Select
        name="moduleBinding"
        label="¿Qué habilita pagarlo?"
        hint="Si al pagar se abre un acceso o una inscripción, dilo aquí."
        options={VINCULOS.map((opcion) => ({ value: opcion.value, label: opcion.label }))}
        defaultValue="NONE"
        {...(errores['moduleBinding'] === undefined ? {} : { errors: errores['moduleBinding'] })}
      />

      <Field
        name="gracePeriodDays"
        type="number"
        label="Días de gracia ante un cobro fallido (solo para conceptos recurrentes)"
        hint="Días que el derecho sigue vivo mientras el cobro se resuelve. Cero significa que se pierde en cuanto el cargo falla. Un concepto de pago único va en cero: no hay renovación que pueda fallar."
        inputMode="numeric"
        defaultValue="0"
        {...(errores['gracePeriodDays'] === undefined ? {} : { errors: errores['gracePeriodDays'] })}
      />

      <TextArea
        name="authorizingResolutionNote"
        label="¿De qué acuerdo sale? (solo para una cuota extraordinaria)"
        hint="Fecha de la asamblea y número de acta o de resolución. Una cuota extraordinaria sin esto no se crea; los demás tipos pueden dejarlo vacío."
        rows={3}
        maxLength={400}
        {...(errores['authorizingResolutionNote'] === undefined
          ? {}
          : { errors: errores['authorizingResolutionNote'] })}
      />

      <Field
        name="stripeProductId"
        label="Identificador en la pasarela (opcional)"
        hint="Si el concepto ya existe en la cuenta de cobro, pega aquí su identificador. Si no, déjalo vacío."
        {...(errores['stripeProductId'] === undefined ? {} : { errors: errores['stripeProductId'] })}
      />

      <SubmitButton>{pendiente ? 'Creando…' : 'Crear el concepto'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Creando el concepto' : ''}
      </p>
    </form>
  );
}
