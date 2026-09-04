'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Notice, SuccessNotice, ErrorNotice, type Option } from '@/design-system/primitives';
import { Stepper, type Step } from '@/design-system/stepper';
import { submitApplicationAction, type AfiliacionFormState } from '../actions';

/**
 * Solicitud de afiliación por pasos (PRD §8.1 pasos 3 a 8, §8.2 pasos 1 a 4).
 *
 * El borrador vive en el navegador y no viaja al servidor hasta que se envía: un
 * trámite a medias contiene datos que la persona todavía no decidió compartir.
 * Al enviar va todo junto, y lo que llega queda congelado en el resumen
 * inmutable de la solicitud.
 *
 * **Quien elige afiliación honoraria no ve los campos laborales.** No los ve
 * deshabilitados ni marcados como opcionales: no los ve. Una persona
 * neurodivergente, un familiar o una persona cuidadora no tiene que justificar
 * un vínculo laboral con la neurodivergencia, y preguntárselo convierte un
 * trámite de pertenencia en un interrogatorio improcedente.
 */

const CAMPO =
  'min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-base';

function Campo({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {hint !== undefined && (
        <p id={`${id}-ayuda`} className="text-sm text-[var(--color-ink-soft)]">
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

export function ApplicationStepper({
  categoria,
  membershipTypeId,
  membershipTypeName,
  especialidades,
  territorios,
}: {
  categoria: 'UNION_MEMBER' | 'HONORARY_AFFILIATE';
  membershipTypeId: string;
  membershipTypeName: string;
  especialidades: readonly Option[];
  territorios: readonly Option[];
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<AfiliacionFormState>({ status: 'idle' });
  const [, empezar] = useTransition();

  const sindical = categoria === 'UNION_MEMBER';

  const pasoTerritorio: Step = {
    id: 'territorio',
    title: 'Dónde vives',
    summary: 'Nos dice qué delegación te corresponde. Puedes dejarlo en blanco si no lo sabes.',
    minutes: 1,
    render: ({ draft, set }) => (
      <Campo id="territorialUnitId" label="Unidad territorial" hint="Opcional.">
        <select
          id="territorialUnitId"
          className={CAMPO}
          value={draft['territorialUnitId'] ?? ''}
          onChange={(evento) => set('territorialUnitId', evento.target.value)}
          aria-describedby="territorialUnitId-ayuda"
        >
          <option value="">No lo sé todavía</option>
          {territorios.map((territorio) => (
            <option key={territorio.value} value={territorio.value}>
              {territorio.label}
            </option>
          ))}
        </select>
      </Campo>
    ),
  };

  const pasosSindicales: Step[] = [
    {
      id: 'actividad',
      title: 'A qué te dedicas',
      summary: 'Tu oficio, profesión o disciplina, y la forma en que trabajas.',
      minutes: 2,
      validate: (draft) => {
        const problemas: Record<string, string[]> = {};
        if ((draft['occupationSpecialtyId'] ?? '') === '') {
          problemas['occupationSpecialtyId'] = ['Elige tu oficio, profesión o disciplina.'];
        }
        if ((draft['workRelationKind'] ?? '') === '') {
          problemas['workRelationKind'] = ['Di cómo trabajas.'];
        }
        return problemas;
      },
      render: ({ draft, set }) => (
        <>
          <Campo id="occupationSpecialtyId" label="Oficio, profesión o disciplina">
            <select
              id="occupationSpecialtyId"
              className={CAMPO}
              value={draft['occupationSpecialtyId'] ?? ''}
              onChange={(evento) => set('occupationSpecialtyId', evento.target.value)}
            >
              <option value="">Elige una opción</option>
              {especialidades.map((especialidad) => (
                <option key={especialidad.value} value={especialidad.value}>
                  {especialidad.label}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="workRelationKind" label="Cómo trabajas">
            <select
              id="workRelationKind"
              className={CAMPO}
              value={draft['workRelationKind'] ?? ''}
              onChange={(evento) => set('workRelationKind', evento.target.value)}
            >
              <option value="">Elige una opción</option>
              <option value="SUBORDINATE">Por cuenta ajena, con patrón</option>
              <option value="INDEPENDENT">De forma independiente</option>
              <option value="AUTONOMOUS">De forma autónoma</option>
              <option value="SELF_EMPLOYED">Por cuenta propia</option>
            </select>
          </Campo>
        </>
      ),
    },
    {
      id: 'vinculo',
      title: 'Tu contacto con personas neurodivergentes',
      summary: 'Cuéntanos con tus palabras cómo tu actividad te pone en contacto con personas neurodivergentes.',
      minutes: 3,
      validate: (draft) =>
        (draft['neurodivergentContactStatement'] ?? '').trim().length < 30
          ? { neurodivergentContactStatement: ['Con treinta caracteres basta para empezar.'] }
          : {},
      render: ({ draft, set }) => (
        <Campo
          id="neurodivergentContactStatement"
          label="Cómo se relaciona tu actividad con personas neurodivergentes"
          hint="No hay respuesta correcta. Cuenta lo que haces y con quién."
        >
          <textarea
            id="neurodivergentContactStatement"
            rows={6}
            className={`${CAMPO} min-h-32`}
            value={draft['neurodivergentContactStatement'] ?? ''}
            onChange={(evento) => set('neurodivergentContactStatement', evento.target.value)}
            aria-describedby="neurodivergentContactStatement-ayuda"
          />
        </Campo>
      ),
    },
    {
      id: 'otro-sindicato',
      title: 'Otro sindicato',
      summary: 'La ley obliga a declarar si perteneces a otro sindicato del mismo gremio.',
      minutes: 2,
      validate: (draft) => {
        const respuesta = draft['otherUnionMembership'] ?? '';
        if (respuesta === '') return { otherUnionMembership: ['Contesta la pregunta.'] };
        if (respuesta !== 'NONE' && (draft['otherUnionClarification'] ?? '').trim().length < 20) {
          return { otherUnionClarification: ['Explica tu situación. Con veinte caracteres basta.'] };
        }
        return {};
      },
      render: ({ draft, set }) => (
        <>
          <Campo id="otherUnionMembership" label="¿Perteneces a otro sindicato?">
            <select
              id="otherUnionMembership"
              className={CAMPO}
              value={draft['otherUnionMembership'] ?? ''}
              onChange={(evento) => set('otherUnionMembership', evento.target.value)}
            >
              <option value="">Elige una opción</option>
              <option value="NONE">No pertenezco a ningún otro sindicato</option>
              <option value="SAME_TRADE">Sí, de mi mismo gremio</option>
              <option value="DIFFERENT_TRADE">Sí, de otro gremio</option>
            </select>
          </Campo>
          {(draft['otherUnionMembership'] ?? '') !== '' && (draft['otherUnionMembership'] ?? '') !== 'NONE' && (
            <Campo
              id="otherUnionClarification"
              label="Aclara tu situación"
              hint="Qué sindicato, desde cuándo y si sigues afiliada. No es un impedimento automático; es un dato que hace falta para resolver."
            >
              <textarea
                id="otherUnionClarification"
                rows={4}
                className={`${CAMPO} min-h-24`}
                value={draft['otherUnionClarification'] ?? ''}
                onChange={(evento) => set('otherUnionClarification', evento.target.value)}
                aria-describedby="otherUnionClarification-ayuda"
              />
            </Campo>
          )}
        </>
      ),
    },
  ];

  const pasosHonorarios: Step[] = [
    {
      id: 'perfil',
      title: 'Desde qué perfil te afilias',
      summary: 'Elige el que mejor te describa. Puedes cambiarlo antes de enviar.',
      minutes: 1,
      validate: (draft) =>
        (draft['honoraryProfile'] ?? '') === '' ? { honoraryProfile: ['Elige un perfil.'] } : {},
      render: ({ draft, set }) => (
        <fieldset className="space-y-3">
          <legend className="sr-only">Perfil de afiliación honoraria</legend>
          {[
            { valor: 'NEURODIVERGENT_PERSON', etiqueta: 'Soy persona neurodivergente' },
            { valor: 'FAMILY_MEMBER', etiqueta: 'Soy familiar de una persona neurodivergente' },
            { valor: 'CAREGIVER', etiqueta: 'Soy persona cuidadora' },
          ].map((opcion) => (
            <label
              key={opcion.valor}
              className="flex items-start gap-3 rounded-lg border border-[var(--color-line-strong)] p-3"
            >
              <input
                type="radio"
                name="honoraryProfile"
                value={opcion.valor}
                className="mt-1 size-5"
                checked={(draft['honoraryProfile'] ?? '') === opcion.valor}
                onChange={() => set('honoraryProfile', opcion.valor)}
              />
              <span>{opcion.etiqueta}</span>
            </label>
          ))}
        </fieldset>
      ),
    },
    {
      id: 'contexto',
      title: 'Algo que quieras contarnos',
      summary: 'Opcional. Si prefieres no escribir nada, sigue adelante.',
      minutes: 2,
      render: ({ draft, set }) => (
        <Campo
          id="neurodivergentContactStatement"
          label="Lo que quieras contarnos"
          hint="Opcional. No hace falta justificar nada para afiliarte de forma honoraria."
        >
          <textarea
            id="neurodivergentContactStatement"
            rows={5}
            className={`${CAMPO} min-h-28`}
            value={draft['neurodivergentContactStatement'] ?? ''}
            onChange={(evento) => set('neurodivergentContactStatement', evento.target.value)}
            aria-describedby="neurodivergentContactStatement-ayuda"
          />
        </Campo>
      ),
    },
  ];

  const pasoAceptacion: Step = {
    id: 'aceptacion',
    title: 'Estatutos y avisos',
    summary: 'Lo último antes del resumen.',
    minutes: 2,
    validate: (draft) =>
      draft['acceptsStatutes'] !== 'si'
        ? { acceptsStatutes: ['Tienes que aceptar para poder enviar la solicitud.'] }
        : {},
    render: ({ draft, set }) => (
      <label className="flex items-start gap-3 rounded-lg border border-[var(--color-line-strong)] p-3">
        <input
          type="checkbox"
          className="mt-1 size-5"
          checked={draft['acceptsStatutes'] === 'si'}
          onChange={(evento) => set('acceptsStatutes', evento.target.checked ? 'si' : '')}
        />
        <span className="text-sm">
          Acepto los estatutos vigentes, los avisos de privacidad y las obligaciones y declaraciones que
          correspondan a la calidad de <strong>{membershipTypeName}</strong>. Sé que lo que envío queda
          registrado tal como lo envío.
        </span>
      </label>
    ),
  };

  const pasos = [...(sindical ? pasosSindicales : pasosHonorarios), pasoTerritorio, pasoAceptacion];

  if (estado.status === 'ok') {
    return (
      <SuccessNotice title={estado.message ?? 'Solicitud enviada'}>
        <p className="mt-2">
          <button
            type="button"
            onClick={() => router.push('/mi/afiliacion')}
            className="min-h-11 rounded-lg border border-[var(--color-line-strong)] px-4 font-medium"
          >
            Ver mis solicitudes
          </button>
        </p>
      </SuccessNotice>
    );
  }

  return (
    <div className="space-y-5">
      {estado.status === 'error' && (
        <ErrorNotice title={estado.message ?? 'No se pudo enviar la solicitud'}>
          {estado.fieldErrors !== undefined && (
            <ul className="mt-2 list-disc pl-5">
              {Object.values(estado.fieldErrors)
                .flat()
                .map((problema) => (
                  <li key={problema}>{problema}</li>
                ))}
            </ul>
          )}
        </ErrorNotice>
      )}

      <Notice tone="neutral" title="Lo que escribas se guarda en este navegador">
        <p>
          Puedes cerrar la página y seguir después. Nada llega a Fuerza Índigo hasta que confirmes el envío en
          el resumen.
        </p>
      </Notice>

      <Stepper
        steps={pasos}
        draftKey={`solicitud-afiliacion-${membershipTypeId}`}
        submitLabel="Enviar la solicitud"
        summaryTitle="Revisa tu solicitud antes de enviarla"
        action={(formData) => {
          formData.set('category', categoria);
          formData.set('membershipTypeId', membershipTypeId);
          empezar(async () => {
            const resultado = await submitApplicationAction({ status: 'idle' }, formData);
            setEstado(resultado);
            if (resultado.status === 'ok') {
              try {
                window.localStorage.removeItem(`solicitud-afiliacion-${membershipTypeId}`);
              } catch {
                // Sin almacenamiento no hay borrador que limpiar.
              }
            }
          });
        }}
      />
    </div>
  );
}
