import type { CaseDomain, Compartment } from '@prisma-client/enums';

/**
 * De qué compartimento es un expediente (PRD §10.3).
 *
 * El compartimento **no** se declara en el catálogo de permisos, y es
 * deliberado: un expediente es sindical o social según su dominio, así que
 * fijarlo en el permiso obligaría a duplicar cada uno —uno por lado— y a
 * duplicarlo otra vez el día que apareciera un tercer dominio. Lo aporta el
 * recurso, y el motor lo antepone al del catálogo.
 *
 * Es una función y no un mapa suelto porque es la única traducción entre las
 * dos escalas, y tenerla en un solo sitio es lo que impide que un módulo
 * traduzca al revés y abra un expediente social a quien solo tiene el
 * compartimento sindical.
 */
export function compartimentoDe(dominio: CaseDomain): Compartment {
  return dominio === 'UNION_DEFENSE' ? 'UNION' : 'SOCIAL';
}
