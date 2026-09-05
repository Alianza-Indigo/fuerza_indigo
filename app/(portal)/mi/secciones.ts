/**
 * Secciones del portal de la persona.
 *
 * Cada una declara **la facultad que la abre**, por la misma razón que las del
 * área de gestión: una pestaña que lleva a «no tienes autorización» le hace
 * perder el tiempo a quien la pulsa y, peor, le dice que la organización le
 * niega algo suyo cuando lo que pasa es que todavía no tiene nada que ver ahí
 * (defecto `D-F4-017`).
 *
 * `permiso: null` es para lo que cualquier persona con cuenta puede hacer sobre
 * sí misma sin que ningún rol se lo conceda: mirar sus propias sesiones y
 * cerrarlas. Eso no se otorga, se tiene por tener cuenta.
 */
export const SECCIONES_DEL_PORTAL = [
  { href: '/mi/afiliacion', label: 'Mi afiliación', permiso: 'membership.application.read_own' },
  { href: '/mi/directorio', label: 'Mi ficha pública', permiso: 'directory.publication.manage_own' },
  { href: '/mi/credencial', label: 'Mi credencial', permiso: 'credentialing.credential.read_own' },
  { href: '/mi/pagos', label: 'Mis pagos', permiso: 'billing.payment.read_own' },
  { href: '/mi/seguridad', label: 'Seguridad y sesiones', permiso: null },
] as const;
