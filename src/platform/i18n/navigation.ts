/**
 * Mapa de navegación pública (PRD §6.1).
 *
 * Vive en un solo lugar porque tres cosas distintas lo necesitan y tienen que
 * coincidir: la cabecera, el pie y el mapa del sitio que leen los buscadores.
 * Mantener tres listas paralelas es cómo un enlace acaba existiendo en el pie y
 * no en el mapa, o al revés.
 *
 * `module` colorea el distintivo del módulo. Es lo que diferencia sin
 * fragmentar: el ecosistema comparte estructura y cada área se reconoce por su
 * acento (PRD §24 Fase 2).
 */

export interface NavItem {
  readonly href: string;
  readonly label: string;
  /** Qué se encuentra ahí, en una frase. Se usa en el mapa del sitio y en el pie. */
  readonly description: string;
  readonly module?: 'sindicato' | 'alianza' | 'cian' | 'ceni' | 'herramientas';
  /**
   * Fase que habilita el contenido dinámico de la ruta. La página existe desde
   * la Fase 2 con su contenido editorial; lo que llega después es el dato vivo.
   */
  readonly dataFrom?: number;
}

export interface NavSection {
  readonly title: string;
  readonly items: readonly NavItem[];
}

export const SITE_NAV: readonly NavSection[] = [
  {
    title: 'El sindicato',
    items: [
      {
        href: '/que-es-fuerza-indigo',
        label: 'Qué es Fuerza Índigo',
        description: 'Quiénes somos, a quién representamos y qué defendemos.',
        module: 'sindicato',
      },
      {
        href: '/sindicato-y-derechos',
        label: 'Sindicato y derechos',
        description: 'Qué derechos tienes como persona trabajadora y cómo los ejercemos juntas.',
        module: 'sindicato',
      },
      {
        href: '/delegaciones',
        label: 'Delegaciones',
        description: 'Dónde estamos y con quién hablar en tu territorio.',
        module: 'sindicato',
      },
      {
        href: '/transparencia',
        label: 'Transparencia',
        description: 'Cuentas, acuerdos y documentos de acceso público.',
        module: 'sindicato',
      },
    ],
  },
  {
    title: 'Participar',
    items: [
      {
        href: '/afiliate/agremiado',
        label: 'Afíliate como agremiado',
        description: 'Requisitos, derechos, cuota y cómo empezar.',
        module: 'sindicato',
        dataFrom: 4,
      },
      {
        href: '/afiliate/honoraria',
        label: 'Afiliación honoraria',
        description: 'Apoyar al sindicato sin ser persona trabajadora del ramo.',
        module: 'sindicato',
        dataFrom: 4,
      },
      {
        href: '/solicitar-apoyo',
        label: 'Solicitar apoyo',
        description: 'Si vives una situación laboral difícil, empieza aquí.',
        module: 'alianza',
      },
      {
        href: '/directorio',
        label: 'Directorio',
        description: 'Profesionales y organizaciones que decidieron aparecer públicamente.',
        module: 'sindicato',
        dataFrom: 4,
      },
    ],
  },
  {
    title: 'El ecosistema',
    items: [
      {
        href: '/alianza-indigo',
        label: 'Alianza Índigo',
        description: 'La asociación civil y su acción social.',
        module: 'alianza',
      },
      {
        href: '/cian',
        label: 'CIAN',
        description: 'Centro Integral de Atención Neurodivergente.',
        module: 'cian',
        dataFrom: 8,
      },
      {
        href: '/ceni',
        label: 'CENI',
        description: 'Certificación de Entornos Neuroinclusivos.',
        module: 'ceni',
        dataFrom: 9,
      },
      {
        href: '/herramientas',
        label: 'Herramientas',
        description: 'NeuroPlan, ADIA y NEXO.',
        module: 'herramientas',
        dataFrom: 7,
      },
    ],
  },
  {
    title: 'Al día',
    items: [
      {
        href: '/noticias',
        label: 'Noticias',
        description: 'Comunicados, notas y recursos.',
      },
      {
        href: '/eventos',
        label: 'Eventos',
        description: 'Cursos, talleres y convocatorias abiertas.',
        dataFrom: 11,
      },
      {
        href: '/contacto',
        label: 'Contacto',
        description: 'Escríbenos y te respondemos.',
      },
      {
        href: '/buscar',
        label: 'Buscar',
        description: 'Encuentra en todo el sitio público.',
      },
    ],
  },
];

/** Páginas legales. Van en el pie, separadas del resto. */
export const LEGAL_NAV: readonly NavItem[] = [
  {
    href: '/legales/privacidad',
    label: 'Aviso de privacidad',
    description: 'Qué datos tratamos, para qué y con qué base.',
  },
  { href: '/legales/terminos', label: 'Términos', description: 'Condiciones de uso de la plataforma.' },
  {
    href: '/legales/accesibilidad',
    label: 'Accesibilidad',
    description: 'Nuestro compromiso y cómo reportarnos una barrera.',
  },
  {
    href: '/legales/derechos-datos',
    label: 'Derechos de datos',
    description: 'Cómo ejercer acceso, rectificación, cancelación y oposición.',
  },
];

/** Todas las rutas públicas, para el mapa del sitio. */
export const PUBLIC_ROUTES: readonly NavItem[] = [
  { href: '/', label: 'Inicio', description: 'Página principal de Fuerza Índigo.' },
  ...SITE_NAV.flatMap((seccion) => seccion.items),
  ...LEGAL_NAV,
];
