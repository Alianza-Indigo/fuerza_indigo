'use client';

import { useActionState } from 'react';
import { Disclosure, ErrorNotice, Field, Select, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import { moveAssetAction, registerAssetAction, type PatrimonioState } from './actions';

const INICIAL: PatrimonioState = { status: 'idle' };

export interface Opcion {
  readonly id: string;
  readonly label: string;
}

const TIPOS = [
  { value: 'REAL_ESTATE', label: 'Inmueble' },
  { value: 'VEHICLE', label: 'Vehículo' },
  { value: 'EQUIPMENT', label: 'Equipo' },
  { value: 'FURNITURE', label: 'Mobiliario' },
  { value: 'BANK_ACCOUNT', label: 'Cuenta bancaria' },
  { value: 'INTANGIBLE', label: 'Intangible' },
  { value: 'OTHER', label: 'Otro' },
];

export function RegisterAssetForm({ entidades, hoy }: { entidades: readonly Opcion[]; hoy: string }) {
  const [estado, accion, pendiente] = useActionState(registerAssetAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Registrado'} />}

      <Select
        name="legalEntityId"
        label="¿De qué entidad es el bien?"
        required
        options={entidades.map((entidad) => ({ value: entidad.id, label: entidad.label }))}
        {...(entidades.length === 1 ? { defaultValue: entidades[0]?.id } : {})}
        {...(errores['legalEntityId'] === undefined ? {} : { errors: errores['legalEntityId'] })}
      />

      <Select
        name="assetKind"
        label="Tipo de bien"
        required
        options={TIPOS}
        {...(errores['assetKind'] === undefined ? {} : { errors: errores['assetKind'] })}
      />

      <Field
        name="name"
        label="Nombre"
        hint="Cómo se le llama. Por ejemplo: camioneta de la delegación de Jalisco."
        required
        {...(errores['name'] === undefined ? {} : { errors: errores['name'] })}
      />

      <TextArea
        name="description"
        label="Descripción"
        hint="Con detalle: marca, modelo, número de serie, ubicación exacta. Es lo que permite reconocer el bien dentro de diez años."
        required
        rows={4}
        maxLength={1000}
        {...(errores['description'] === undefined ? {} : { errors: errores['description'] })}
      />

      <Select
        name="acquisitionMode"
        label="¿Cómo llegó al patrimonio?"
        required
        options={[
          { value: 'PURCHASE', label: 'Compra' },
          { value: 'DONATION', label: 'Donación' },
          { value: 'TRANSFER', label: 'Traspaso' },
          { value: 'OTHER', label: 'Otro' },
        ]}
        {...(errores['acquisitionMode'] === undefined ? {} : { errors: errores['acquisitionMode'] })}
      />

      <Field
        name="acquiredOn"
        type="date"
        label="¿Cuándo se adquirió?"
        defaultValue={hoy}
        required
        {...(errores['acquiredOn'] === undefined ? {} : { errors: errores['acquiredOn'] })}
      />

      <Field
        name="documentedValue"
        label="Valor documentado"
        hint="En pesos y centavos, el que consta en la factura, el avalúo o el acta de donación."
        inputMode="numeric"
        required
        {...(errores['documentedValue'] === undefined ? {} : { errors: errores['documentedValue'] })}
      />

      <Select
        name="currency"
        label="Moneda"
        required
        defaultValue="MXN"
        options={[
          { value: 'MXN', label: 'Pesos mexicanos (MXN)' },
          { value: 'USD', label: 'Dólares estadounidenses (USD)' },
        ]}
      />

      <Field
        name="location"
        label="Ubicación (opcional)"
        hint="Dónde está físicamente."
        {...(errores['location'] === undefined ? {} : { errors: errores['location'] })}
      />

      <Field
        name="custodianPersonId"
        label="Identificador de quien lo custodia (opcional)"
        hint="El del registro maestro de la persona que responde por el bien."
        {...(errores['custodianPersonId'] === undefined ? {} : { errors: errores['custodianPersonId'] })}
      />

      <TextArea
        name="authorizingResolutionNote"
        label="Acuerdo que respalda el alta (opcional)"
        hint="Si el alta salió de un acuerdo, dilo: fecha, número de acta o resolución."
        rows={2}
        maxLength={400}
        {...(errores['authorizingResolutionNote'] === undefined
          ? {}
          : { errors: errores['authorizingResolutionNote'] })}
      />

      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar el bien'}</SubmitButton>
    </form>
  );
}

/**
 * Movimiento de un bien.
 *
 * El acuerdo y la evidencia se piden siempre, aunque solo algunos movimientos
 * los exijan. Un campo que aparece según lo que se elija no funcionaría sin
 * JavaScript, y el caso de uso rechaza igual el envío que le falte lo que su
 * movimiento necesita: la regla vive donde está probada.
 */
export function MoveAssetForm({ assetId, hoy }: { assetId: string; hoy: string }) {
  const [estado, accion, pendiente] = useActionState(moveAssetAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  return (
    <Disclosure summary="Registrar un movimiento de este bien">
      <form action={accion} className="space-y-6">
        <input type="hidden" name="assetId" value={assetId} />
        {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
        {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Registrado'} />}

        <Select
          name="movementKind"
          label="¿Qué pasó con el bien?"
          required
          options={[
            { value: 'REVALUED', label: 'Se revaluó' },
            { value: 'ASSIGNED', label: 'Se asignó a alguien' },
            { value: 'TRANSFERRED', label: 'Se transfirió' },
            { value: 'DISPOSED', label: 'Se dispuso de él' },
            { value: 'WRITTEN_OFF', label: 'Se dio de baja' },
          ]}
          {...(errores['movementKind'] === undefined ? {} : { errors: errores['movementKind'] })}
        />

        <Field
          name="occurredOn"
          type="date"
          label="¿Cuándo?"
          defaultValue={hoy}
          required
          {...(errores['occurredOn'] === undefined ? {} : { errors: errores['occurredOn'] })}
        />

        <Field
          name="amount"
          label="Importe (solo si se revaluó)"
          hint="El valor nuevo, en pesos y centavos."
          inputMode="numeric"
          {...(errores['amount'] === undefined ? {} : { errors: errores['amount'] })}
        />

        <Field
          name="toCustodianPersonId"
          label="Identificador de quien lo recibe"
          hint="Obligatorio si se transfiere o se asigna."
          {...(errores['toCustodianPersonId'] === undefined ? {} : { errors: errores['toCustodianPersonId'] })}
        />

        <TextArea
          name="authorizingResolutionNote"
          label="¿De qué acuerdo sale?"
          hint="Obligatorio para transferir, asignar, disponer o dar de baja. Fecha, número de acta o resolución."
          rows={2}
          maxLength={400}
          {...(errores['authorizingResolutionNote'] === undefined
            ? {}
            : { errors: errores['authorizingResolutionNote'] })}
        />

        <Field
          name="evidenceFileIds"
          label="Identificador del documento que lo respalda"
          hint="El del archivo ya subido: el acta, el convenio o el oficio. Obligatorio cuando hace falta acuerdo."
          {...(errores['evidenceFileIds'] === undefined ? {} : { errors: errores['evidenceFileIds'] })}
        />

        <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar el movimiento'}</SubmitButton>
      </form>
    </Disclosure>
  );
}
