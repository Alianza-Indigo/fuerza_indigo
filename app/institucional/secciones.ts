/**
 * Secciones del panel institucional (docs/ARCHITECTURE.md §7.1).
 *
 * Igual que en `/gestion`, la lista vive fuera del marco porque la portada del
 * área también la necesita, y cada sección declara el permiso que la abre: la
 * navegación se construye con lo que la persona alcanza de verdad.
 *
 * `/gestion` y `/institucional` no son lo mismo. En `/gestion` se administra la
 * afiliación, el dinero y los contenidos. Aquí ocurre la vida institucional: el
 * territorio, los órganos, las asambleas, las elecciones, la negociación
 * colectiva y la disciplina. Son actos de gobierno, y quien los ejerce lo hace
 * desde un cargo vigente, no desde una cuenta con permisos sueltos.
 */
export const SECCIONES = [
  { href: '/institucional/territorio', label: 'Estructura territorial', permiso: 'territory.unit.read' },
  { href: '/institucional/reglas', label: 'Reglas estatutarias', permiso: 'governance.body.read' },
  { href: '/institucional/organos', label: 'Órganos y cargos', permiso: 'governance.body.read' },
  { href: '/institucional/nombramientos', label: 'Periodos y poderes', permiso: 'governance.body.read' },
  { href: '/institucional/asambleas', label: 'Asambleas', permiso: 'assembly.assembly.read' },
  { href: '/institucional/acuerdos', label: 'Seguimiento de acuerdos', permiso: 'assembly.assembly.read' },
  { href: '/institucional/elecciones', label: 'Elecciones', permiso: 'voting.process.read' },
  { href: '/institucional/negociacion', label: 'Negociación colectiva', permiso: 'bargaining.file.read' },
  { href: '/institucional/disciplina', label: 'Procedimientos disciplinarios', permiso: 'discipline.case.read' },
  { href: '/institucional/cumplimiento', label: 'Obligaciones ante la autoridad', permiso: 'compliance.obligation.read' },
  { href: '/institucional/archivo', label: 'Archivo histórico', permiso: 'compliance.archive.read' },
  { href: '/institucional/documentos', label: 'Plantillas de documento', permiso: 'documents.template.manage' },
] as const;
