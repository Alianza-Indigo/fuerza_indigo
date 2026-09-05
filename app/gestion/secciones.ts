/**
 * Secciones del área de gestión institucional.
 *
 * Está aquí y no dentro del marco porque el marco no es el único que la
 * necesita: la portada del área también tiene que saber a dónde llevar a quien
 * entra. Cuando cada uno llevaba su propia lista, añadir una sección obligaba a
 * tocar dos sitios, y olvidar el segundo dejaba a quien solo tenía esa facultad
 * entrando al área para ser expulsado de ella.
 *
 * Cada sección declara el permiso que la abre. La navegación se construye a
 * partir de lo que la persona alcanza de verdad: mostrar una pestaña que lleva a
 * una denegación es hacerle perder el tiempo y, además, decirle que existe algo
 * que no le corresponde.
 */
export const SECCIONES = [
  { href: '/gestion/nombramientos', label: 'Nombramientos', permiso: 'access.role.assign' },
  { href: '/gestion/personas', label: 'Invitar personas', permiso: 'identity.user.invite' },
  { href: '/gestion/registro', label: 'Registro de personas', permiso: 'identity.person.read' },
  { href: '/gestion/afiliacion/solicitudes', label: 'Solicitudes de afiliación', permiso: 'membership.application.read' },
  { href: '/gestion/afiliacion/calidades', label: 'Calidades de membresía', permiso: 'membership.type.read' },
  { href: '/gestion/afiliacion/beneficiarios', label: 'Personas beneficiarias', permiso: 'membership.beneficiary.read' },
  { href: '/gestion/afiliacion/padrones/agremiados', label: 'Padrón de agremiados', permiso: 'membership.roster.read' },
  { href: '/gestion/afiliacion/padrones/honorarios', label: 'Padrón de afiliados honorarios', permiso: 'membership.roster.read' },
  {
    href: '/gestion/afiliacion/autoridad-laboral',
    label: 'Autoridad laboral',
    permiso: 'membership.roster.read',
  },
  { href: '/gestion/directorio', label: 'Directorio interno', permiso: 'directory.internal.read' },
  { href: '/gestion/consentimientos', label: 'Avisos y consentimientos', permiso: 'consent.version.manage' },
  { href: '/gestion/contenidos', label: 'Contenidos', permiso: 'content.page.read' },
  { href: '/gestion/mensajes', label: 'Mensajes recibidos', permiso: 'support.request.read' },
  { href: '/gestion/redirecciones', label: 'Redirecciones', permiso: 'content.redirect.manage' },
  { href: '/gestion/finanzas', label: 'Finanzas', permiso: 'billing.payment.read' },
  { href: '/gestion/finanzas/catalogo', label: 'Catálogo de cobros', permiso: 'billing.catalog.manage' },
  { href: '/gestion/finanzas/pagos', label: 'Pagos y devoluciones', permiso: 'billing.payment.read' },
  { href: '/gestion/finanzas/apoyos', label: 'Descuentos y becas', permiso: 'billing.discount.read' },
  { href: '/gestion/finanzas/libro', label: 'Libro y conciliación', permiso: 'billing.ledger.read' },
  { href: '/gestion/finanzas/patrimonio', label: 'Patrimonio', permiso: 'billing.asset.read' },
  { href: '/gestion/finanzas/rendicion', label: 'Rendición de cuentas', permiso: 'billing.accountability.read' },
] as const;
