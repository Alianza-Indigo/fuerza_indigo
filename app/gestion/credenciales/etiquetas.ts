import type { MemberCredentialStatus } from '@prisma-client/enums';

/**
 * Vocabulario de la pantalla de credenciales.
 *
 * En un módulo sin directiva porque lo leen el componente de servidor y el de
 * cliente (control `C-F2-07`).
 */

/**
 * Los tipos que **se emiten a mano**. Los de agremiado y honoraria no están:
 * nacen con la membresía, y ofrecerlos aquí sería ofrecer una credencial de
 * agremiado sin membresía detrás.
 */
export const TIPOS_QUE_SE_EMITEN = [
  {
    value: 'OFFICE_OR_REPRESENTATION',
    label: 'Cargo o representación',
    hint: 'Para quien representa a la organización ante terceros durante su periodo.',
  },
  {
    value: 'AUTHORIZED_PROFESSIONAL',
    label: 'Profesional autorizada',
    hint: 'Para quien ejerce con autorización del ecosistema Índigo.',
  },
] as const;

/** Filtros de estado del listado, sobre el estado **vigente**. */
export const ESTADOS: readonly { value: MemberCredentialStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Vigentes' },
  { value: 'SUSPENDED', label: 'Suspendidas' },
  { value: 'EXPIRED', label: 'Vencidas' },
  { value: 'REVOKED', label: 'Revocadas' },
  { value: 'REPLACED', label: 'Repuestas' },
];
