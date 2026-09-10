'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import {
  Checkbox,
  ErrorNotice,
  Field,
  RadioGroup,
  Select,
  SuccessNotice,
  TextArea,
} from '@/design-system/primitives';
import { submitAffiliationRequestAction, type AffiliationRequestState } from './actions';

const INITIAL_STATE: AffiliationRequestState = { status: 'idle' };

type RegistrationCategory = 'UNION_MEMBER' | 'HONORARY_AFFILIATE' | 'PROTECTED_BENEFICIARY';

export function AffiliationRequestForm({ modality }: { modality: RegistrationCategory }) {
  const [state, action, pending] = useActionState(submitAffiliationRequestAction, INITIAL_STATE);
  const errors = state.fieldErrors ?? {};
  const unionMember = modality === 'UNION_MEMBER';
  const honoraryMember = modality === 'HONORARY_AFFILIATE';

  if (state.status === 'ok' && state.folio !== undefined) {
    return (
      <div className="space-y-5">
        <SuccessNotice title="Recibimos tu solicitud">
          <p>
            Tu folio es <strong className="font-mono text-lg">{state.folio}</strong>. Guárdalo para cualquier
            seguimiento.
          </p>
        </SuccessNotice>

        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-sunken)] p-5">
          <h2 className="font-bold">¿Qué sigue?</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--color-ink-soft)] marker:font-bold marker:text-[var(--color-accent)]">
            <li>Una persona de Fuerza Índigo revisará los datos que enviaste.</li>
            <li>Te escribiremos al correo indicado para verificar tu contacto.</li>
            <li>Recibirás acceso para completar y enviar el expediente formal.</li>
            <li>La Secretaría resolverá tu solicitud y te notificará la decisión.</li>
          </ol>
        </div>

        <p className="text-sm text-[var(--color-ink-soft)]">
          El folio confirma que recibimos la solicitud, pero todavía no acredita un registro. Si ya recibiste tu
          acceso, puedes{' '}
          <Link href="/acceso" className="font-semibold text-[var(--color-accent-ink)] underline underline-offset-4">
            entrar al portal
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-7">
      <input type="hidden" name="modality" value={modality} />

      {state.status === 'error' && state.message !== undefined && <ErrorNotice title={state.message} />}

      <fieldset className="space-y-4">
        <legend className="text-lg font-bold">Tus datos de identificación</legend>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Los usamos para identificar tu solicitud y continuar el trámite contigo.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="givenName"
            label="Nombre"
            required
            autoComplete="given-name"
            {...(errors['givenName'] === undefined ? {} : { errors: errors['givenName'] })}
          />
          <Field
            name="familyName"
            label="Primer apellido"
            required
            autoComplete="family-name"
            {...(errors['familyName'] === undefined ? {} : { errors: errors['familyName'] })}
          />
        </div>

        <Field
          name="secondFamilyName"
          label="Segundo apellido"
          hint="Opcional."
          autoComplete="additional-name"
          {...(errors['secondFamilyName'] === undefined ? {} : { errors: errors['secondFamilyName'] })}
        />

        <Field
          name="curp"
          label="CURP"
          hint="Escribe los 18 caracteres. Se usará únicamente para identificar tu expediente."
          required
          autoComplete="off"
          {...(errors['curp'] === undefined ? {} : { errors: errors['curp'] })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="email"
            label="Correo electrónico"
            hint="Aquí recibirás el seguimiento y el acceso al expediente."
            required
            type="email"
            inputMode="email"
            autoComplete="email"
            {...(errors['email'] === undefined ? {} : { errors: errors['email'] })}
          />
          <Field
            name="phone"
            label="Teléfono"
            hint="Opcional."
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            {...(errors['phone'] === undefined ? {} : { errors: errors['phone'] })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="territory"
            label="¿Desde dónde haces tu solicitud?"
            hint="Estado y municipio; no tu domicilio completo."
            required
            autoComplete="address-level1"
            {...(errors['territory'] === undefined ? {} : { errors: errors['territory'] })}
          />
          <Field
            name="occupation"
            label="Ocupación actual"
            hint="Por ejemplo: docente, estudiante, cuidadora o comerciante."
            required
            autoComplete="organization-title"
            {...(errors['occupation'] === undefined ? {} : { errors: errors['occupation'] })}
          />
        </div>
      </fieldset>

      <div className="h-px bg-[var(--color-line)]" />

      {unionMember ? (
        <fieldset className="space-y-5">
          <legend className="text-lg font-bold">Tu actividad laboral</legend>
          <p className="text-sm text-[var(--color-ink-soft)]">
            La afiliación sindical es para personas trabajadoras cuya actividad tiene contacto con personas
            neurodivergentes.
          </p>

          <Select
            name="workRelation"
            label="¿Cómo realizas tu trabajo?"
            required
            options={[
              { value: 'SUBORDINATE', label: 'Trabajo subordinado' },
              { value: 'INDEPENDENT', label: 'Trabajo independiente' },
            ]}
            {...(errors['workRelation'] === undefined ? {} : { errors: errors['workRelation'] })}
          />

          <TextArea
            name="neurodivergentConnection"
            label="¿Qué tipo de contacto tienes con personas neurodivergentes en tu trabajo?"
            hint="Puede ser contacto de cualquier índole. No pedimos diagnósticos."
            required
            rows={5}
            maxLength={2000}
            {...(errors['neurodivergentConnection'] === undefined
              ? {}
              : { errors: errors['neurodivergentConnection'] })}
          />

          <Checkbox
            name="ageConfirmed"
            label="Confirmo que tengo 15 años o más."
            required
            {...(errors['ageConfirmed'] === undefined ? {} : { errors: errors['ageConfirmed'] })}
          />
        </fieldset>
      ) : honoraryMember ? (
        <fieldset className="space-y-5">
          <legend className="text-lg font-bold">Tu contacto con la comunidad</legend>
          <p className="text-sm text-[var(--color-ink-soft)]">
            Esta categoría incluye médicos, terapeutas, docentes y otros profesionales o colaboradores. Tiene voz,
            pero no voto.
          </p>

          <TextArea
            name="neurodivergentConnection"
            label="¿Qué tipo de contacto tienes con personas neurodivergentes?"
            hint="Cuéntalo con tus palabras. Puede ser contacto de cualquier índole."
            required
            rows={5}
            maxLength={2000}
            {...(errors['neurodivergentConnection'] === undefined
              ? {}
              : { errors: errors['neurodivergentConnection'] })}
          />

          <TextArea
            name="context"
            label="¿Cómo te gustaría colaborar con Fuerza Índigo?"
            hint="Opcional. Puedes contarnos qué te interesa aportar o en qué deseas participar."
            rows={4}
            maxLength={2000}
            {...(errors['context'] === undefined ? {} : { errors: errors['context'] })}
          />
        </fieldset>
      ) : (
        <fieldset className="space-y-5">
          <legend className="text-lg font-bold">Tu vínculo con la comunidad protegida</legend>
          <RadioGroup
            name="protectedProfile"
            legend="¿Desde qué perfil solicitas tu registro?"
            help="Los beneficiarios protegidos no tienen voz ni voto y nunca pagan cuota."
            options={[
              {
                value: 'NEURODIVERGENT_PERSON',
                label: 'Soy una persona neurodivergente',
                hint: 'No necesitas compartir diagnóstico ni documentación médica aquí.',
              },
              { value: 'FAMILY_MEMBER', label: 'Soy familiar de una persona neurodivergente' },
              { value: 'CAREGIVER', label: 'Soy una persona cuidadora' },
            ]}
            {...(errors['protectedProfile'] === undefined ? {} : { errors: errors['protectedProfile'] })}
          />

          <TextArea
            name="context"
            label="¿Qué ayuda o protección te gustaría recibir?"
            hint="Opcional. Puedes enviar tu registro aunque todavía no necesites atención."
            rows={4}
            maxLength={2000}
            {...(errors['context'] === undefined ? {} : { errors: errors['context'] })}
          />
        </fieldset>
      )}

      <div className="h-px bg-[var(--color-line)]" />

      <Checkbox
        name="acceptedPrivacyNotice"
        required
        label={
          <>
            Leí y acepto el{' '}
            <Link href="/legales/privacidad" target="_blank" className="font-semibold underline underline-offset-4">
              aviso de privacidad
            </Link>
            .
          </>
        }
        help="Guardaremos la versión del aviso que aceptaste junto con la fecha de tu solicitud."
        {...(errors['acceptedPrivacyNotice'] === undefined ? {} : { errors: errors['acceptedPrivacyNotice'] })}
      />

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--color-accent)] px-5 py-2.5 font-medium text-[var(--color-ink-inverse)] shadow-[var(--shadow-subtle)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-wait disabled:opacity-65"
        >
          {pending
            ? 'Enviando solicitud…'
            : unionMember
              ? 'Enviar solicitud como agremiado'
              : honoraryMember
                ? 'Enviar solicitud como agremiado honorario'
                : 'Enviar solicitud como beneficiario protegido'}
        </button>
        <p className="mt-3 text-center text-xs text-[var(--color-ink-soft)]">
          Enviar esta forma no completa automáticamente el registro. Toda solicitud tiene revisión humana.
        </p>
      </div>
    </form>
  );
}
