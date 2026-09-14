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
    const formalApplication = state.destination === 'APPLICATION';
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
          {formalApplication ? (
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--color-ink-soft)] marker:font-bold marker:text-[var(--color-accent)]">
              <li>Tu expediente ya está en la bandeja de Solicitudes de afiliación.</li>
              <li>Una persona de Fuerza Índigo revisará los datos que enviaste.</li>
              <li>La Secretaría podrá pedirte información adicional antes de resolver.</li>
              <li>Te notificaremos la decisión al correo indicado.</li>
            </ol>
          ) : (
            <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
              Tu registro ya está en el padrón de beneficiarios protegidos para que el equipo pueda darle seguimiento.
            </p>
          )}
        </div>

        <p className="text-sm text-[var(--color-ink-soft)]">
          {formalApplication
            ? 'El folio acredita la recepción del expediente, no la aprobación de la afiliación. '
            : 'El folio identifica tu registro protegido. '}
          Si ya tienes acceso, puedes{' '}
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

        <Field
          name="promoterReference"
          label="Promotor que te afilió"
          hint="Opcional. Escribe su número de agremiado o nombre completo. Déjalo vacío si llegaste por tu cuenta."
          autoComplete="off"
          {...(errors['promoterReference'] === undefined ? {} : { errors: errors['promoterReference'] })}
        />
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

          <Select
            name="otherUnionMembership"
            label="¿Actualmente perteneces a otro sindicato?"
            required
            options={[
              { value: 'NONE', label: 'No pertenezco a otro sindicato' },
              { value: 'SAME_TRADE', label: 'Sí, del mismo gremio o actividad' },
              { value: 'DIFFERENT_TRADE', label: 'Sí, de otro gremio o actividad' },
            ]}
            {...(errors['otherUnionMembership'] === undefined
              ? {}
              : { errors: errors['otherUnionMembership'] })}
          />

          <TextArea
            name="otherUnionClarification"
            label="Si respondiste que sí, explica brevemente"
            hint="Escribe el nombre del sindicato y la situación actual. Déjalo vacío si respondiste que no."
            rows={3}
            maxLength={2000}
            {...(errors['otherUnionClarification'] === undefined
              ? {}
              : { errors: errors['otherUnionClarification'] })}
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

      {(unionMember || honoraryMember) && (
        <Checkbox
          name="acceptsStatutes"
          required
          label="Acepto los estatutos vigentes y declaro que la información proporcionada es verdadera."
          help="La versión vigente aceptada quedará registrada en tu expediente."
          {...(errors['acceptsStatutes'] === undefined ? {} : { errors: errors['acceptsStatutes'] })}
        />
      )}

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
          {unionMember || honoraryMember
            ? 'Tu solicitud se registrará directamente para revisión. La afiliación no se activa hasta que sea aprobada.'
            : 'El registro protegido no concede voz ni voto y nunca genera cuota.'}
        </p>
      </div>
    </form>
  );
}
