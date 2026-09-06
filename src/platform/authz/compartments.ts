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
 * **Vive en la plataforma y no en el módulo de casos** porque no es solo el
 * módulo quien la necesita: el servicio de archivos es la única puerta de
 * descarga del sistema, y para decidir sobre el documento de un expediente
 * tiene que saber de qué lado está. Mientras la traducción vivió solo en el
 * módulo, el servicio de archivos tenía la suya —fijaba `SOCIAL` para todo
 * archivo de caso— y un documento de defensa sindical quedaba al alcance del
 * personal de atención social y fuera del alcance de quien lo llevaba.
 *
 * Una regla que vive en dos sitios es una regla que ya se contradice en uno.
 */
export function compartimentoDeExpediente(dominio: CaseDomain): Compartment {
  return dominio === 'UNION_DEFENSE' ? 'UNION' : 'SOCIAL';
}
