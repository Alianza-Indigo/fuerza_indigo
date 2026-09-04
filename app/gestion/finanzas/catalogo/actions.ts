'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { archiveProduct, createPrice, createProduct, reactivateProduct } from '@/modules/billing';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';
import { parseAmountToMinor, startOfDayInZone } from '@/platform/i18n';

/**
 * Acciones del catálogo de cobros (F3-PAG-001).
 *
 * La conversión de «pesos con centavos» a unidades menores ocurre aquí y en
 * ningún otro sitio (ADR-0049). El caso de uso recibe siempre un entero: si
 * aceptara un decimal, existiría un punto del sistema donde un importe es coma
 * flotante, y ahí es donde aparece el centavo que no cuadra.
 */

export interface CatalogState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function fallo(error: { message: string; details?: Record<string, string[]> | undefined }): CatalogState {
  return {
    status: 'error',
    message: error.message,
    ...(error.details === undefined ? {} : { fieldErrors: error.details }),
  };
}

function opcional(formData: FormData, name: string): string | undefined {
  const valor = textField(formData, name).trim();
  return valor === '' ? undefined : valor;
}

export async function createProductAction(_previo: CatalogState, formData: FormData): Promise<CatalogState> {
  const actor = await currentActor();

  const resultado = await createProduct(actor, {
    code: textField(formData, 'code'),
    name: textField(formData, 'name'),
    description: textField(formData, 'description'),
    legalEntityId: textField(formData, 'legalEntityId'),
    kind: textField(formData, 'kind') as never,
    billingMode: textField(formData, 'billingMode') as never,
    moduleBinding: (opcional(formData, 'moduleBinding') ?? 'NONE') as never,
    ...(opcional(formData, 'stripeProductId') === undefined
      ? {}
      : { stripeProductId: opcional(formData, 'stripeProductId') }),
    ...(opcional(formData, 'authorizingResolutionNote') === undefined
      ? {}
      : { authorizingResolutionNote: opcional(formData, 'authorizingResolutionNote') }),
  });

  if (!resultado.ok) return fallo(resultado.error);

  // Se lleva al detalle porque un concepto sin precio todavía no cobra nada, y
  // el detalle es donde se le pone. Dejarlo en el listado invitaría a darlo por
  // terminado antes de tiempo.
  redirect(`/gestion/finanzas/catalogo/${resultado.data.productId}`);
}

export async function createPriceAction(_previo: CatalogState, formData: FormData): Promise<CatalogState> {
  const actor = await currentActor();
  const productId = textField(formData, 'productId');
  const currency = textField(formData, 'currency');

  const importe = parseAmountToMinor(textField(formData, 'amount'), currency);
  if (!importe.ok) return { status: 'error', message: importe.reason, fieldErrors: { amount: [importe.reason] } };

  // La fecha se interpreta en la zona de quien captura, no en UTC. Con UTC, un
  // precio acordado para el 1 de enero empezaba a regir a las seis de la tarde
  // del 31 de diciembre y se presentaba con la fecha del día anterior.
  const vigencia = startOfDayInZone(textField(formData, 'effectiveFrom'), actor.timeZone);
  if (vigencia === null) {
    return {
      status: 'error',
      message: 'Falta desde cuándo rige este precio.',
      fieldErrors: { effectiveFrom: ['Di desde qué día rige: un precio sin fecha no se puede explicar después.'] },
    };
  }

  const resultado = await createPrice(actor, {
    productId,
    // El importe ya es entero de unidades menores; el caso de uso lo vuelve a
    // validar por su cuenta, porque una pantalla no es una garantía.
    amountMinor: importe.minor,
    currency: currency as never,
    ...(opcional(formData, 'interval') === undefined ? {} : { interval: opcional(formData, 'interval') as never }),
    ...(opcional(formData, 'stripePriceId') === undefined ? {} : { stripePriceId: opcional(formData, 'stripePriceId') }),
    effectiveFrom: vigencia,
  });

  if (!resultado.ok) return fallo(resultado.error);

  revalidatePath(`/gestion/finanzas/catalogo/${productId}`);
  revalidatePath('/gestion/finanzas/catalogo');
  return {
    status: 'ok',
    message: `Versión ${String(resultado.data.version)} registrada. La anterior queda cerrada el día en que empieza esta.`,
  };
}

export async function archiveProductAction(_previo: CatalogState, formData: FormData): Promise<CatalogState> {
  const actor = await currentActor();
  const productId = textField(formData, 'productId');

  const resultado = await archiveProduct(actor, { productId, reason: textField(formData, 'reason') });
  if (!resultado.ok) return fallo(resultado.error);

  revalidatePath(`/gestion/finanzas/catalogo/${productId}`);
  revalidatePath('/gestion/finanzas/catalogo');
  return { status: 'ok', message: 'Retirado del catálogo. Sus precios y sus cobros anteriores siguen ahí.' };
}

export async function reactivateProductAction(_previo: CatalogState, formData: FormData): Promise<CatalogState> {
  const actor = await currentActor();
  const productId = textField(formData, 'productId');

  const resultado = await reactivateProduct(actor, { productId, reason: textField(formData, 'reason') });
  if (!resultado.ok) return fallo(resultado.error);

  revalidatePath(`/gestion/finanzas/catalogo/${productId}`);
  revalidatePath('/gestion/finanzas/catalogo');
  return { status: 'ok', message: 'Vuelve al catálogo con el precio que tenía.' };
}
