'use client';

import { useActionState } from 'react';
import {
  ErrorNotice,
  Field,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
  type Option,
} from '@/design-system/primitives';
import {
  adjuntarLogotipoAction,
  cambiarVisibilidadAction,
  editarFichaAction,
  type CatalogoState,
} from './actions';

const INICIAL: CatalogoState = { status: 'idle' };

const ACENTOS: readonly Option[] = [
  { value: '', label: 'Herramienta (por omisión)' },
  { value: 'SINDICATO', label: 'Fuerza Índigo' },
  { value: 'ALIANZA', label: 'Alianza Índigo' },
  { value: 'CIAN', label: 'CIAN' },
  { value: 'CENI', label: 'CENI' },
  { value: 'HERRAMIENTAS', label: 'Herramienta' },
];

export interface FichaEditable {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly summary: string;
  readonly audienceText: string;
  readonly accentToken: string | null;
  readonly sortOrder: number;
  readonly direccionConfigurada: string | null;
  readonly publicada: boolean;
  readonly tieneLogotipo: boolean;
}

/**
 * Edición de una ficha del catálogo (F7-CAT-002, F7-UI-002).
 *
 * El campo que importa es la dirección, y por eso su ayuda dice las dos cosas
 * que hay que saber: que dejarla vacía **retira el acceso** en vez de guardar
 * una cadena rara, y que cambiarla queda registrado con quién fue. Lo segundo
 * no es una amenaza: es lo que uno quiere saber que existe el día que una
 * dirección lleva a donde no debía.
 *
 * No hay campo para el código: identifica la ficha para siempre y la base ni
 * siquiera permite reescribirlo. Un campo que siempre falla al guardarse es
 * peor que ninguno.
 */
export function EditarFichaForm({ ficha }: { ficha: FichaEditable }) {
  const [estado, accion] = useActionState(editarFichaAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo guardar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Ficha guardada'} />}

      <input type="hidden" name="linkId" value={ficha.id} />

      <Field
        name="name"
        id={`name-${ficha.id}`}
        label="Nombre"
        defaultValue={ficha.name}
        required
        errors={estado.fieldErrors?.['name']}
      />

      <TextArea
        name="summary"
        id={`summary-${ficha.id}`}
        label="Qué es"
        hint="En una o dos frases, para alguien que no la conoce."
        defaultValue={ficha.summary}
        required
        rows={3}
        errors={estado.fieldErrors?.['summary']}
      />

      <TextArea
        name="audienceText"
        id={`audienceText-${ficha.id}`}
        label="Para quién es"
        hint="Escríbelo para que alguien sepa si le sirve."
        defaultValue={ficha.audienceText}
        required
        rows={2}
        errors={estado.fieldErrors?.['audienceText']}
      />

      <Field
        name="externalUrl"
        id={`externalUrl-${ficha.id}`}
        label="Dirección de acceso"
        hint="Tiene que empezar por https://. Si la dejas vacía se retira el acceso y la ficha deja de mostrar botón. Cambiarla queda registrado con tu nombre y la fecha."
        defaultValue={ficha.direccionConfigurada ?? ''}
        errors={estado.fieldErrors?.['externalUrl']}
        type="url"
      />

      <Select
        name="accentToken"
        id={`accentToken-${ficha.id}`}
        label="Acento de color"
        options={ACENTOS}
        defaultValue={ficha.accentToken ?? ''}
      />

      <Field
        name="sortOrder"
        id={`sortOrder-${ficha.id}`}
        label="Orden"
        hint="Menor aparece antes."
        defaultValue={String(ficha.sortOrder)}
        errors={estado.fieldErrors?.['sortOrder']}
        type="number"
      />

      <SubmitButton>Guardar ficha</SubmitButton>
    </form>
  );
}

/**
 * Carga del logotipo de la ficha (PRD §12.2).
 *
 * Va en su propio formulario porque es un envío distinto —lleva un archivo— y
 * mezclarlo con el de los textos obligaría a volver a subir la imagen cada vez
 * que se corrige una coma.
 *
 * Solo tres formatos de imagen, y ninguno es SVG: un SVG es un documento que
 * puede llevar guiones dentro, y esta imagen se sirve desde el propio dominio a
 * cualquiera que abra el catálogo.
 */
export function LogotipoForm({ ficha }: { ficha: FichaEditable }) {
  const [estado, accion] = useActionState(adjuntarLogotipoAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo guardar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Logotipo guardado'} />}

      <input type="hidden" name="linkId" value={ficha.id} />

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor={`logotipo-${ficha.id}`}>
          Logotipo
        </label>
        <p className="text-sm text-[var(--color-ink-soft)]" id={`logotipo-ayuda-${ficha.id}`}>
          {ficha.tieneLogotipo
            ? 'Ya hay uno cargado. Si eliges otro, lo sustituye.'
            : 'Todavía no hay ninguno. La ficha se ve igual sin él.'}{' '}
          Imagen PNG, JPEG o WebP.
        </p>
        <input
          id={`logotipo-${ficha.id}`}
          name="logotipo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-describedby={`logotipo-ayuda-${ficha.id}`}
          className="block w-full text-sm"
        />
      </div>

      <SubmitButton>Guardar logotipo</SubmitButton>
    </form>
  );
}

/**
 * Publicar o retirar de la vista.
 *
 * Retirar **no borra**: el botón lo dice, porque quien lo pulsa tiene que poder
 * hacerlo sin miedo a perder un texto que costó escribir. Y publicar sin
 * dirección se permite a propósito: la ficha sirve para contar qué es esa
 * plataforma aunque su acceso todavía no esté configurado.
 */
export function VisibilidadForm({ ficha }: { ficha: FichaEditable }) {
  const [estado, accion] = useActionState(cambiarVisibilidadAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo cambiar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}

      <input type="hidden" name="linkId" value={ficha.id} />
      <input type="hidden" name="publicar" value={ficha.publicada ? 'no' : 'si'} />

      <SubmitButton>
        {ficha.publicada ? 'Retirar de la vista (no se borra)' : 'Publicar en el catálogo'}
      </SubmitButton>
    </form>
  );
}
