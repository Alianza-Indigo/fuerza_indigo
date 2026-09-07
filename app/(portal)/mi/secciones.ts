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
 * cerrarlas, o leer su propio buzón de avisos. Eso no se otorga, se tiene por
 * tener cuenta.
 */
export const SECCIONES_DEL_PORTAL = [
  { href: '/mi/afiliacion', label: 'Mi afiliación', permiso: 'membership.application.read_own' },
  // El centro de notificaciones no lo abre ningún permiso: los avisos llegan a
  // toda cuenta —seguridad, cobros, gobierno—, y leer el propio buzón o silenciar
  // lo que no es obligatorio no es una facultad que un cargo conceda (ADR-0157).
  { href: '/mi/notificaciones', label: 'Notificaciones', permiso: null },
  // Los eventos los ve cualquier persona con cuenta: el calendario es para
  // todas, y quien se inscribe lo hace por sí misma (PRD §16.3).
  { href: '/mi/eventos', label: 'Eventos', permiso: null },
  { href: '/mi/directorio', label: 'Mi ficha pública', permiso: 'directory.publication.manage_own' },
  { href: '/mi/credencial', label: 'Mi credencial', permiso: 'credentialing.credential.read_own' },
  { href: '/mi/pagos', label: 'Mis pagos', permiso: 'billing.payment.read_own' },
  { href: '/mi/consentimientos', label: 'Consentimientos', permiso: 'consent.read_own' },
  // El catálogo del ecosistema no lo abre ningún permiso: es público y es el
  // mismo para todo el mundo (PRD §12.4). Está aquí para que quien entró a ver
  // su afiliación no tenga que volver al sitio público para encontrarlo.
  { href: '/mi/herramientas', label: 'Plataformas y herramientas', permiso: null },
  { href: '/mi/seguridad', label: 'Seguridad y sesiones', permiso: null },
] as const;
