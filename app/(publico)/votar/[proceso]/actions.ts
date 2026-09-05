'use server';

import { castBallot } from '@/modules/voting';
import { textField } from '@/platform/http/form-fields';

/**
 * Depósito de la boleta.
 *
 * **No lee el actor de la petición.** No es un descuido: leerlo invitaría a
 * usarlo, y usarlo —para auditar, para limitar, para lo que fuera— crearía el
 * vínculo entre persona y boleta que todo el diseño existe para no crear
 * (ADR-0012). Lo único que autoriza aquí es la credencial.
 */

export interface BallotFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly verificationCode?: string;
}

export async function castBallotAction(_previous: BallotFormState, formData: FormData): Promise<BallotFormState> {
  const opcion = textField(formData, 'optionCode');

  const resultado = await castBallot({
    voteProcessId: textField(formData, 'voteProcessId'),
    credential: textField(formData, 'credential'),
    optionCode: opcion === '' || opcion === 'EN_BLANCO' ? null : opcion,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  // No se revalida ninguna ruta: hacerlo dejaría rastro del momento del
  // depósito en la caché del servidor.
  return {
    status: 'ok',
    message: 'Tu voto quedó depositado.',
    verificationCode: resultado.data.verificationCode,
  };
}
