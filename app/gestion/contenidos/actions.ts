'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  archivePage,
  createPage,
  editPage,
  publishPage,
  revertPage,
  reviewPage,
  submitForReview,
} from '@/modules/content';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Acciones del panel editorial.
 *
 * Cada una traduce el formulario al caso de uso y devuelve el error tal como
 * llega. Ninguna decide nada: quién puede publicar, si hace falta revisión o si
 * alguien se está aprobando a sí mismo lo resuelve el módulo, que es donde está
 * probado.
 */

export interface EditorialState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function fallo(error: { message: string; details?: Record<string, string[]> | undefined }): EditorialState {
  return {
    status: 'error',
    message: error.message,
    ...(error.details === undefined ? {} : { fieldErrors: error.details }),
  };
}

export async function createPageAction(_previo: EditorialState, formData: FormData): Promise<EditorialState> {
  const actor = await currentActor();
  const entidad = textField(formData, 'legalEntityId');
  const territorio = textField(formData, 'territorialUnitId');

  const resultado = await createPage(actor, {
    slug: textField(formData, 'slug'),
    kind: textField(formData, 'kind') as never,
    title: textField(formData, 'title'),
    summary: textField(formData, 'summary'),
    bodyMarkdown: textField(formData, 'bodyMarkdown'),
    accessLevel: (textField(formData, 'accessLevel') || 'PUBLIC') as never,
    ...(entidad === '' ? {} : { legalEntityId: entidad }),
    ...(territorio === '' ? {} : { territorialUnitId: territorio }),
  });

  if (!resultado.ok) return fallo(resultado.error);
  redirect(`/gestion/contenidos/${resultado.data.pageId}`);
}

export async function editPageAction(_previo: EditorialState, formData: FormData): Promise<EditorialState> {
  const actor = await currentActor();
  const pageId = textField(formData, 'pageId');
  const seoTitle = textField(formData, 'seoTitle');
  const seoDescription = textField(formData, 'seoDescription');

  const resultado = await editPage(actor, {
    pageId,
    title: textField(formData, 'title'),
    summary: textField(formData, 'summary'),
    bodyMarkdown: textField(formData, 'bodyMarkdown'),
    changeNote: textField(formData, 'changeNote'),
    ...(seoTitle === '' ? {} : { seoTitle }),
    ...(seoDescription === '' ? {} : { seoDescription }),
  });

  if (!resultado.ok) return fallo(resultado.error);
  revalidatePath(`/gestion/contenidos/${pageId}`);
  return { status: 'ok', message: `Guardado como versión ${resultado.data.version}. Todavía no está publicado.` };
}

export async function submitAction(_previo: EditorialState, formData: FormData): Promise<EditorialState> {
  const actor = await currentActor();
  const pageId = textField(formData, 'pageId');
  const resultado = await submitForReview(actor, pageId);
  if (!resultado.ok) return fallo(resultado.error);
  revalidatePath(`/gestion/contenidos/${pageId}`);
  return { status: 'ok', message: 'Enviado a revisión. Otra persona con facultad de revisar tiene que aprobarlo.' };
}

export async function reviewAction(_previo: EditorialState, formData: FormData): Promise<EditorialState> {
  const actor = await currentActor();
  const pageId = textField(formData, 'pageId');
  const comentario = textField(formData, 'comment');

  const resultado = await reviewPage(actor, {
    pageId,
    decision: textField(formData, 'decision') === 'DEVOLVER' ? 'DEVOLVER' : 'APROBAR',
    ...(comentario === '' ? {} : { comment: comentario }),
  });

  if (!resultado.ok) return fallo(resultado.error);
  revalidatePath(`/gestion/contenidos/${pageId}`);
  return { status: 'ok', message: 'Revisión registrada.' };
}

export async function publishAction(_previo: EditorialState, formData: FormData): Promise<EditorialState> {
  const actor = await currentActor();
  const pageId = textField(formData, 'pageId');
  const cuando = textField(formData, 'scheduledFor');

  const resultado = await publishPage(actor, {
    pageId,
    // El campo del formulario es local; se envía como instante.
    ...(cuando === '' ? {} : { scheduledFor: new Date(cuando).toISOString() }),
  });

  if (!resultado.ok) return fallo(resultado.error);
  revalidatePath(`/gestion/contenidos/${pageId}`);
  return {
    status: 'ok',
    message:
      resultado.data.status === 'SCHEDULED'
        ? 'Programado. Se publicará solo a la hora indicada.'
        : 'Publicado. Ya está visible en el sitio.',
  };
}

export async function archiveAction(_previo: EditorialState, formData: FormData): Promise<EditorialState> {
  const actor = await currentActor();
  const pageId = textField(formData, 'pageId');
  const resultado = await archivePage(actor, pageId);
  if (!resultado.ok) return fallo(resultado.error);
  revalidatePath(`/gestion/contenidos/${pageId}`);
  return { status: 'ok', message: 'Archivado. Sale del sitio público y su historial se conserva.' };
}

export async function revertAction(_previo: EditorialState, formData: FormData): Promise<EditorialState> {
  const actor = await currentActor();
  const pageId = textField(formData, 'pageId');

  const resultado = await revertPage(actor, {
    pageId,
    versionId: textField(formData, 'versionId'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) return fallo(resultado.error);
  revalidatePath(`/gestion/contenidos/${pageId}`);
  return {
    status: 'ok',
    message: `Se creó la versión ${resultado.data.version} con el contenido anterior. Publícala cuando quieras que se vea.`,
  };
}
