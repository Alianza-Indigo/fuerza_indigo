'use client';

import { useActionState, useId, useState } from 'react';
import Link from 'next/link';
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
import type { SupportRequestType } from '@prisma-client/enums';
import { REQUEST_TYPE_LABELS } from './labels';
import { submitRequestAction, type RequestState } from './actions';

const INICIAL: RequestState = { status: 'idle' };

/** Orden en que se ofrecen los asuntos. El general primero en contacto. */
const ORDEN_CONTACTO: readonly SupportRequestType[] = [
  'GENERAL_CONTACT',
  'ACCESSIBILITY',
  'TRAINING_OR_INSTITUTIONAL_SUPPORT',
  'OTHER',
];

/** En «solicitar apoyo» se ofrecen los tipos de la entrada única del PRD §10.1. */
const ORDEN_APOYO: readonly SupportRequestType[] = [
  'INDIVIDUAL_LABOR_DISPUTE',
  'COLLECTIVE_DISPUTE',
  'DISCRIMINATION_OR_ADJUSTMENTS',
  'PSYCHOSOCIAL_RISK',
  'VIOLENCE_OR_URGENCY',
  'EDUCATION_ACCESS',
  'HEALTH_ACCESS',
  'ACCESSIBILITY',
  'FAMILY_GUIDANCE',
  'CIAN_ATTENTION',
  'TRAINING_OR_INSTITUTIONAL_SUPPORT',
  'OTHER',
];

/**
 * Formulario de la entrada pública (F2-UI-010, PRD §10.1).
 *
 * Un `<form>` con `action`: funciona sin JavaScript. Lo que JavaScript añade es
 * el aviso de urgencia en cuanto se elige ese asunto, y nada más: sin él el
 * aviso sigue estando en la página, arriba, donde se lee igual.
 *
 * Las preguntas son de información, no técnicas ni jurídicas: nadie tiene que
 * saber si lo suyo es un «conflicto colectivo» para pedir ayuda.
 */
export function RequestForm({ modo }: { modo: 'contacto' | 'apoyo' }) {
  const [estado, accion, pendiente] = useActionState(submitRequestAction, INICIAL);
  const [asunto, setAsunto] = useState<SupportRequestType>(modo === 'apoyo' ? 'INDIVIDUAL_LABOR_DISPUTE' : 'GENERAL_CONTACT');
  const idUrgencia = useId();

  const tipos = modo === 'apoyo' ? ORDEN_APOYO : ORDEN_CONTACTO;
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok' && estado.folio !== undefined) {
    return (
      <div className="space-y-4">
        <SuccessNotice title="Recibimos tu mensaje">
          <p>
            Tu folio es <strong className="font-mono">{estado.folio}</strong>. Guárdalo: sirve para referirte a este
            mensaje cuando hablemos.
          </p>
          <p className="mt-2">
            Si dejaste un correo, te mandamos ahí el acuse. Una persona va a leerlo y te contestará por el medio que
            pediste.
          </p>
        </SuccessNotice>
        <Notice title="Esto todavía no es una respuesta" tone="neutral" live="none">
          <p>
            El acuse confirma que llegó, no que ya lo revisamos. Si tu situación es una urgencia y necesitas ayuda
            ahora, llama al 911.
          </p>
        </Notice>
      </div>
    );
  }

  return (
    <form action={accion} className="space-y-8">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}

      <RadioGroup
        name="requestType"
        legend="¿De qué se trata?"
        help="Elige lo que más se parezca. Si no encaja del todo, elige «Otro asunto» y cuéntanoslo."
        options={tipos.map((tipo) => ({
          value: tipo,
          label: REQUEST_TYPE_LABELS[tipo].label,
          hint: REQUEST_TYPE_LABELS[tipo].help,
        }))}
        value={asunto}
        onChange={(valor) => setAsunto(valor as SupportRequestType)}
        {...(errores['requestType'] === undefined ? {} : { errors: errores['requestType'] })}
      />

      {asunto === 'VIOLENCE_OR_URGENCY' && (
        <div id={idUrgencia}>
          <Notice title="Si estás en peligro ahora mismo, llama al 911" tone="danger">
            <p>
              Este formulario no es un canal de urgencias y no está atendido las veinticuatro horas. El 911 sí lo está,
              en todo México y sin costo.
            </p>
            <p className="mt-2">
              Puedes mandarnos tu mensaje igualmente: lo leeremos y te acompañaremos en lo que sigue.
            </p>
          </Notice>
        </div>
      )}

      <Select
        name="legalEntity"
        label="¿A quién le escribes?"
        hint="Fuerza Índigo es el sindicato. Alianza Índigo es la asociación civil. Si no sabes cuál, elige la que más se acerque: nosotras lo canalizamos."
        required
        defaultValue={modo === 'apoyo' ? 'ALIANZA_INDIGO' : 'FUERZA_INDIGO'}
        options={[
          { value: 'FUERZA_INDIGO', label: 'Fuerza Índigo — sindicato' },
          { value: 'ALIANZA_INDIGO', label: 'Alianza Índigo — asociación civil' },
        ]}
        {...(errores['legalEntity'] === undefined ? {} : { errors: errores['legalEntity'] })}
      />

      <Field
        name="contactName"
        label="¿Cómo quieres que te llamemos?"
        hint="No hace falta tu nombre legal. Con el nombre que uses basta."
        required
        autoComplete="nickname"
        {...(errores['contactName'] === undefined ? {} : { errors: errores['contactName'] })}
      />

      <RadioGroup
        name="preferredChannel"
        legend="¿Por dónde prefieres que te contestemos?"
        options={[
          { value: 'EMAIL', label: 'Por correo' },
          { value: 'PHONE', label: 'Por teléfono' },
        ]}
        value="EMAIL"
        {...(errores['preferredChannel'] === undefined ? {} : { errors: errores['preferredChannel'] })}
      />

      <Field
        name="contactEmail"
        label="Tu correo"
        type="email"
        inputMode="email"
        autoComplete="email"
        hint="Si lo dejas, te mandamos el acuse con tu folio."
        {...(errores['contactEmail'] === undefined ? {} : { errors: errores['contactEmail'] })}
      />

      <Field
        name="contactPhone"
        label="Tu teléfono"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        hint="Opcional si dejaste correo. Obligatorio si pediste que te llamemos."
        {...(errores['contactPhone'] === undefined ? {} : { errors: errores['contactPhone'] })}
      />

      <Field
        name="territoryHint"
        label="¿Desde dónde escribes?"
        hint="Estado, municipio o colonia. Nos sirve para pasarle tu mensaje a quien esté más cerca."
        {...(errores['territoryHint'] === undefined ? {} : { errors: errores['territoryHint'] })}
      />

      <Field
        name="subject"
        label="En una línea, ¿qué pasa?"
        required
        {...(errores['subject'] === undefined ? {} : { errors: errores['subject'] })}
      />

      <TextArea
        name="narrative"
        label="Cuéntanos con tus palabras"
        hint="No necesitas términos técnicos ni jurídicos. Di qué pasó, cuándo y qué necesitas. Lo que escribas se guarda tal cual y nadie lo edita."
        required
        rows={8}
        maxLength={8000}
        {...(errores['narrative'] === undefined ? {} : { errors: errores['narrative'] })}
      />

      <Checkbox
        name="acceptedPrivacyNotice"
        required
        label={
          <>
            He leído el{' '}
            <Link href="/legales/privacidad" className="underline underline-offset-4">
              aviso de privacidad
            </Link>{' '}
            y acepto que guarden estos datos para contestarme.
          </>
        }
        help="Guardamos la versión exacta del aviso que aceptaste, con la fecha."
        {...(errores['acceptedPrivacyNotice'] === undefined ? {} : { errors: errores['acceptedPrivacyNotice'] })}
      />

      <SubmitButton>{pendiente ? 'Enviando…' : 'Enviar mi mensaje'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Enviando el mensaje' : ''}
      </p>
    </form>
  );
}
