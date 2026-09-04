'use client';

import { useActionState } from 'react';
import {
  Card,
  ErrorNotice,
  Field,
  Notice,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
  type Option,
} from '@/design-system/primitives';
import {
  archiveAction,
  editPageAction,
  publishAction,
  revertAction,
  reviewAction,
  submitAction,
  type EditorialState,
} from '../actions';

const INICIAL: EditorialState = { status: 'idle' };

interface Facultades {
  readonly escribir: boolean;
  readonly revisar: boolean;
  readonly publicar: boolean;
  readonly revertir: boolean;
}

/**
 * Formularios del editor.
 *
 * Cada acción es un formulario propio con su propio estado. Un solo formulario
 * con varios botones haría que el error de publicar apareciera junto al campo
 * del título, que es donde nadie lo busca.
 *
 * Solo se muestra lo que la persona puede hacer **y** lo que tiene sentido en el
 * estado actual. Ofrecer «publicar» sobre algo sin revisar sería un botón que
 * siempre falla.
 */
export function EditorForms({
  pageId,
  puede,
  estado,
  hayPendientes,
  revisada,
  esAutoriaDelBorrador,
  valores,
  versiones,
}: {
  pageId: string;
  puede: Facultades;
  estado: string;
  hayPendientes: boolean;
  revisada: boolean;
  esAutoriaDelBorrador: boolean;
  valores: { title: string; summary: string; bodyMarkdown: string; seoTitle: string; seoDescription: string };
  versiones: Option[];
}) {
  return (
    <>
      {puede.escribir && estado !== 'IN_REVIEW' && (
        <Card>
          <h2 className="text-xl font-semibold">Editar</h2>
          <p className="mt-1 text-[var(--color-ink-soft)]">
            Guardar crea una versión nueva. El sitio no cambia hasta que se publique.
          </p>
          <div className="mt-5">
            <FormularioEdicion pageId={pageId} valores={valores} />
          </div>
        </Card>
      )}

      {estado === 'IN_REVIEW' && !puede.revisar && (
        <Notice title="Este contenido está en revisión" tone="warning">
          <p>
            No se puede editar mientras otra persona lo revisa. Si necesitas cambiar algo, pide que te lo devuelvan.
          </p>
        </Notice>
      )}

      {estado === 'IN_REVIEW' && puede.revisar && (
        <Card tone="warning">
          <h2 className="text-xl font-semibold">Revisar</h2>
          {esAutoriaDelBorrador ? (
            <p className="mt-1 text-[var(--color-ink-soft)]">
              Esta versión la escribiste tú, de modo que no puedes aprobarla. Sí puedes devolverla con un comentario, o
              pedir a otra persona con facultad de revisión que la apruebe.
            </p>
          ) : (
            <p className="mt-1 text-[var(--color-ink-soft)]">
              Aprobar la deja lista para publicar. Devolverla la regresa a quien la escribió.
            </p>
          )}
          <div className="mt-5">
            <FormularioRevision pageId={pageId} soloDevolver={esAutoriaDelBorrador} />
          </div>
        </Card>
      )}

      {puede.escribir && hayPendientes && estado !== 'IN_REVIEW' && !revisada && (
        <Card>
          <h2 className="text-xl font-semibold">Enviar a revisión</h2>
          <p className="mt-1 text-[var(--color-ink-soft)]">
            Otra persona con facultad de revisión tiene que aprobarlo antes de que se pueda publicar.
          </p>
          <div className="mt-5">
            <FormularioSimple pageId={pageId} accion={submitAction} etiqueta="Enviar a revisión" />
          </div>
        </Card>
      )}

      {puede.publicar && hayPendientes && revisada && (
        <Card tone="accent">
          <h2 className="text-xl font-semibold">Publicar</h2>
          <p className="mt-1 text-[var(--color-ink-soft)]">
            Ya está revisado. Puedes publicarlo ahora o dejarlo programado para una fecha.
          </p>
          <div className="mt-5">
            <FormularioPublicacion pageId={pageId} />
          </div>
        </Card>
      )}

      {puede.revertir && versiones.length > 1 && (
        <Card>
          <h2 className="text-xl font-semibold">Volver a una versión anterior</h2>
          <p className="mt-1 text-[var(--color-ink-soft)]">
            Se crea una versión nueva con el contenido anterior. No se borra nada del historial.
          </p>
          <div className="mt-5">
            <FormularioReversion pageId={pageId} versiones={versiones} />
          </div>
        </Card>
      )}

      {puede.publicar && estado !== 'ARCHIVED' && (
        <Card tone="danger">
          <h2 className="text-xl font-semibold">Archivar</h2>
          <p className="mt-1 text-[var(--color-ink-soft)]">
            Sale del sitio público. El historial se conserva y se puede volver a publicar.
          </p>
          <div className="mt-5">
            <FormularioSimple
              pageId={pageId}
              accion={archiveAction}
              etiqueta="Archivar"
              variante="danger"
              confirmacion="Va a dejar de verse en el sitio. ¿Continuar?"
            />
          </div>
        </Card>
      )}
    </>
  );
}

function Resultado({ estado }: { estado: EditorialState }) {
  if (estado.status === 'error') return <ErrorNotice title={estado.message ?? 'No se pudo completar'} />;
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Listo'} />;
  return null;
}

function FormularioEdicion({
  pageId,
  valores,
}: {
  pageId: string;
  valores: { title: string; summary: string; bodyMarkdown: string; seoTitle: string; seoDescription: string };
}) {
  const [estado, accion, pendiente] = useActionState(editPageAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      <Resultado estado={estado} />
      <input type="hidden" name="pageId" value={pageId} />

      <Field name="title" label="Título" required defaultValue={valores.title} errors={estado.fieldErrors?.['title']} />
      <TextArea
        name="summary"
        label="Resumen"
        required
        rows={3}
        maxLength={400}
        defaultValue={valores.summary}
        hint="Lo que se lee en los listados y al compartir."
        errors={estado.fieldErrors?.['summary']}
      />
      <TextArea
        name="bodyMarkdown"
        label="Contenido"
        required
        rows={16}
        defaultValue={valores.bodyMarkdown}
        hint="Markdown: ## para subtítulos, - para listas."
        errors={estado.fieldErrors?.['bodyMarkdown']}
      />
      <Field
        name="seoTitle"
        label="Título para buscadores"
        defaultValue={valores.seoTitle}
        hint="Opcional. Si lo dejas vacío se usa el título. Hasta 70 caracteres."
        errors={estado.fieldErrors?.['seoTitle']}
      />
      <TextArea
        name="seoDescription"
        label="Descripción para buscadores"
        rows={2}
        maxLength={200}
        defaultValue={valores.seoDescription}
        hint="Opcional. Si la dejas vacía se usa el resumen."
        errors={estado.fieldErrors?.['seoDescription']}
      />
      <Field
        name="changeNote"
        label="Qué cambiaste"
        required
        hint="Es lo que se lee en el historial. Escríbelo para quien lo consulte dentro de un año."
        errors={estado.fieldErrors?.['changeNote']}
      />

      <SubmitButton>{pendiente ? 'Guardando…' : 'Guardar versión'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Guardando la versión' : ''}
      </p>
    </form>
  );
}

function FormularioRevision({ pageId, soloDevolver }: { pageId: string; soloDevolver: boolean }) {
  const [estado, accion, pendiente] = useActionState(reviewAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      <Resultado estado={estado} />
      <input type="hidden" name="pageId" value={pageId} />

      <Select
        name="decision"
        label="Decisión"
        required
        options={
          soloDevolver
            ? [{ value: 'DEVOLVER', label: 'Devolver a quien lo escribió' }]
            : [
                { value: 'APROBAR', label: 'Aprobar: queda listo para publicar' },
                { value: 'DEVOLVER', label: 'Devolver a quien lo escribió' },
              ]
        }
        errors={estado.fieldErrors?.['decision']}
      />
      <TextArea
        name="comment"
        label="Comentario"
        rows={3}
        maxLength={400}
        hint="Opcional al aprobar; útil al devolver, porque dice qué falta."
        errors={estado.fieldErrors?.['comment']}
      />

      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar revisión'}</SubmitButton>
    </form>
  );
}

function FormularioPublicacion({ pageId }: { pageId: string }) {
  const [estado, accion, pendiente] = useActionState(publishAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      <Resultado estado={estado} />
      <input type="hidden" name="pageId" value={pageId} />

      <Field
        name="scheduledFor"
        label="Publicar el"
        type="datetime-local"
        hint="Déjalo vacío para publicar ahora mismo."
        errors={estado.fieldErrors?.['scheduledFor']}
      />

      <SubmitButton>{pendiente ? 'Publicando…' : 'Publicar'}</SubmitButton>
    </form>
  );
}

function FormularioReversion({ pageId, versiones }: { pageId: string; versiones: Option[] }) {
  const [estado, accion, pendiente] = useActionState(revertAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      <Resultado estado={estado} />
      <input type="hidden" name="pageId" value={pageId} />

      <Select
        name="versionId"
        label="Versión a la que volver"
        required
        options={versiones}
        hint="Solo aparecen las que llegaron a publicarse."
        errors={estado.fieldErrors?.['versionId']}
      />
      <Field
        name="reason"
        label="Por qué se revierte"
        required
        hint="Queda en la bitácora y en el historial. Al menos diez caracteres."
        errors={estado.fieldErrors?.['reason']}
      />

      <SubmitButton variant="secondary">{pendiente ? 'Revirtiendo…' : 'Crear versión con el contenido anterior'}</SubmitButton>
    </form>
  );
}

function FormularioSimple({
  pageId,
  accion,
  etiqueta,
  variante = 'primary',
  confirmacion,
}: {
  pageId: string;
  accion: (previo: EditorialState, formData: FormData) => Promise<EditorialState>;
  etiqueta: string;
  variante?: 'primary' | 'secondary' | 'danger';
  confirmacion?: string;
}) {
  const [estado, ejecutar, pendiente] = useActionState(accion, INICIAL);

  return (
    <form
      action={ejecutar}
      onSubmit={(evento) => {
        // Confirmación antes de una acción que la persona vería como pérdida
        // (PRD §5.4). Solo donde el efecto es visible fuera de la plataforma.
        if (confirmacion !== undefined && !window.confirm(confirmacion)) evento.preventDefault();
      }}
      className="space-y-4"
    >
      <Resultado estado={estado} />
      <input type="hidden" name="pageId" value={pageId} />
      <SubmitButton variant={variante}>{pendiente ? 'Un momento…' : etiqueta}</SubmitButton>
    </form>
  );
}
