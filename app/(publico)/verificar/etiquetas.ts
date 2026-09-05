import type { CredentialKind, MemberCredentialStatus } from '@prisma-client/enums';

/**
 * Cómo se nombran los tipos y los estados de una credencial en la pantalla.
 *
 * En un módulo sin directiva, no dentro del componente de cliente ni del de
 * servidor: lo leen los dos, y una constante declarada dentro de un archivo
 * `'use client'` no es un objeto cuando la lee el servidor, es una referencia
 * (defecto `D-F4-010`, control `C-F2-07`).
 */

export const ETIQUETA_DE_TIPO: Record<CredentialKind, string> = {
  UNION_MEMBER: 'Agremiado',
  HONORARY_AFFILIATE: 'Afiliación honoraria',
  OFFICE_OR_REPRESENTATION: 'Cargo o representación',
  AUTHORIZED_PROFESSIONAL: 'Profesional autorizada',
};

export interface EtiquetaDeEstado {
  readonly titulo: string;
  /** Qué significa, para quien tiene la credencial delante y decide qué hacer. */
  readonly explicacion: string;
  readonly tono: 'success' | 'warning' | 'danger' | 'neutral';
}

export const ETIQUETA_DE_ESTADO: Record<MemberCredentialStatus, EtiquetaDeEstado> = {
  ACTIVE: {
    titulo: 'Credencial vigente',
    explicacion: 'Esta credencial está en vigor en este momento.',
    tono: 'success',
  },
  SUSPENDED: {
    titulo: 'Credencial suspendida',
    explicacion:
      'La membresía que acredita está suspendida. La persona sigue perteneciendo a la organización, pero la credencial no está en vigor ahora.',
    tono: 'warning',
  },
  EXPIRED: {
    titulo: 'Credencial vencida',
    explicacion: 'Se acabó su vigencia. No fue revocada: nadie decidió nada, terminó su plazo.',
    tono: 'warning',
  },
  REVOKED: {
    titulo: 'Credencial revocada',
    explicacion: 'Esta credencial ya no acredita nada. No debe aceptarse.',
    tono: 'danger',
  },
  REPLACED: {
    titulo: 'Credencial repuesta',
    explicacion:
      'Se emitió otra credencial en su lugar. Esta ya no acredita nada: pide la vigente.',
    tono: 'danger',
  },
};
