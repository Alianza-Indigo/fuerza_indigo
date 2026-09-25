import { SECCIONES as SECCIONES_GESTION } from '../gestion/secciones';
import { SECCIONES as SECCIONES_INSTITUCIONAL } from '../institucional/secciones';
import { SECCIONES as SECCIONES_CASOS } from '../casos/secciones';

export interface SuperadminNavLink {
  readonly href: string;
  readonly label: string;
  readonly description?: string;
}

export interface SuperadminNavGroup {
  readonly label: string;
  readonly links: readonly SuperadminNavLink[];
}

const gestion = new Map(SECCIONES_GESTION.map((seccion) => [seccion.href, seccion]));
const institucional = new Map(SECCIONES_INSTITUCIONAL.map((seccion) => [seccion.href, seccion]));
const casos = new Map(SECCIONES_CASOS.map((seccion) => [seccion.href, seccion]));

function link(
  source: Map<string, { readonly href: string; readonly label: string }>,
  href: string,
  label?: string,
): SuperadminNavLink {
  const item = source.get(href);
  if (item === undefined) throw new Error(`La navegación del Superadmin referencia una ruta no declarada: ${href}`);
  return { href: item.href, label: label ?? item.label };
}

/**
 * Índice único del Centro de Control.
 *
 * No redefine las rutas de Gestión, Institucional ni Casos: las compone desde
 * sus fuentes existentes y solo decide cómo agruparlas para la raíz. Así añadir
 * o renombrar una ruta operativa sigue teniendo una sola fuente.
 */
export const SUPERADMIN_NAVIGATION: readonly SuperadminNavGroup[] = [
  {
    label: 'Centro de control',
    links: [
      { href: '/superadmin', label: 'Resumen' },
      { href: '/superadmin/puesta-en-marcha', label: 'Configuración inicial' },
      { href: '/gestion', label: 'Tablero de gestión' },
      { href: '/institucional', label: 'Vida institucional' },
    ],
  },
  {
    label: 'Personas',
    links: [
      { href: '/superadmin/personas', label: 'Personas y roles' },
      link(gestion, '/gestion/registro'),
      link(gestion, '/gestion/personas'),
      link(gestion, '/gestion/nombramientos'),
      { href: '/superadmin/embajadores', label: 'Embajadores Índigo' },
    ],
  },
  {
    label: 'Afiliación',
    links: [
      link(gestion, '/gestion/afiliacion/solicitudes'),
      link(gestion, '/gestion/afiliacion/calidades'),
      link(gestion, '/gestion/afiliacion/beneficiarios'),
      link(gestion, '/gestion/afiliacion/padrones/agremiados'),
      link(gestion, '/gestion/afiliacion/padrones/honorarios'),
      link(gestion, '/gestion/afiliacion/autoridad-laboral'),
      link(gestion, '/gestion/credenciales'),
      link(gestion, '/gestion/consentimientos'),
    ],
  },
  {
    label: 'Organización',
    links: [
      link(gestion, '/gestion/directorio'),
      link(institucional, '/institucional/territorio'),
      link(institucional, '/institucional/organos'),
      link(institucional, '/institucional/nombramientos'),
    ],
  },
  {
    label: 'Institucional',
    links: [
      link(institucional, '/institucional/reglas'),
      link(institucional, '/institucional/asambleas'),
      link(institucional, '/institucional/acuerdos'),
      link(institucional, '/institucional/elecciones'),
      link(institucional, '/institucional/negociacion'),
      link(institucional, '/institucional/disciplina'),
      link(institucional, '/institucional/cumplimiento'),
      link(institucional, '/institucional/archivo'),
      link(institucional, '/institucional/documentos'),
    ],
  },
  {
    label: 'Casos y acompañamiento',
    links: [
      link(casos, '/casos', 'Todos los expedientes'),
      link(casos, '/casos/paneles'),
      link(casos, '/casos/indicadores'),
    ],
  },
  {
    label: 'Comunicaciones',
    links: [
      link(gestion, '/gestion/mensajes'),
      link(gestion, '/gestion/comunicaciones/plantillas'),
      link(gestion, '/gestion/comunicaciones/campanas'),
      link(gestion, '/gestion/eventos'),
    ],
  },
  {
    label: 'Contenidos',
    links: [
      link(gestion, '/gestion/contenidos'),
      link(gestion, '/gestion/contenidos/ecosistema'),
      link(gestion, '/gestion/redirecciones'),
    ],
  },
  {
    label: 'Finanzas',
    links: [
      link(gestion, '/gestion/finanzas'),
      link(gestion, '/gestion/finanzas/catalogo'),
      link(gestion, '/gestion/finanzas/pagos'),
      link(gestion, '/gestion/finanzas/apoyos'),
      link(gestion, '/gestion/finanzas/libro'),
      link(gestion, '/gestion/finanzas/patrimonio'),
      link(gestion, '/gestion/finanzas/rendicion'),
    ],
  },
  {
    label: 'Inteligencia artificial',
    links: [
      link(gestion, '/gestion/ia'),
      link(gestion, '/gestion/ia/fuentes'),
      link(gestion, '/gestion/ia/proveedor'),
      link(gestion, '/gestion/ia/consumo'),
    ],
  },
  {
    label: 'Control',
    links: [
      { href: '/superadmin/auditoria', label: 'Auditoría' },
      { href: '/superadmin/salud', label: 'Sistema' },
    ],
  },
] as const;

export const SUPERADMIN_LINKS = SUPERADMIN_NAVIGATION.flatMap((group) =>
  group.links.map((item) => ({ ...item, group: group.label })),
);
