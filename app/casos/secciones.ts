/**
 * Secciones del área de casos (PRD §6, §10).
 *
 * Es un área propia y no una pestaña de `/gestion` por una razón de fondo: aquí
 * no se administra la organización, se acompaña a personas. Los expedientes son
 * reservados, se abren por asignación y su lectura queda registrada. Meterlos
 * entre el catálogo de cuotas y el directorio interno habría sugerido que se
 * miran con la misma ligereza.
 */
export const SECCIONES = [
  { href: '/casos', label: 'Mis expedientes', permiso: 'cases.case.read' },
  /**
   * Los paneles de coordinación son otra cosa que «mis expedientes», y por eso
   * son otra entrada: aquella enseña lo que llevas, esta lo que hay que
   * repartir. Los abre la facultad de asignar, así que a quien solo atiende no
   * se le ofrece una puerta que no puede abrir.
   */
  { href: '/casos/paneles', label: 'Paneles de coordinación', permiso: 'cases.case.assign' },
] as const;
