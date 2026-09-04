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
  { href: '/gestion/contenidos', label: 'Contenidos', permiso: 'content.page.read' },
  { href: '/gestion/mensajes', label: 'Mensajes recibidos', permiso: 'support.request.read' },
  { href: '/gestion/redirecciones', label: 'Redirecciones', permiso: 'content.redirect.manage' },
  { href: '/gestion/finanzas/catalogo', label: 'Catálogo de cobros', permiso: 'billing.catalog.manage' },
  { href: '/gestion/finanzas/pagos', label: 'Pagos y devoluciones', permiso: 'billing.payment.read' },
  { href: '/gestion/finanzas/apoyos', label: 'Descuentos y becas', permiso: 'billing.discount.read' },
  { href: '/gestion/finanzas/libro', label: 'Libro y conciliación', permiso: 'billing.ledger.read' },
] as const;
