'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  draftNotificationTemplate,
  publishNotificationTemplate,
  retireNotificationTemplate,
} from '@/modules/notifications';
import type { NotificationCategory, NotificationChannel } from '@prisma-client/enums';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Administración de las plantillas de aviso (PRD §16.2).
 *
 * Redactar no lleva motivo; publicar y retirar sí, porque ponen o quitan un texto
 * de la boca de la organización. El motivo lo captura el formulario y lo vuelve a
 * validar el caso de uso: la pantalla no puede saltarse esa comprobación.
 */

export interface PlantillaState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly values?: Record<string, string>;
}

function variablesDeTexto(entrada: string): string[] {
  return entrada
    .split(/[\s,]+/)
    .map((nombre) => nombre.trim())
    .filter((nombre) => nombre !== '');
}

export async function draftTemplateAction(_previous: PlantillaState, formData: FormData): Promise<PlantillaState> {
  const actor = await currentActor();

  const values = {
    code: textField(formData, 'code'),
    channel: textField(formData, 'channel'),
    category: textField(formData, 'category'),
    locale: textField(formData, 'locale') || 'es-MX',
    subject: textField(formData, 'subject'),
    bodyTemplate: textField(formData, 'bodyTemplate'),
    variables: textField(formData, 'variables'),
  };

  const asunto = values.subject.trim();
  const resultado = await draftNotificationTemplate(actor, {
    code: values.code,
    channel: values.channel as NotificationChannel,
    category: values.category as NotificationCategory,
    locale: values.locale,
    subject: asunto === '' ? null : asunto,
    bodyTemplate: values.bodyTemplate,
    variables: variablesDeTexto(values.variables),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  redirect(`/gestion/comunicaciones/plantillas/${resultado.data.templateId}`);
}

export async function publishTemplateAction(_previous: PlantillaState, formData: FormData): Promise<PlantillaState> {
  const actor = await currentActor();
  const resultado = await publishNotificationTemplate(actor, {
    templateId: textField(formData, 'templateId'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/comunicaciones/plantillas');
  revalidatePath(`/gestion/comunicaciones/plantillas/${textField(formData, 'templateId')}`);
  return {
    status: 'ok',
    message:
      resultado.data.retiredVersion === null
        ? `Publicada la versión ${resultado.data.version}.`
        : `Publicada la versión ${resultado.data.version}; retirada la ${resultado.data.retiredVersion}.`,
  };
}

export async function retireTemplateAction(_previous: PlantillaState, formData: FormData): Promise<PlantillaState> {
  const actor = await currentActor();
  const templateId = textField(formData, 'templateId');
  const resultado = await retireNotificationTemplate(actor, {
    templateId,
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/comunicaciones/plantillas');
  revalidatePath(`/gestion/comunicaciones/plantillas/${templateId}`);
  return { status: 'ok', message: 'Plantilla retirada.' };
}
