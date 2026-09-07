'use client';

import { useActionState } from 'react';
import { Checkbox, ErrorNotice, Field, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import { configureProviderAction, type ProviderFormState } from '../actions';

const INICIAL: ProviderFormState = { status: 'idle' };

/**
 * Configuración del proveedor de IA.
 *
 * Los importes van en pesos —se guardan en centavos— y los límites en enteros.
 * La clave no está aquí y no se pide: la fila guarda el nombre de su variable de
 * entorno, que se enseña abajo pero no se edita desde una pantalla. Cambiar la
 * configuración exige un motivo, porque es un permiso crítico.
 */
export function ProviderForm({
  config,
}: {
  config: {
    defaultModel: string;
    allowedModels: readonly string[];
    maxTokensPerRequest: number;
    maxRequestsPerUserPerDay: number;
    maxMonthlyCostPesos: string;
    currency: string;
    trainingOptOut: boolean;
    isEnabled: boolean;
    apiKeyEnvVarName: string;
  };
}) {
  const [estado, accion, pendiente] = useActionState(configureProviderAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && estado.message !== undefined && <SuccessNotice title={estado.message} />}

      <Checkbox
        name="isEnabled"
        label="La IA está encendida"
        help="Apagarla no es una avería: la aplicación sigue en pie y todo cae al camino humano."
        defaultChecked={config.isEnabled}
      />

      <TextArea
        name="allowedModels"
        label="Modelos permitidos"
        hint="Uno por línea o separados por comas. Solo estos se pueden elegir al publicar un prompt."
        rows={3}
        defaultValue={config.allowedModels.join('\n')}
        {...(errores['allowedModels'] === undefined ? {} : { errors: errores['allowedModels'] })}
      />

      <Field
        name="defaultModel"
        label="Modelo por omisión"
        hint="Tiene que estar entre los permitidos."
        defaultValue={config.defaultModel}
        {...(errores['defaultModel'] === undefined ? {} : { errors: errores['defaultModel'] })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="maxTokensPerRequest"
          label="Máximo de tokens por petición"
          type="text"
          inputMode="numeric"
          defaultValue={String(config.maxTokensPerRequest)}
          {...(errores['maxTokensPerRequest'] === undefined ? {} : { errors: errores['maxTokensPerRequest'] })}
        />
        <Field
          name="maxRequestsPerUserPerDay"
          label="Máximo de peticiones por persona y día"
          type="text"
          inputMode="numeric"
          defaultValue={String(config.maxRequestsPerUserPerDay)}
          {...(errores['maxRequestsPerUserPerDay'] === undefined ? {} : { errors: errores['maxRequestsPerUserPerDay'] })}
        />
        <Field
          name="maxMonthlyCost"
          label="Techo de gasto mensual (pesos)"
          type="text"
          inputMode="numeric"
          hint="En pesos, con hasta dos decimales. Se corta al alcanzarlo."
          defaultValue={config.maxMonthlyCostPesos}
          {...(errores['maxMonthlyCost'] === undefined ? {} : { errors: errores['maxMonthlyCost'] })}
        />
        <Field
          name="currency"
          label="Moneda"
          defaultValue={config.currency}
          {...(errores['currency'] === undefined ? {} : { errors: errores['currency'] })}
        />
      </div>

      <Checkbox
        name="trainingOptOut"
        label="El proveedor no usa lo enviado para entrenar"
        help="Se guarda como hecho declarado, para poder responderlo sin depender de la memoria de quien configuró la cuenta."
        defaultChecked={config.trainingOptOut}
      />

      <p className="text-sm text-[var(--color-ink-soft)]">
        La clave se lee de la variable de entorno <code className="font-mono">{config.apiKeyEnvVarName}</code>. No se
        edita desde aquí: apuntar a otra variable es una decisión de despliegue.
      </p>

      <TextArea
        name="reason"
        label="¿Por qué cambias la configuración?"
        hint="Queda en la bitácora. Es un permiso crítico."
        required
        rows={2}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />

      <SubmitButton>{pendiente ? 'Guardando…' : 'Guardar la configuración'}</SubmitButton>
    </form>
  );
}
