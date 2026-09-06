'use server';

import { adjuntarLogotipo, cambiarVisibilidad, editarFicha } from '@/modules/ecosystem';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Acciones del catálogo del ecosistema.
 *
 * Traducen el formulario al caso de uso y devuelven el error tal como llega. No
 * deciden nada: si la dirección vale, quién puede cambiarla y qué se audita lo
 * resuelve el módulo, que es donde está probado.
 *
 * **No revalidan ninguna ruta, y es correcto.** Las tres pantallas donde vive
 * el catálogo —la de administración, la pública y la del portal— se declaran
 * dinámicas y se construyen en cada petición: no hay página guardada que
 * invalidar. Hubo aquí tres llamadas a `revalidatePath` que parecían asegurar
 * que el cambio se viera enseguida; no hacían nada, y el comentario que las
 * acompañaba afirmaba que sí. Se descubrió al intentar romperlas y ver que la
 * prueba seguía en verde.
 *
 * Si algún día alguna de esas rutas dejara de ser dinámica, habrá que
 * revalidarla aquí —y entonces la llamada hará algo—.
 */

export interface CatalogoState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function fallo(error: { message: string; details?: Record<string, string[]> | undefined }): CatalogoState {
  return {
    status: 'error',
    message: error.message,
    ...(error.details === undefined ? {} : { fieldErrors: error.details }),
  };
}

export async function editarFichaAction(_previo: CatalogoState, formData: FormData): Promise<CatalogoState> {
  const actor = await currentActor();
  const acento = textField(formData, 'accentToken');

  const resultado = await editarFicha(actor, {
    linkId: textField(formData, 'linkId'),
    name: textField(formData, 'name'),
    summary: textField(formData, 'summary'),
    audienceText: textField(formData, 'audienceText'),
    externalUrl: textField(formData, 'externalUrl'),
    accentToken: acento === '' ? null : (acento as 'CIAN'),
    sortOrder: textField(formData, 'sortOrder'),
  });

  if (!resultado.ok) return fallo(resultado.error);

  return {
    status: 'ok',
    message: resultado.data.direccionCambiada
      ? 'Ficha guardada. La dirección de acceso cambió y quedó registrado quién la cambió.'
      : 'Ficha guardada.',
  };
}

export async function adjuntarLogotipoAction(
  _previo: CatalogoState,
  formData: FormData,
): Promise<CatalogoState> {
  const actor = await currentActor();
  const archivo = formData.get('logotipo');

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { status: 'error', message: 'Elige una imagen antes de guardar.' };
  }

  const resultado = await adjuntarLogotipo(actor, {
    linkId: textField(formData, 'linkId'),
    originalFileName: archivo.name,
    mimeType: archivo.type,
    content: new Uint8Array(await archivo.arrayBuffer()),
  });

  if (!resultado.ok) return fallo(resultado.error);
  return { status: 'ok', message: 'Logotipo guardado. Ya se ve en el catálogo.' };
}

export async function cambiarVisibilidadAction(
  _previo: CatalogoState,
  formData: FormData,
): Promise<CatalogoState> {
  const actor = await currentActor();

  const resultado = await cambiarVisibilidad(actor, {
    linkId: textField(formData, 'linkId'),
    publicar: textField(formData, 'publicar') === 'si',
  });

  if (!resultado.ok) return fallo(resultado.error);

  return {
    status: 'ok',
    message: resultado.data.publicada
      ? 'La ficha ya se ve en el sitio público y en el portal.'
      : 'La ficha se retiró de la vista. No se borró: su texto y su orden siguen aquí.',
  };
}
