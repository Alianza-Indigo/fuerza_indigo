#!/usr/bin/env node
/**
 * Verificador de fase — Plataforma Integral Fuerza Índigo.
 *
 * Ejecuta los controles aplicables a la fase activa declarada en
 * `docs/PHASE_STATUS.md` y produce un resultado legible por humanos
 * (salida estándar) y por agentes (`reports/phase-verify.json`).
 *
 * Referencia: PRD §22.3 y §23.2.
 *
 * Uso:
 *   node scripts/phase/verify.mjs            Ejecuta los controles de la fase activa.
 *   node scripts/phase/verify.mjs --status   Muestra únicamente la fase activa.
 *   node scripts/phase/verify.mjs --json     Emite solo el JSON del resultado.
 *
 * Sin dependencias externas: debe poder ejecutarse en un repositorio recién clonado.
 */

import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CONTRACT = JSON.parse(readFileSync(join(ROOT, 'scripts/phase/prd-contract.json'), 'utf8'));

const args = new Set(process.argv.slice(2));
const JSON_ONLY = args.has('--json');
const STATUS_ONLY = args.has('--status');

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.turbo',
  '.vercel',
  'coverage',
  'reports',
  'playwright-report',
  'test-results',
  'dist',
  'build',
]);

/** Recorre el repositorio y devuelve rutas relativas de archivos. */
function walk(dir = ROOT, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else acc.push(relative(ROOT, full).split(sep).join('/'));
  }
  return acc;
}

function read(relPath) {
  const full = join(ROOT, relPath);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

function sizeOf(relPath) {
  const full = join(ROOT, relPath);
  return existsSync(full) ? statSync(full).size : 0;
}

const TEXT_EXTENSIONS = new Set([
  '.md', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.prisma',
  '.css', '.scss', '.yml', '.yaml', '.html', '.sql', '.sh', '.txt', '.example',
]);

function isTextFile(relPath) {
  const dot = relPath.lastIndexOf('.');
  if (dot === -1) return relPath.endsWith('.env.example');
  return TEXT_EXTENSIONS.has(relPath.slice(dot));
}

function ok(details = []) {
  return { status: 'PASS', details };
}
function fail(details) {
  return { status: 'FAIL', details: Array.isArray(details) ? details : [details] };
}
function skip(reason) {
  return { status: 'SKIP', details: [reason] };
}

/* ------------------------------------------------------------------ */
/* Fase activa                                                         */
/* ------------------------------------------------------------------ */

function readActivePhase() {
  const content = read('docs/PHASE_STATUS.md');
  if (content === null) {
    return { phase: null, state: null, error: 'No existe docs/PHASE_STATUS.md.' };
  }
  const phaseMatch = content.match(/^-\s*\*\*Fase activa:\*\*\s*(\d+)/m);
  if (!phaseMatch) {
    return { phase: null, state: null, error: 'docs/PHASE_STATUS.md no declara "- **Fase activa:** N".' };
  }

  // Se toma el **primer** «Estado» del documento y se valida después, en vez de
  // buscar directamente uno de los tres valores admitidos. La versión anterior
  // hacía lo segundo, y al escribir un estado fuera del vocabulario la búsqueda
  // seguía adelante hasta encontrar uno válido **en el archivo de una fase
  // anterior**: el verificador informaba del estado de otra fase sin avisar de
  // nada. Un dato equivocado en silencio es peor que un error.
  const stateMatch = content.match(/^-\s*\*\*Estado:\*\*\s*`?([A-Z_]+)`?/m);
  if (!stateMatch) {
    return { phase: Number(phaseMatch[1]), state: null, error: 'docs/PHASE_STATUS.md no declara "- **Estado:** IN_PROGRESS|BLOCKED|APPROVED".' };
  }

  const ESTADOS = ['IN_PROGRESS', 'BLOCKED', 'APPROVED'];
  if (!ESTADOS.includes(stateMatch[1])) {
    return {
      phase: Number(phaseMatch[1]),
      state: null,
      error: `docs/PHASE_STATUS.md declara el estado "${stateMatch[1]}", que no existe. Los admitidos son ${ESTADOS.join(', ')}.`,
    };
  }

  return { phase: Number(phaseMatch[1]), state: stateMatch[1], error: null };
}

/* ------------------------------------------------------------------ */
/* Controles                                                           */
/* ------------------------------------------------------------------ */

const REQUIRED_DOCS = [
  ['docs/ARCHITECTURE.md', 8000],
  ['docs/DATA_MODEL.md', 20000],
  ['docs/PERMISSIONS.md', 8000],
  ['docs/FLOWS.md', 8000],
  ['docs/INTEGRATIONS.md', 8000],
  ['docs/SECURITY.md', 8000],
  ['docs/TEST_PLAN.md', 8000],
  ['docs/PHASE_STATUS.md', 2000],
  ['docs/DECISIONS.md', 8000],
  ['docs/ENVIRONMENT.md', 4000],
  ['docs/BACKLOG.md', 8000],
  ['docs/PRD.md', 40000],
];

/**
 * Rutas donde la palabra prohibida del PRD §0.2 puede aparecer legítimamente:
 * el propio PRD, el registro de la decisión que la prohíbe, el control de
 * cumplimiento documentado y este verificador.
 */
const COMPLIANCE_ALLOWLIST = new Set([
  'docs/PRD.md',
  'docs/DECISIONS.md',
  'docs/SECURITY.md',
  'scripts/phase/verify.mjs',
  'scripts/phase/prd-contract.json',
]);

/**
 * Archivos que el repositorio versiona de verdad.
 *
 * Distinto de recorrer el disco: `.env.local`, las claves de desarrollo y los
 * artefactos de construcción están en el disco de quien programa y no en el
 * repositorio. Un control que dice «no debe versionarse» tiene que mirar lo
 * versionado, o denuncia lo que no ocurre y calla lo que sí.
 */
let trackedCache = null;
function tracked() {
  if (trackedCache !== null) return trackedCache;
  try {
    const salida = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
    trackedCache = salida.split('\0').filter((ruta) => ruta !== '');
  } catch {
    // Sin git —una copia descargada como archivo comprimido— se recae en el
    // disco, que es una aproximación peor pero no deja el control sin ejecutar.
    trackedCache = walk();
  }
  return trackedCache;
}

/**
 * Marcadores de trabajo inconcluso prohibidos por el PRD §0.3.
 *
 * `shape: true` significa que la palabra solo cuenta como marcador cuando
 * aparece con la **forma** de uno: seguida de dos puntos, de un paréntesis o de
 * un guion. Sin esa distinción, «TODO» se dispara con la palabra española
 * escrita en mayúsculas y «XXX» con cualquier resumen hexadecimal de un archivo
 * de dependencias, y un control que avisa de lo que no es acaba desatendido.
 */
const FORBIDDEN_MARKERS = [
  { text: ['TO', 'DO'].join(''), shape: true },
  { text: ['FIX', 'ME'].join(''), shape: true },
  { text: ['HACK', ''].join(''), shape: true },
  { text: ['XX', 'X'].join(''), shape: true },
  { text: 'próximamente', shape: false },
  { text: 'proximamente', shape: false },
  { text: 'lorem ipsum', shape: false },
  { text: 'Lorem Ipsum', shape: false },
  { text: 'placeholder de contenido', shape: false },
];

/** ¿La palabra aparece en esta línea con forma de marcador de trabajo? */
function hasMarker(line, marker) {
  if (!marker.shape) return line.includes(marker.text);
  return new RegExp(`\\b${marker.text}\\b\\s*[:(\\-]`).test(line);
}

/** Rutas exentas del control de marcadores: contienen el texto normativo o el propio control. */
const MARKER_ALLOWLIST = new Set([
  'docs/PRD.md',
  'scripts/phase/verify.mjs',
]);

/**
 * Extrae los bloques de definición de entidad de docs/DATA_MODEL.md.
 * Cada bloque empieza en una línea `**\`Entidad\`**` y termina antes del siguiente.
 */
function entityBlocks() {
  const model = read('docs/DATA_MODEL.md');
  if (model === null) return null;
  const blocks = new Map();
  const lines = model.split('\n');
  let current = null;
  for (const line of lines) {
    const header = line.match(/^\*\*`(\w+)`\*\*/);
    if (header) {
      current = header[1];
      blocks.set(current, []);
    }
    if (current) blocks.get(current).push(line);
  }
  for (const [name, ls] of blocks) blocks.set(name, ls.join('\n'));
  return blocks;
}

/** Fase declarada de migración de cada entidad, desde el contrato del PRD. */
function entityPhaseIndex() {
  const index = new Map();
  for (const [phase, names] of Object.entries(CONTRACT.entityMigrationPhase ?? {})) {
    if (phase.startsWith('$')) continue;
    for (const name of names) index.set(name, Number(phase));
  }
  return index;
}

/**
 * Defectos registrados en docs/PHASE_STATUS.md con su estado.
 *
 * Lee la forma que el documento **usa de verdad**: una fila por defecto, con el
 * identificador en la primera celda —entre acentos graves o sin ellos—, la
 * severidad en la segunda y, en la última, o bien la corrección o bien nada.
 *
 * La versión anterior exigía que la última celda dijera literalmente `Abierto`
 * o `Cerrado`. Ninguna de las 81 filas del documento lo dice, de modo que el
 * lector devolvía la lista vacía y los dos controles que dependen de él —
 * `C-COH-06` y `C-COH-07`— llevaban desde la Fase 0 dando verde sin mirar
 * (defecto `D-F4-022`). Un control que aprueba sin leer es peor que no tenerlo.
 *
 * La regla es al revés y no admite silencios: la última celda cuenta cómo se
 * corrigió el defecto, y un defecto **abierto** la deja vacía o la empieza con
 * `Abierto`, `Pendiente` o `Sin corregir`. Una celda vacía es un defecto
 * abierto, no un defecto sin documentar.
 */
function registeredDefects() {
  const status = read('docs/PHASE_STATUS.md');
  if (status === null) return [];
  const found = [];
  for (const line of status.split('\n')) {
    if (!/^\|\s*`?D-F\d+-\d+`?\s*\|/.test(line)) continue;
    const celdas = line.split('|').slice(1, -1).map((c) => c.trim());
    const id = (celdas[0] ?? '').replace(/`/g, '');
    const severity = celdas[1] ?? '';
    const cierre = celdas[celdas.length - 1] ?? '';
    const abierto = cierre === '' || /^(Abierto|Pendiente|Sin corregir|No corregido)\b/i.test(cierre);
    found.push({ id, open: abierto, severity });
  }
  return found;
}

const CHECKS = [
  {
    id: 'C-REPO-01',
    title: 'Los entregables documentales obligatorios existen y tienen contenido sustantivo',
    phases: 'all',
    run() {
      const problems = [];
      for (const [doc, minBytes] of REQUIRED_DOCS) {
        const size = sizeOf(doc);
        if (size === 0) problems.push(`Falta ${doc}.`);
        else if (size < minBytes) problems.push(`${doc} tiene ${size} bytes; el mínimo exigido es ${minBytes}.`);
      }
      return problems.length ? fail(problems) : ok([`${REQUIRED_DOCS.length} documentos verificados.`]);
    },
  },
  {
    id: 'C-REPO-02',
    title: 'No existen marcadores de trabajo inconcluso (PRD §0.3)',
    phases: 'all',
    run() {
      const problems = [];
      for (const file of walk()) {
        if (!isTextFile(file) || MARKER_ALLOWLIST.has(file)) continue;
        const content = read(file);
        if (content === null) continue;
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          for (const marker of FORBIDDEN_MARKERS) {
            if (hasMarker(line, marker)) {
              problems.push(`${file}:${index + 1} contiene el marcador "${marker.text}".`);
            }
          }
        });
      }
      return problems.length ? fail(problems) : ok(['Sin marcadores prohibidos.']);
    },
  },
  {
    id: 'C-REPO-03',
    title: 'Prohibición absoluta del proveedor vetado en el PRD §0.2',
    phases: 'all',
    run() {
      const needle = ['supa', 'base'].join('');
      const problems = [];
      const allowed = [];
      for (const file of walk()) {
        if (!isTextFile(file)) continue;
        const content = read(file);
        if (content === null) continue;
        const hits = content.toLowerCase().split(needle).length - 1;
        if (hits === 0) continue;
        if (COMPLIANCE_ALLOWLIST.has(file)) allowed.push(`${file} (${hits} referencias de cumplimiento permitidas)`);
        else problems.push(`${file} contiene ${hits} referencia(s) al proveedor prohibido.`);
      }
      return problems.length
        ? fail(problems)
        : ok([`Cero coincidencias en código, dependencias y documentación productiva.`, ...allowed]);
    },
  },
  {
    id: 'C-REPO-04',
    title: 'No hay archivos de entorno con secretos versionados',
    phases: 'all',
    run() {
      const problems = [];
      for (const file of tracked()) {
        const base = file.split('/').pop();
        if (base === '.env' || /^\.env\.(?!example$)/.test(base)) {
          problems.push(`${file} no debe versionarse.`);
        }
        if (base && (base.endsWith('.pem') || base.endsWith('.key'))) {
          problems.push(`${file} parece material criptográfico y no debe versionarse.`);
        }
      }
      return problems.length ? fail(problems) : ok(['Solo .env.example está versionado.']);
    },
  },
  {
    id: 'C-DATA-01',
    title: 'Todas las entidades del PRD §18.1–18.8 están modeladas o consolidadas con justificación',
    phases: 'all',
    run() {
      const model = read('docs/DATA_MODEL.md');
      if (model === null) return fail('No existe docs/DATA_MODEL.md.');
      const missing = [];
      let total = 0;
      for (const [group, entities] of Object.entries(CONTRACT.entities)) {
        for (const entity of entities) {
          total += 1;
          const declared = new RegExp(`(^|[^A-Za-z])${entity}([^A-Za-z]|$)`, 'm').test(model);
          if (!declared) missing.push(`${group} → ${entity} no aparece en docs/DATA_MODEL.md.`);
        }
      }
      return missing.length ? fail(missing) : ok([`${total} entidades del PRD localizadas en el modelo de datos.`]);
    },
  },
  {
    id: 'C-DATA-02',
    title: 'El modelo de datos incluye diagramas Mermaid mantenibles',
    phases: 'all',
    run() {
      const problems = [];
      for (const doc of ['docs/DATA_MODEL.md', 'docs/ARCHITECTURE.md', 'docs/FLOWS.md']) {
        const content = read(doc);
        if (content === null) {
          problems.push(`Falta ${doc}.`);
          continue;
        }
        const blocks = content.split('```mermaid').length - 1;
        if (blocks === 0) problems.push(`${doc} no contiene diagramas Mermaid.`);
      }
      return problems.length ? fail(problems) : ok(['Diagramas Mermaid presentes en arquitectura, datos y flujos.']);
    },
  },
  {
    id: 'C-DATA-03',
    title: 'Cada entidad del PRD tiene bloque de definición con campos, no solo una mención',
    phases: 'all',
    run() {
      const blocks = entityBlocks();
      if (blocks === null) return fail('No existe docs/DATA_MODEL.md.');
      const problems = [];
      for (const [group, entities] of Object.entries(CONTRACT.entities)) {
        for (const entity of entities) {
          const block = blocks.get(entity);
          if (block === undefined) {
            problems.push(`${group} → ${entity} no tiene bloque de definición \`**\`${entity}\`**\`.`);
            continue;
          }
          const fieldCount = (block.match(/`\w+`/g) ?? []).length;
          if (fieldCount < 4) {
            problems.push(`${entity} declara ${fieldCount} identificadores; una definición útil necesita al menos 4.`);
          }
        }
      }
      return problems.length ? fail(problems) : ok([`${blocks.size} bloques de definición presentes.`]);
    },
  },
  {
    id: 'C-COH-01',
    title: 'Ninguna relación se modela como arreglo de identificadores',
    phases: 'all',
    run() {
      const model = read('docs/DATA_MODEL.md');
      if (model === null) return fail('No existe docs/DATA_MODEL.md.');
      const problems = [];
      model.split('\n').forEach((line, index) => {
        for (const hit of line.match(/`\w*(?:Id|Ids)` \*string\[\]\*/g) ?? []) {
          problems.push(`docs/DATA_MODEL.md:${index + 1} declara ${hit}: use una tabla de relación con clave foránea (§13.bis).`);
        }
      });
      return problems.length ? fail(problems) : ok(['Sin arreglos de identificadores; las relaciones tienen tabla propia.']);
    },
  },
  {
    id: 'C-COH-02',
    title: 'No quedan decisiones redactadas como disyuntiva abierta',
    phases: 'all',
    run() {
      const problems = [];
      const openChoice = /\*[a-záéíóúñ]+(?:\([^)]*\))? o [a-záéíóúñ]+[^*]*\*/i;
      // El límite de palabra va solo al principio, y las dos decisiones son
      // deliberadas. Al principio hace falta: sin él, «para decidir qué falta
      // escribir» contiene «a decidir» y el control acusaba una decisión
      // pospuesta donde había una frase corriente; un control que da falsos
      // positivos enseña a ignorarlo, y entonces deja de servir cuando acierta.
      // Al final estorba: `\b` de JavaScript solo entiende letras ASCII, de modo
      // que tras la «á» de «se decidirá» no reconoce ningún límite y la
      // alternativa dejaría de acusar nunca.
      const undecided =
        /\b(por definir|a decidir|queda abierto|se decidir[áa]|pendiente de decidir|se evaluar[áa] m[áa]s adelante)/i;
      for (const doc of ['docs/DATA_MODEL.md', 'docs/ARCHITECTURE.md', 'docs/INTEGRATIONS.md', 'docs/SECURITY.md', 'docs/PERMISSIONS.md']) {
        const content = read(doc);
        if (content === null) continue;
        content.split('\n').forEach((line, index) => {
          if (openChoice.test(line)) problems.push(`${doc}:${index + 1} declara un tipo como disyuntiva: la Fase 0 debe cerrar la decisión (PRD §0.1).`);
          if (undecided.test(line)) problems.push(`${doc}:${index + 1} pospone una decisión que el PRD §0.1 obliga a tomar y registrar.`);
        });
      }
      return problems.length ? fail(problems) : ok(['Todas las decisiones técnicas están cerradas.']);
    },
  },
  {
    id: 'C-COH-03',
    title: 'Ninguna entidad depende de otra que se migra en una fase posterior',
    phases: 'all',
    run() {
      const blocks = entityBlocks();
      if (blocks === null) return fail('No existe docs/DATA_MODEL.md.');
      const phaseOf = entityPhaseIndex();
      if (phaseOf.size === 0) return fail('El contrato del PRD no declara entityMigrationPhase.');
      const allowlist = CONTRACT.forwardReferenceAllowlist ?? {};
      const problems = [];
      const unmapped = new Set();
      for (const [entity, block] of blocks) {
        const own = phaseOf.get(entity);
        if (own === undefined) {
          unmapped.add(entity);
          continue;
        }
        for (const m of block.matchAll(/`(\w+)`( NULL)? FK→`(\w+)`/g)) {
          const [, field, nullable, ref] = m;
          const target = phaseOf.get(ref);
          if (target === undefined || target <= own) continue;
          if (!nullable) {
            problems.push(
              `${entity}.${field} (fase ${own}) referencia OBLIGATORIAMENTE a ${ref} (fase ${target}): la fase ${own} no podría cerrarse al 100 %. Una referencia obligatoria hacia adelante es un error de orden de fases y no admite excusa en la lista de tolerancia.`,
            );
          } else if (allowlist[`${entity}->${ref}`] === undefined) {
            problems.push(
              `${entity}.${field} (fase ${own}) referencia a ${ref} (fase ${target}). Es anulable, pero toda referencia hacia adelante exige justificación explícita en forwardReferenceAllowlist.`,
            );
          }
        }
      }
      if (unmapped.size) problems.push(`Sin fase declarada en el contrato: ${[...unmapped].sort().join(', ')}.`);
      return problems.length ? fail(problems) : ok([`${phaseOf.size} entidades con fase declarada y sin dependencias hacia adelante no justificadas.`]);
    },
  },
  {
    id: 'C-COH-04',
    title: 'El algoritmo de decisión no concede a ningún actor por vía rápida',
    phases: 'all',
    run() {
      const perms = read('docs/PERMISSIONS.md');
      if (perms === null) return fail('No existe docs/PERMISSIONS.md.');
      const start = perms.indexOf('function can(');
      if (start === -1) return fail('docs/PERMISSIONS.md no contiene el algoritmo de decisión.');
      const body = perms.slice(start, perms.indexOf('```', start));
      const problems = [];
      const superadminBranch = body.match(/ROOT_SUPERADMIN[\s\S]*?\n\s{2}\}/);
      if (superadminBranch && /return allow\(/.test(superadminBranch[0])) {
        problems.push('El algoritmo concede al Superadmin antes de recorrer las verificaciones comunes (defecto D-F0-001).');
      }
      for (const guard of ['FUERA_DE_ENTIDAD', 'FUERA_DE_TERRITORIO', 'SIN_ASIGNACION', 'CONSENTIMIENTO_REQUERIDO', 'COMPARTIMENTO_AJENO', 'MOTIVO_REQUERIDO']) {
        if (!body.includes(guard)) problems.push(`El algoritmo no comprueba ${guard}.`);
      }
      const allowCount = (body.match(/return allow\(/g) ?? []).length;
      if (allowCount > 1) problems.push(`El algoritmo tiene ${allowCount} puntos de concesión; debe haber exactamente uno, al final de la tubería.`);
      return problems.length ? fail(problems) : ok(['Un solo punto de concesión, tras las seis verificaciones.']);
    },
  },
  {
    id: 'C-COH-05',
    title: 'La urna no contiene identidad ni marca temporal',
    phases: 'all',
    run() {
      const blocks = entityBlocks();
      if (blocks === null) return fail('No existe docs/DATA_MODEL.md.');
      const ballot = blocks.get('Ballot');
      if (ballot === undefined) return fail('docs/DATA_MODEL.md no define `Ballot`.');
      const problems = [];
      const definition = ballot.split('\n')[1] ?? '';
      for (const forbidden of ['membershipId', 'personId', 'castAt', 'createdAt', 'userId', 'ipHash', 'actorId']) {
        if (definition.includes(forbidden)) {
          problems.push(`\`Ballot\` declara \`${forbidden}\`: reintroduce la correlación entre persona y voto (defecto D-F0-002).`);
        }
      }
      if (!/UUIDv4/.test(definition)) {
        problems.push('`Ballot` debe declarar UUIDv4: un identificador ordenable en el tiempo revela el momento del depósito.');
      }
      const eligibility = blocks.get('VoteEligibility') ?? '';
      for (const forbidden of ['ballotConsumedAt', 'blindTokenHash', 'ballotIssuedAt']) {
        if (eligibility.includes(forbidden)) {
          problems.push(`\`VoteEligibility\` declara \`${forbidden}\`: permite correlacionar por proximidad temporal o por huella.`);
        }
      }
      return problems.length ? fail(problems) : ok(['Urna sin identidad, sin tiempo y con identificadores no ordenables.']);
    },
  },
  {
    id: 'C-COH-06',
    title: 'Una fase con defectos abiertos no puede declararse aprobada',
    phases: 'all',
    run() {
      const status = read('docs/PHASE_STATUS.md');
      if (status === null) return fail('No existe docs/PHASE_STATUS.md.');
      const declared = status.match(/^-\s*\*\*Estado:\*\*\s*`?(IN_PROGRESS|BLOCKED|APPROVED)`?/m);
      const open = registeredDefects().filter((d) => d.open);
      const blocking = open.filter((d) => /Bloqueante|Cr[íi]tica|Alta|Media/i.test(d.severity));
      if (declared && declared[1] === 'APPROVED' && blocking.length) {
        return fail([
          `La fase se declara APPROVED con ${blocking.length} defecto(s) de severidad bloqueante abiertos: ${blocking.map((d) => d.id).join(', ')}.`,
          'El PRD §23.2 lo prohíbe. Ciérrelos o declare la fase BLOCKED.',
        ]);
      }
      return ok([`Estado declarado coherente con ${open.length} defecto(s) abierto(s).`]);
    },
  },
  {
    id: 'C-COH-07',
    title: 'Cada defecto abierto tiene su tarea de corrección en el backlog',
    phases: 'all',
    run() {
      const backlog = read('docs/BACKLOG.md');
      if (backlog === null) return fail('No existe docs/BACKLOG.md.');
      const open = registeredDefects().filter((d) => d.open);
      const problems = [];
      for (const defect of open) {
        const correction = defect.id.replace(/^D-(F\d+)-/, '$1-COR-');
        if (!backlog.includes(correction)) {
          problems.push(`El defecto ${defect.id} no tiene la tarea ${correction} en el backlog.`);
        }
      }
      return problems.length
        ? fail(problems)
        : ok([`${open.length} defecto(s) abierto(s), todos con tarea de corrección asignada.`]);
    },
  },
  {
    id: 'C-ACCESS-01',
    title: 'Los roles base del PRD §4.2 están definidos en la matriz de permisos',
    phases: 'all',
    run() {
      const perms = read('docs/PERMISSIONS.md');
      if (perms === null) return fail('No existe docs/PERMISSIONS.md.');
      const missing = CONTRACT.roles.filter((role) => !perms.includes(role));
      return missing.length
        ? fail(missing.map((role) => `El rol ${role} no aparece en docs/PERMISSIONS.md.`))
        : ok([`${CONTRACT.roles.length} roles base documentados.`]);
    },
  },
  {
    id: 'C-ENV-01',
    title: 'Las variables mínimas del PRD §21 están en .env.example y en docs/ENVIRONMENT.md',
    phases: 'all',
    run() {
      const example = read('.env.example');
      const doc = read('docs/ENVIRONMENT.md');
      if (example === null) return fail('No existe .env.example.');
      if (doc === null) return fail('No existe docs/ENVIRONMENT.md.');
      const problems = [];
      for (const variable of CONTRACT.environmentVariables) {
        if (!new RegExp(`^${variable}=`, 'm').test(example)) problems.push(`${variable} falta en .env.example.`);
        if (!doc.includes(variable)) problems.push(`${variable} falta en docs/ENVIRONMENT.md.`);
      }
      return problems.length ? fail(problems) : ok([`${CONTRACT.environmentVariables.length} variables verificadas.`]);
    },
  },
  {
    id: 'C-ENV-02',
    title: '.env.example no contiene valores que parezcan secretos reales',
    phases: 'all',
    run() {
      const example = read('.env.example');
      if (example === null) return fail('No existe .env.example.');
      const problems = [];
      const suspicious = [/sk_live_[A-Za-z0-9]/, /sk_test_[A-Za-z0-9]{10}/, /whsec_[A-Za-z0-9]{10}/, /postgres:\/\/[^\s]*:[^\s]*@/, /AIza[0-9A-Za-z_-]{10}/];
      example.split('\n').forEach((line, index) => {
        for (const pattern of suspicious) {
          if (pattern.test(line)) problems.push(`.env.example:${index + 1} parece contener un valor real.`);
        }
      });
      return problems.length ? fail(problems) : ok(['Plantilla de entorno sin secretos.']);
    },
  },
  {
    id: 'C-API-01',
    title: 'Las familias de endpoints del PRD §19.2 están contratadas en la arquitectura',
    phases: 'all',
    run() {
      const arch = read('docs/ARCHITECTURE.md');
      if (arch === null) return fail('No existe docs/ARCHITECTURE.md.');
      const missing = CONTRACT.apiFamilies.filter((family) => !arch.includes(family));
      return missing.length
        ? fail(missing.map((family) => `La familia ${family} no aparece en docs/ARCHITECTURE.md.`))
        : ok([`${CONTRACT.apiFamilies.length} familias de endpoints contratadas.`]);
    },
  },
  {
    id: 'C-TEST-01',
    title: `Los ${CONTRACT.globalE2eFlows.length} flujos E2E globales del PRD §22.2 están planificados`,
    phases: 'all',
    run() {
      const plan = read('docs/TEST_PLAN.md');
      if (plan === null) return fail('No existe docs/TEST_PLAN.md.');
      const missing = CONTRACT.globalE2eFlows.filter((flow) => !plan.includes(flow));
      return missing.length
        ? fail(missing.map((flow) => `El flujo ${flow} no aparece en docs/TEST_PLAN.md.`))
        : ok([`${CONTRACT.globalE2eFlows.length} flujos E2E globales planificados.`]);
    },
  },
  {
    id: 'C-PHASE-01',
    title: `El backlog cubre las ${CONTRACT.phases.length} fases sin tareas huérfanas`,
    phases: 'all',
    run() {
      const backlog = read('docs/BACKLOG.md');
      if (backlog === null) return fail('No existe docs/BACKLOG.md.');
      const problems = [];
      for (const phase of CONTRACT.phases) {
        const heading = new RegExp(`^##\\s+Fase ${phase.id}\\b`, 'm');
        if (!heading.test(backlog)) {
          problems.push(`El backlog no contiene la sección "## Fase ${phase.id}".`);
          continue;
        }
        const section = backlog.split(new RegExp(`^##\\s+Fase ${phase.id}\\b.*$`, 'm'))[1] ?? '';
        const body = section.split(/^##\s+/m)[0] ?? '';
        const taskIds = body.match(/\bF\d{1,2}-[A-Z]{2,5}-\d{2,3}\b/g) ?? [];
        if (taskIds.length === 0) problems.push(`La fase ${phase.id} no tiene tareas identificadas en el backlog.`);
        const wrongPrefix = taskIds.filter((id) => !id.startsWith(`F${phase.id}-`));
        if (wrongPrefix.length) {
          problems.push(`La fase ${phase.id} contiene tareas con prefijo ajeno: ${[...new Set(wrongPrefix)].join(', ')}.`);
        }
      }
      const orphanSection = /##\s+Tareas sin fase/i.test(backlog);
      if (orphanSection) problems.push('El backlog declara una sección de tareas sin fase; el PRD §24 Fase 0 lo prohíbe.');
      return problems.length
        ? fail(problems)
        : ok([`${CONTRACT.phases.length} fases con backlog asignado y sin tareas huérfanas.`]);
    },
  },
  {
    id: 'C-PHASE-02',
    title: 'docs/PHASE_STATUS.md declara los apartados obligatorios del PRD §23.1',
    phases: 'all',
    run() {
      const status = read('docs/PHASE_STATUS.md');
      if (status === null) return fail('No existe docs/PHASE_STATUS.md.');
      const required = [
        'Fase activa',
        'Alcance contratado',
        'Criterios de aceptación',
        'Tareas completadas',
        'Evidencias',
        'Pruebas y resultados',
        'Defectos abiertos',
        'Decisiones',
        'Estado',
        'SHA',
      ];
      const missing = required.filter((section) => !status.includes(section));
      return missing.length
        ? fail(missing.map((section) => `docs/PHASE_STATUS.md no documenta "${section}".`))
        : ok(['Seguimiento de fase completo.']);
    },
  },
  {
    id: 'C-F0-01',
    title: 'Fase 0: no se implementaron funciones de fases posteriores',
    phases: [0],
    /**
     * Exclusivo de su fase, y es el único de este tipo.
     *
     * No comprueba una garantía que deba seguir cumpliéndose, sino un «todavía
     * no»: en la Fase 0 el repositorio no debe traer código de aplicación. En
     * la Fase 1 ese código es justamente lo que hay que entregar, así que
     * seguir comprobándolo después haría fallar la puerta por haber avanzado.
     */
    scope: 'exclusive',
    run() {
      const forbidden = ['app', 'src', 'prisma', 'public'];
      const present = forbidden.filter((dir) => existsSync(join(ROOT, dir)));
      return present.length
        ? fail(present.map((dir) => `La Fase 0 no debe contener el directorio de aplicación "${dir}/" (PRD §24 Fase 0).`))
        : ok(['El repositorio contiene únicamente arquitectura, documentación y utilidades de fase.']);
    },
  },
  {
    id: 'C-F0-02',
    title: 'Fase 0: cada documento entregable referencia la sección del PRD que lo contrata',
    phases: [0],
    run() {
      const problems = [];
      for (const [doc] of REQUIRED_DOCS) {
        if (doc === 'docs/PRD.md') continue;
        const content = read(doc);
        if (content === null) {
          problems.push(`Falta ${doc}.`);
          continue;
        }
        if (!/PRD §/.test(content)) problems.push(`${doc} no referencia ninguna sección del PRD.`);
      }
      return problems.length ? fail(problems) : ok(['Trazabilidad documento ↔ PRD verificada.']);
    },
  },
  {
    id: 'C-F1-01',
    title: 'Fase 1: cada pantalla contratada por el PRD §24 existe como ruta',
    phases: [1],
    run() {
      // La lista sale del propio PRD. Que una pantalla figure en el alcance y no
      // exista como ruta es la forma más silenciosa de dejar una fase a medias:
      // todo lo demás compila, pasa el lint y pasa las pruebas.
      const pantallas = [
        ['inicio y cierre de sesión', ['app/(auth)/acceso/page.tsx']],
        ['activación', ['app/(auth)/activar/[token]/page.tsx']],
        ['recuperación', ['app/(auth)/recuperar/page.tsx', 'app/(auth)/recuperar/[token]/page.tsx']],
        ['sesiones propias', ['app/(portal)/mi/seguridad/page.tsx']],
        ['login de Superadmin', ['app/superadmin/login/page.tsx']],
        ['tablero técnico de Superadmin', ['app/superadmin/page.tsx', 'app/superadmin/salud/page.tsx']],
        ['gestión de entidades jurídicas y personas', ['app/superadmin/personas/page.tsx']],
        ['gestión de roles', ['app/gestion/nombramientos/page.tsx', 'app/gestion/personas/page.tsx']],
        ['visor de auditoría con permisos', ['app/superadmin/auditoria/page.tsx']],
      ];

      const problems = [];
      for (const [nombre, rutas] of pantallas) {
        for (const ruta of rutas) {
          if (!existsSync(join(ROOT, ruta))) problems.push(`Falta la pantalla de ${nombre}: ${ruta}.`);
        }
      }
      return problems.length
        ? fail(problems)
        : ok([`${pantallas.length} pantallas contratadas por el PRD §24 presentes como rutas.`]);
    },
  },
  {
    id: 'C-F1-02',
    title: 'Fase 1: todo caso de uso exportado se invoca desde alguna superficie o módulo vecino',
    phases: [1],
    run() {
      // El defecto que este control impide: `assignRole` y `revokeRole` existían
      // completos, probados y documentados, y ninguna pantalla los llamaba. Una
      // función que nadie puede invocar es alcance no entregado, aunque el código
      // esté escrito.
      // Las superficies son las pantallas, las rutas y los guiones… y el
      // registro de suscripciones a eventos de dominio, y el registro de
      // manejadores de trabajos. Un caso de uso que solo se invoca desde un
      // manejador de la cola de trabajos sí está entregado: la ruta de reparto
      // (`app/api/v1/cron/dispatch/route.ts`) drena la cola llamando a `runJob`,
      // que despacha al manejador; la cadena hasta una ruta real está
      // comprobada. Igual que el registro de eventos de dominio, sin esta línea
      // el control exigiría inventar una pantalla para algo que ocurre solo.
      const superficies = walk().filter(
        (file) =>
          (file.startsWith('app/') ||
            file.startsWith('scripts/') ||
            file === 'src/platform/jobs/domain-event-registry.ts' ||
            file === 'src/platform/jobs/handlers.ts') &&
          /\.tsx?$/.test(file),
      );
      const invocado = superficies.map((file) => read(file) ?? '').join('\n');

      // Un caso de uso que **otro módulo** invoca también está entregado. La
      // Fase 5 lo hizo evidente: `membershipByCredential` existe porque el
      // registro de asistencia lee una credencial, y `revokeExpiredOfficeAccess`
      // porque el trabajo que revoca roles cierra además los cargos vencidos.
      // Ninguna pantalla los nombra, y exigir que lo hicieran habría llevado a
      // inventar una pantalla o —peor— a duplicar la consulta dentro del módulo
      // que la necesita, saltándose la frontera que el linter protege.
      //
      // El control conserva su filo: la superficie que invoca al módulo vecino
      // sigue teniendo que existir, porque los casos de uso de ese vecino se
      // comprueban con esta misma regla. Lo que deja de exigirse es que la
      // superficie sea *directa*.
      const codigoDeModulos = walk().filter(
        (file) => file.startsWith('src/modules/') && /\.tsx?$/.test(file),
      );

      const problems = [];
      for (const file of walk()) {
        if (!/^src\/modules\/[^/]+\/index\.ts$/.test(file)) continue;
        const content = read(file);
        if (content === null) continue;

        // Se leen las llaves de cada bloque `export { ... }`, en vez de las
        // líneas que parecen un nombre suelto. La versión anterior solo miraba
        // exportaciones escritas una por línea, de modo que un
        // `export { a, b } from '...'` en una sola línea pasaba sin revisar: el
        // control daba verde por no haber mirado, que es peor que fallar
        // (`D-F3-011`).
        // Lo que otro módulo puede invocar: todo el código de módulos menos el
        // del módulo que declara la exportación.
        const modulo = file.slice(0, file.indexOf('/', 'src/modules/'.length) + 1);
        const invocadoPorVecinos = codigoDeModulos
          .filter((otro) => !otro.startsWith(modulo))
          .map((otro) => read(otro) ?? '')
          .join('\n');

        for (const bloque of content.matchAll(/export\s*\{([^}]*)\}\s*from/g)) {
          const lista = bloque[1] ?? '';
          for (const bruto of lista.split(',')) {
            const nombre = bruto.replace(/\/\*[\s\S]*?\*\//g, '').trim().split(/\s+as\s+/)[0]?.trim() ?? '';
            // Los tipos no son casos de uso: no se invocan, se anotan.
            if (nombre === '' || nombre.startsWith('type ') || !/^[a-z][A-Za-z0-9]*$/.test(nombre)) continue;
            // Los esquemas de validación tampoco: se exportan para que quien
            // llama pueda validar antes, y no tienen por qué invocarse desde
            // una pantalla. Lo que este control persigue son funciones de
            // negocio que quedaron sin superficie.
            if (nombre.endsWith('Schema')) continue;
            const patron = new RegExp(`\\b${nombre}\\b`);
            if (!patron.test(invocado) && !patron.test(invocadoPorVecinos)) {
              problems.push(
                `${file} exporta "${nombre}" y no lo invoca ninguna pantalla, ruta, guion ni otro módulo.`,
              );
            }
          }
        }
      }
      return problems.length
        ? fail(problems)
        : ok(['Todo caso de uso exportado lo invoca una superficie o un módulo vecino.']);
    },
  },
  {
    id: 'C-F1-03',
    title: 'Fase 1: la facultad de nombrar existe en algún rol del catálogo',
    phases: [1],
    run() {
      // Un catálogo sin nadie capaz de otorgar roles produce un sistema que se
      // despliega bien y no se puede administrar nunca. No lo detecta ninguna
      // prueba negativa: todas seguirían en verde.
      const semilla = read('prisma/seed/data/roles.ts');
      if (semilla === null) return fail(['No se encontró la semilla de roles.']);

      const problems = [];
      for (const permiso of ['access.role.assign', 'access.role.revoke']) {
        if (!semilla.includes(`'${permiso}'`)) {
          problems.push(`Ningún rol de la semilla recibe "${permiso}": nadie podría nombrar ni revocar.`);
        }
      }

      // Y ese permiso no puede acabar en la lista cerrada del actor raíz. Se
      // acota la lectura a la declaración de esa lista: más abajo del archivo
      // están las concesiones de los trabajos programados, y el trabajo de
      // vencimientos sí revoca nombramientos, que es su función.
      const permisos = read('src/platform/authz/permissions.ts') ?? '';
      const inicio = permisos.indexOf('SUPERADMIN_GRANTED');
      const cierre = permisos.indexOf(']);', inicio);
      const cerrada = inicio === -1 || cierre === -1 ? '' : permisos.slice(inicio, cierre);
      if (cerrada === '') problems.push('No se pudo leer la lista de concesión del actor raíz.');
      for (const permiso of ['access.role.assign', 'access.role.revoke']) {
        if (cerrada.includes(`'${permiso}'`)) {
          problems.push(`"${permiso}" figura en la lista de concesión del actor raíz: nombrar es un acto institucional (PRD §4.4).`);
        }
      }

      return problems.length ? fail(problems) : ok(['La facultad de nombrar reside en el catálogo y no en el actor raíz.']);
    },
  },
  {
    id: 'C-F1-04',
    title: 'Fase 1: el modelo declarado y las migraciones no divergen',
    phases: [1],
    run() {
      // El defecto que este control impide: la migración inicial creaba
      // `audit_event` sin las dos columnas de la cadena de resúmenes que el
      // modelo declaraba. La comparación real la hace la prueba de integración
      // contra PostgreSQL; aquí se comprueba lo que se puede leer sin base:
      // que cada campo del modelo aparece en alguna migración.
      const problems = [];
      const migraciones = walk()
        .filter((file) => /^prisma\/migrations\/.+\/migration\.sql$/.test(file))
        .map((file) => read(file) ?? '')
        .join('\n');

      if (migraciones === '') return fail(['No hay ninguna migración en el repositorio.']);

      for (const file of walk()) {
        if (!/^prisma\/schema\/.+\.prisma$/.test(file)) continue;
        const content = read(file);
        if (content === null) continue;

        for (const match of content.matchAll(/^\s{2}(\w+)\s+(String|Int|BigInt|Boolean|DateTime|Json|Decimal|Float)\b/gm)) {
          const campo = match[1];
          if (campo === undefined) continue;
          if (!migraciones.includes(`"${campo}"`)) {
            problems.push(`${file}: el campo "${campo}" no aparece en ninguna migración.`);
          }
        }
      }

      return problems.length
        ? fail(problems)
        : ok(['Cada campo escalar del modelo aparece en las migraciones del repositorio.']);
    },
  },
  {
    id: 'C-F1-05',
    title: 'Fase 1: las pruebas negativas obligatorias de esta fase están escritas',
    phases: [1],
    run() {
      // docs/PERMISSIONS.md §9 enumera trece. Las que dependen de entidades de
      // fases posteriores se prueban allí; estas siete son las que la Fase 1
      // puede y debe demostrar hoy.
      const pruebas = walk()
        .filter((file) => file.startsWith('tests/') && file.endsWith('.test.ts'))
        .map((file) => read(file) ?? '')
        .join('\n');

      const obligatorias = [
        ['1', 'prueba negativa 1', /acceso horizontal|E2E-12|expediente ajeno|archivo ajeno/i],
        ['2', 'escalamiento vertical', /escalamiento vertical|elevación de privilegios|no posee/i],
        ['3', 'territorio ajeno', /FUERA_DE_TERRITORIO/],
        ['9', 'superadmin acotado', /SUPERADMIN_GRANTED/],
        ['10', 'superadmin sin compartimentos', /COMPARTIMENTO_AJENO/],
        ['11', 'superadmin sin lectura masiva', /LECTURA_MASIVA_PROHIBIDA/],
        ['13', 'archivo privado', /pase.*(autorización|firma)|redeemDownload/i],
      ];

      const problems = obligatorias
        .filter(([, , patron]) => !patron.test(pruebas))
        .map(([numero, nombre]) => `Falta la prueba negativa ${numero} (${nombre}) de docs/PERMISSIONS.md §9.`);

      return problems.length
        ? fail(problems)
        : ok([`${obligatorias.length} pruebas negativas obligatorias de la Fase 1 presentes.`]);
    },
  },
  {
    id: 'C-F1-06',
    title: 'Fase 1: la integración continua ejecuta la puerta completa y en orden',
    phases: [1],
    run() {
      const flujo = read('.github/workflows/calidad.yml');
      if (flujo === null) return fail(['No existe .github/workflows/calidad.yml.']);

      const orden = ['phase:verify', 'run lint', 'run typecheck', 'npm test', 'test:integration', 'run build'];
      const posiciones = orden.map((paso) => flujo.indexOf(paso));

      const problems = [];
      orden.forEach((paso, indice) => {
        if (posiciones[indice] === -1) problems.push(`La CI no ejecuta "${paso}".`);
      });
      for (let i = 1; i < posiciones.length; i += 1) {
        const anterior = posiciones[i - 1];
        const actual = posiciones[i];
        if (anterior === -1 || actual === -1) continue;
        if (actual < anterior) {
          problems.push(`La CI ejecuta "${orden[i]}" antes que "${orden[i - 1]}" (docs/TEST_PLAN.md §11.1).`);
        }
      }
      if (!/postgres/i.test(flujo)) {
        problems.push('La CI no levanta PostgreSQL: las pruebas de integración necesitan la base real.');
      }

      return problems.length ? fail(problems) : ok(['La CI ejecuta la puerta de calidad completa y en orden.']);
    },
  },
  {
    id: 'C-F1-07',
    title: 'Fase 1: accesibilidad estructural de las pantallas (PRD §5.2, docs/TEST_PLAN.md §7)',
    phases: [1],
    run() {
      // La validación automatizada con motor de reglas y navegador llega en la
      // Fase 2, que es la que habilita `test:a11y`. Lo que sí puede comprobarse
      // hoy, y sin navegador, es lo estructural: que ningún campo se identifique
      // solo con texto de marcador, que los objetivos táctiles lleguen al mínimo
      // y que el documento declare idioma, ampliación y salto al contenido.
      const problems = [];

      const raiz = read('app/layout.tsx');
      if (raiz === null) {
        problems.push('Falta app/layout.tsx.');
      } else {
        if (!/lang="es-MX"/.test(raiz)) problems.push('app/layout.tsx no declara el idioma del documento.');
        if (!/#contenido/.test(raiz)) problems.push('app/layout.tsx no ofrece enlace de salto al contenido.');
        if (/maximumScale:\s*1\b|user-scalable=no/.test(raiz)) {
          problems.push('app/layout.tsx bloquea la ampliación: es requisito de accesibilidad no hacerlo.');
        }
      }

      const estilos = read('app/globals.css') ?? '';
      if (!/prefers-reduced-motion/.test(estilos)) {
        problems.push('app/globals.css no respeta la preferencia de movimiento reducido.');
      }
      if (!/:focus-visible/.test(estilos)) {
        problems.push('app/globals.css no define un indicador de foco visible.');
      }

      for (const file of walk()) {
        if (!file.startsWith('app/') || !file.endsWith('.tsx')) continue;
        const content = read(file);
        if (content === null) continue;

        // Un `placeholder` sin etiqueta desaparece al escribir y deja a la
        // persona sin saber qué se le pedía.
        //
        // Se mira **elemento por elemento** y no el archivo entero. La versión
        // anterior acusaba a cualquier archivo que contuviera `placeholder=` y
        // no contuviera `<label`, y eso marcaba como defecto el texto de la
        // opción vacía de un `<Select>` cuya etiqueta la pinta la primitiva.
        // Un control que acusa de más enseña a ignorarlo, y entonces deja de
        // servir cuando acierta.
        for (const elemento of content.split('<').slice(1)) {
          const apertura = elemento.slice(0, elemento.indexOf('>') === -1 ? undefined : elemento.indexOf('>'));
          if (!/placeholder=/.test(apertura)) continue;

          // La etiqueta puede venir como propiedad de una primitiva del sistema
          // de diseño, como atributo accesible, o como un `<label htmlFor>` en
          // el mismo archivo apuntando al identificador de este elemento.
          if (/\blabel=|aria-label=|aria-labelledby=/.test(apertura)) continue;

          const identificador = /\bid="([^"]+)"/.exec(apertura)?.[1];
          if (identificador !== undefined && content.includes(`htmlFor="${identificador}"`)) continue;

          const nombre = /^[A-Za-z][A-Za-z0-9]*/.exec(apertura)?.[0] ?? 'elemento';
          problems.push(`${file} usa texto de marcador sin etiqueta visible en <${nombre}>.`);
        }
        // 44 px son 11 unidades de la escala de espaciado.
        for (const match of content.matchAll(/min-h-(\d+)/g)) {
          const unidades = Number(match[1]);
          if (Number.isFinite(unidades) && unidades < 11) {
            problems.push(`${file} declara un objetivo táctil de menos de 44 px (min-h-${match[1]}).`);
          }
        }
        // Toda tabla ancha se desplaza dentro de su contenedor: el cuerpo de la
        // página nunca se desplaza en horizontal.
        if (/<table/.test(content) && !/overflow-x-auto/.test(content)) {
          problems.push(`${file} contiene una tabla sin contenedor de desplazamiento propio.`);
        }
      }

      const primitivas = read('src/design-system/primitives.tsx');
      if (primitivas === null) {
        problems.push('Falta el archivo de primitivas del sistema de diseño.');
      } else {
        if (!/htmlFor=/.test(primitivas)) problems.push('Las primitivas no asocian etiqueta y campo.');
        if (!/aria-describedby/.test(primitivas)) problems.push('Las primitivas no asocian el error con su campo.');
        // Vacío genuino y ausencia de resultados por filtros son estados
        // distintos: confundirlos hace creer que el sistema está vacío cuando el
        // filtro es demasiado estrecho.
        if (!/function EmptyState/.test(primitivas) || !/function NoResults/.test(primitivas)) {
          problems.push('Las primitivas no distinguen vacío genuino de ausencia de resultados (PRD §5.4).');
        }
      }

      return problems.length
        ? fail(problems)
        : ok(['Accesibilidad estructural verificada. La validación con motor de reglas es alcance de la Fase 2.']);
    },
  },
  {
    id: 'C-F1-08',
    title: 'Fase 1: ningún alcance se concede por omisión de un campo',
    phases: [1],
    run() {
      // El defecto `D-F1-012`. El motor convertía «sin entidad» en «todas las
      // entidades», justo lo contrario de lo que la documentación prometía, y
      // ninguna prueba lo desmentía porque las fixtures traían el caso
      // defectuoso por omisión. Un alcance total legítimo existe; lo que no
      // puede es ser el efecto secundario de un campo vacío.
      const problems = [];

      const motor = read('src/platform/authz/policy.ts');
      if (motor === null) return fail(['No se encontró el motor de políticas.']);

      if (/legalEntityId === null \? \('ALL'/.test(motor)) {
        problems.push(
          "policy.ts convierte un nombramiento sin entidad en alcance 'ALL'. Sin entidad no se alcanza ninguna (docs/PERMISSIONS.md §6).",
        );
      }

      // Y el caso debe estar probado, no solo corregido.
      const pruebas = walk()
        .filter((file) => file.startsWith('tests/') && file.endsWith('.test.ts'))
        .map((file) => read(file) ?? '')
        .join('\n');
      if (!/legalEntityId: null/.test(pruebas)) {
        problems.push('Ninguna prueba ejercita el caso de un nombramiento sin entidad jurídica.');
      }

      // Un rol global con permisos es la vía por la que el defecto reaparece:
      // se nombra sin entidad porque su alcance declara que no la necesita.
      const semilla = read('prisma/seed/data/roles.ts') ?? '';
      for (const match of semilla.matchAll(/code: '(\w+)',[\s\S]*?scopeKind: 'GLOBAL'[\s\S]*?permissions: \[([\s\S]*?)\]/g)) {
        const permisos = (match[2] ?? '').split("'").length - 1;
        if (permisos > 0) {
          problems.push(`El rol ${match[1]} declara alcance GLOBAL y tiene permisos: no podría acotarse a una entidad.`);
        }
      }

      return problems.length
        ? fail(problems)
        : ok(['Ningún alcance se concede por omitir un campo, y el caso está probado.']);
    },
  },
  {
    id: 'C-F1-09',
    title: 'Fase 1: ningún valor normativo se inventa',
    phases: [1],
    run() {
      // El defecto `D-F1-013`. La semilla traía días de convocatoria,
      // porcentajes de firmas y la reelección permitida, atribuidos a secciones
      // del PRD que no los contienen porque las remite a los estatutos. Un
      // número inventado aquí es la regla con la que se convoca una asamblea.
      const semilla = read('prisma/seed/index.ts');
      if (semilla === null) return fail(['No se encontró la semilla.']);

      const problems = [];

      // La lista de pendientes nombra esas mismas claves a propósito, dentro de
      // cadenas. Se retira antes de buscar, para que declarar una ausencia no se
      // confunda con rellenarla.
      const sinPendientes = semilla.replace(/_pendientesDeEstatutos:\s*\[[\s\S]*?\],/, '');

      const remitidosAEstatutos = [
        'assemblyNoticeDaysOrdinary',
        'assemblyNoticeDaysExtraordinary',
        'extraordinaryAssemblyPetitionPercent',
        'reelectionAllowed',
        'statuteAmendmentMajority',
        'dissolutionMajority',
      ];

      for (const clave of remitidosAEstatutos) {
        // Vale enumerarlo como pendiente; no vale asignarle un valor.
        if (new RegExp(`\\b${clave}\\s*:`).test(sinPendientes)) {
          problems.push(
            `La semilla asigna un valor a "${clave}", que el PRD §9.3 y §9.4 remiten a los estatutos vigentes.`,
          );
        }
      }

      if (!/status: 'DRAFT'/.test(semilla)) {
        problems.push('El conjunto de reglas estatutarias no se siembra en borrador.');
      }
      if (!/effectiveFrom: null/.test(semilla)) {
        problems.push('El conjunto de reglas estatutarias declara una fecha de entrada en vigor que nadie ha aportado.');
      }
      if (!/_pendientesDeEstatutos/.test(semilla)) {
        problems.push('Las ausencias normativas no están declaradas: quedarían como huecos silenciosos.');
      }

      return problems.length
        ? fail(problems)
        : ok(['La semilla normativa solo contiene lo que el PRD enuncia, y declara lo que falta.']);
    },
  },
  {
    id: 'C-F1-10',
    title: 'Fase 1: lo que la documentación promete del entorno y de la semilla existe',
    phases: [1],
    run() {
      const problems = [];

      // La política de contenido no puede quedarse en la documentación.
      const seguridad = read('docs/SECURITY.md') ?? '';
      if (/Content-Security-Policy/.test(seguridad)) {
        const emisores = ['proxy.ts', 'next.config.ts']
          .map((file) => read(file) ?? '')
          .join('\n');
        if (!/Content-Security-Policy/.test(emisores)) {
          problems.push('docs/SECURITY.md declara una política de contenido que ninguna ruta emite (`D-F1-016`).');
        }
      }

      // El despliegue tiene que dejar el sistema operable, no solo migrado.
      const despliegue = read('vercel.json') ?? '';
      if (/migrate deploy/.test(despliegue) && !/db seed/.test(despliegue)) {
        problems.push('El despliegue migra pero no siembra: una instalación nueva quedaría sin roles ni permisos.');
      }

      // La salud del correo la declara el adaptador, no una lista aparte.
      const salud = read('src/platform/health/health-check.ts') ?? '';
      if (/EMAIL_PROVIDER/.test(salud) && !/mailerCapability/.test(salud)) {
        problems.push('La verificación de salud del correo no consulta al adaptador y puede dar por sano uno que no entrega.');
      }

      return problems.length
        ? fail(problems)
        : ok(['Lo que la documentación promete del entorno y del despliegue está implementado.']);
    },
  },
  {
    id: 'C-F1-11',
    title: 'Fase 1: ningún permiso comprobado en código se queda sin titular posible',
    phases: [1],
    run() {
      // El defecto que este control impide (`D-F4-003`, `D-F4-009`): una puerta
      // cerrada con una llave que no existe. El código comprueba el permiso, la
      // pantalla lo respeta, los tipos pasan, las pruebas positivas ni siquiera
      // llegan ahí porque nadie puede ejercerlo —y la función queda muerta sin
      // que se caiga nada. Pasó dos veces: `identity.user.disable` sin ningún
      // rol que lo tuviera, y `consent.revoke`, que no lo tenía absolutamente
      // nadie en toda la instalación.
      //
      // Titular posible es cualquiera de los tres: un rol de la semilla, la
      // lista cerrada del actor raíz o la concesión de un trabajo programado.
      const permisos = read('src/platform/authz/permissions.ts');
      if (permisos === null) return fail(['No se encontró el catálogo de permisos.']);
      const declarados = new Set([...permisos.matchAll(/define\('([^']+)'/g)].map((m) => m[1]));

      const corte = permisos.indexOf('SUPERADMIN_GRANTED');
      const otrasConcesiones = new Set(
        corte === -1
          ? []
          : [...permisos.slice(corte).matchAll(/'([a-z_]+\.[a-z_.]+)'/g)].map((m) => m[1]),
      );

      const semilla = read('prisma/seed/data/roles.ts');
      if (semilla === null) return fail(['No se encontró la semilla de roles.']);
      const enRoles = new Set([...semilla.matchAll(/'([a-z_]+\.[a-z_.]+)'/g)].map((m) => m[1]));

      // Solo se miran los permisos que el código **exige de verdad**, no todo el
      // catálogo: hay permisos declarados para fases que aún no se construyen, y
      // exigirles titular hoy obligaría a repartir facultades antes de que exista
      // la función que ejercen.
      const exigidos = new Set();
      for (const file of walk()) {
        if (!/^(src|app)\//.test(file) || !/\.tsx?$/.test(file)) continue;
        if (file === 'src/platform/authz/permissions.ts') continue;
        const contenido = read(file) ?? '';
        for (const match of contenido.matchAll(/can\(\s*[^,]+,\s*(?:[^,]*\?\s*)?'([a-z_]+\.[a-z_.]+)'/g)) {
          exigidos.add(match[1]);
        }
        for (const match of contenido.matchAll(/'([a-z_]+\.[a-z_.]+)'\s*:\s*'([a-z_]+\.[a-z_.]+)'/g)) {
          exigidos.add(match[1]);
          exigidos.add(match[2]);
        }
      }

      const problems = [];
      for (const permiso of [...exigidos].sort()) {
        if (!declarados.has(permiso)) continue;
        if (enRoles.has(permiso) || otrasConcesiones.has(permiso)) continue;
        problems.push(
          `"${permiso}" se comprueba en código y no lo tiene ningún rol, ni el actor raíz, ni un trabajo: la función que protege no puede ejercerla nadie.`,
        );
      }

      return problems.length
        ? fail(problems)
        : ok([`Los ${exigidos.size} permisos que el código exige tienen al menos un titular posible.`]);
    },
  },

  /* ---------------------------------------------------------------- */
  /* Fase 2 — Sistema de diseño, PWA, CMS y sitio público             */
  /* ---------------------------------------------------------------- */

  {
    id: 'C-F2-01',
    title: 'Fase 2: ninguna página usa contenido ficticio para aparentar terminación',
    phases: [2],
    run() {
      // El barrido de «lorem ipsum», «próximamente» y los marcadores de trabajo
      // inconcluso ya lo hace `C-UNI-04` sobre todo el repositorio. Este control
      // no lo repite: comprueba lo que **solo** esta fase puede incumplir, que
      // es llenar el sitio de contenido inventado para que se vea terminado.
      const problems = [];

      // La semilla no publica contenido editorial. Quién firma un comunicado del
      // sindicato es una decisión de la organización, y sembrarlo aquí sería
      // ponerle palabras en la boca (ADR-0040, ADR-0045).
      const semilla = read('prisma/seed/index.ts') ?? '';
      if (/contentPage\.(create|upsert)/.test(semilla)) {
        problems.push(
          'La semilla crea páginas del gestor de contenidos: el contenido editorial lo escribe la organización, no el repositorio.',
        );
      }

      // La ruta comodín dice la verdad cuando no hay nada publicado.
      const comodin = read('app/(publico)/[...slug]/page.tsx') ?? '';
      if (!/Todav[íi]a no hay contenido publicado/.test(comodin)) {
        problems.push('La ruta pública no declara el estado «sin contenido publicado» de forma explícita.');
      }
      if (!/notFound\(\)/.test(comodin)) {
        problems.push('Una dirección inexistente no devuelve 404: una página de disculpa con código 200 miente a los buscadores.');
      }

      // Y el mapa del sitio no anuncia lo que todavía está vacío: hacerlo sería
      // pedirle a un buscador que traiga gente a una pantalla sin contenido.
      const mapa = read('app/sitemap.ts') ?? '';
      if (!/publishedSitemapEntries/.test(mapa)) {
        problems.push('El mapa del sitio no se compone de lo realmente publicado.');
      }

      return problems.length
        ? fail(problems)
        : ok(['Ninguna pantalla finge estar terminada: lo que falta se dice, no se rellena ni se anuncia.']);
    },
  },
  {
    id: 'C-F2-02',
    title: 'Fase 2: la identidad diferencia módulos sin fragmentar el ecosistema',
    phases: [2],
    run() {
      const estilos = read('app/globals.css') ?? '';
      const problems = [];

      // Cada módulo tiene su acento, y todos comparten la misma luminosidad: es
      // lo que hace que se distingan sin que ninguno parezca de otro sitio.
      for (const modulo of ['indigo', 'alianza', 'cian', 'ceni', 'tools']) {
        if (!new RegExp(`--color-${modulo}-500:`).test(estilos)) {
          problems.push(`La paleta no declara el acento del módulo ${modulo}.`);
        }
      }

      // La prueba que lo comprueba de verdad, calculando sobre los tokens.
      const prueba = read('tests/unit/design/contrast.test.ts') ?? '';
      if (!/misma luminosidad|comparten|luminosidad/i.test(prueba)) {
        problems.push('Ninguna prueba comprueba que los acentos de módulo compartan luminosidad.');
      }

      return problems.length
        ? fail(problems)
        : ok(['Cada módulo tiene acento propio y todos comparten la misma familia.']);
    },
  },
  {
    id: 'C-F2-03',
    title: 'Fase 2: las rutas principales se verifican en móvil y en escritorio',
    phases: [2],
    run() {
      const config = read('playwright.config.ts') ?? '';
      const problems = [];

      if (config === '') problems.push('No existe playwright.config.ts.');
      if (!/name: 'movil'/.test(config)) problems.push('No hay perfil móvil declarado.');
      if (!/name: 'escritorio'/.test(config)) problems.push('No hay perfil de escritorio declarado.');

      const flujo = read('.github/workflows/calidad.yml') ?? '';
      if (!/test:e2e/.test(flujo)) {
        problems.push('La integración continua no ejecuta las pruebas de extremo a extremo: un umbral que solo se comprueba a mano no es un umbral.');
      }

      return problems.length
        ? fail(problems)
        : ok(['Los dos perfiles están declarados y la integración continua los ejecuta.']);
    },
  },
  {
    id: 'C-F2-04',
    title: 'Fase 2: el CMS maneja borrador, revisión, publicación y reversión',
    phases: [2],
    run() {
      const indice = read('src/modules/content/index.ts') ?? '';
      const faltan = ['createPage', 'editPage', 'submitForReview', 'reviewPage', 'publishPage', 'archivePage', 'revertPage'].filter(
        (caso) => !indice.includes(caso),
      );

      const problems = faltan.map((caso) => `El módulo de contenidos no expone ${caso}.`);

      // Publicar es un permiso distinto de escribir, y esa separación es lo que
      // hace que la revisión exista de verdad en lugar de ser decorativa.
      const permisos = read('src/platform/authz/permissions.ts') ?? '';
      if (!/content\.page\.write/.test(permisos) || !/content\.page\.publish/.test(permisos)) {
        problems.push('Escribir y publicar no son permisos separados: la revisión sería decorativa.');
      }

      // Y quien redacta no puede aprobarse a sí mismo.
      const publicacion = read('src/modules/content/application/publishing.ts') ?? '';
      if (!/authorId === actor\.userId/.test(publicacion)) {
        problems.push('Nada impide que quien redacta apruebe su propio contenido.');
      }

      return problems.length ? fail(problems) : ok(['El ciclo editorial completo existe y la revisión no es decorativa.']);
    },
  },
  {
    id: 'C-F2-05',
    title: 'Fase 2: la aplicación instalable no almacena expedientes sensibles',
    phases: [2],
    run() {
      const trabajador = read('public/sw.js');
      if (trabajador === null) return fail(['No existe public/sw.js: la aplicación instalable no tiene caché que auditar.']);

      const problems = [];

      for (const zona of ['/api/', '/gestion', '/superadmin', '/mi/', '/acceso', '/activar', '/recuperar']) {
        if (!trabajador.includes(`'${zona}'`)) {
          problems.push(`El trabajador de servicio no excluye la zona con sesión ${zona}.`);
        }
      }

      if (!/set-cookie/i.test(trabajador)) {
        problems.push('El trabajador de servicio no descarta las respuestas que traen cookie: son de alguien.');
      }
      if (!/no-store/.test(trabajador) || !/private/.test(trabajador)) {
        problems.push('El trabajador de servicio no respeta las directivas de caché del servidor.');
      }

      const prueba = read('tests/unit/pwa/service-worker.test.ts');
      if (prueba === null) {
        problems.push('Ninguna prueba comprueba las reglas de la caché.');
      }

      return problems.length
        ? fail(problems)
        : ok(['La caché nunca guarda respuestas con sesión, con cookie ni marcadas como privadas.']);
    },
  },
  {
    id: 'C-F2-06',
    title: 'Fase 2: los umbrales de accesibilidad y rendimiento se ejecutan, no se declaran',
    phases: [2],
    run() {
      const problems = [];

      const accesibilidad = read('tests/a11y/rutas-publicas.spec.ts');
      if (accesibilidad === null) {
        problems.push('No existe la suite de accesibilidad de las rutas públicas.');
      } else {
        if (!/critical|serious/.test(accesibilidad)) {
          problems.push('La suite de accesibilidad no filtra por gravedad crítica o seria, que es el umbral contratado.');
        }
        if (!/colorScheme: 'dark'/.test(accesibilidad)) {
          problems.push('La suite de accesibilidad no comprueba el tema oscuro.');
        }
      }

      const rendimiento = read('tests/e2e/performance/rutas-publicas.spec.ts');
      if (rendimiento === null) {
        problems.push('No existe la suite de rendimiento de las rutas públicas.');
      } else {
        if (!/largest-contentful-paint/.test(rendimiento)) problems.push('No se mide el pintado del contenido principal.');
        if (!/layout-shift/.test(rendimiento)) problems.push('No se mide la estabilidad visual.');
        if (!/2500/.test(rendimiento)) problems.push('El umbral de 2.5 s de docs/TEST_PLAN.md §8 no aparece en la suite.');
      }

      // La medición del sitio no puede guardar nada que señale a una persona.
      const medicion = read('prisma/schema/analytics.prisma') ?? '';
      for (const prohibida of ['ipHash', 'personId', 'sessionId', 'correlationId']) {
        if (new RegExp(`\\b${prohibida}\\b`).test(medicion)) {
          problems.push(`La medición agregada declara la columna ${prohibida}: dejaría de ser agregada.`);
        }
      }

      return problems.length
        ? fail(problems)
        : ok(['Los umbrales se ejecutan en cada verificación y la medición no guarda nada personal.']);
    },
  },
  {
    id: 'C-F2-07',
    title: 'Fase 2: ningún módulo de servidor importa un valor de un módulo de cliente',
    phases: [2],
    run() {
      // El defecto que este control impide (`D-F4-010`): un componente de
      // servidor importaba un arreglo declarado en un archivo `'use client'`. Del
      // lado de los tipos es un arreglo y todo compila; en ejecución lo que llega
      // al servidor es una referencia al cliente, así que el `.map` revienta y la
      // página devuelve un 500. No lo ve `tsc`, no lo ve el linter y no lo ven
      // las pruebas de integración: solo aparece abriendo la página.
      //
      // Se miran los valores, no los componentes: exportar un componente de
      // cliente y usarlo desde el servidor es justo para lo que sirve la
      // directiva. Lo que no cruza la frontera son las constantes.
      const problems = [];
      const declaraCliente = (contenido) => /^\s*['"]use client['"]/.test(contenido);
      const archivos = walk().filter((file) => /^(src|app)\//.test(file) && /\.tsx?$/.test(file));

      const valoresDeCliente = new Map();
      for (const file of archivos) {
        const contenido = read(file) ?? '';
        if (!declaraCliente(contenido)) continue;
        const nombres = [];
        for (const match of contenido.matchAll(/export\s+(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)) {
          const nombre = match[1];
          // `NombreEnMayusculaInicial` es un componente y `useAlgo` un hook: los
          // dos son cliente por definición y sí se importan desde el servidor.
          // `NOMBRE_EN_MAYUSCULAS` no: eso es una constante, y empezar por
          // mayúscula no la convierte en componente —confundirlos fue lo que
          // dejó pasar el defecto la primera vez que se escribió este control.
          if (/^[A-Z][a-z]/.test(nombre) || /^use[A-Z]/.test(nombre)) continue;
          nombres.push(nombre);
        }
        if (nombres.length > 0) valoresDeCliente.set(file.replace(/\.tsx?$/, ''), nombres);
      }

      for (const file of valoresDeCliente.size === 0 ? [] : archivos) {
        const contenido = read(file) ?? '';
        if (declaraCliente(contenido)) continue;
        const carpeta = file.slice(0, file.lastIndexOf('/'));
        for (const match of contenido.matchAll(/import\s+\{([^}]*)\}\s+from\s+'(\.[^']+)'/g)) {
          const relativa = `${carpeta}/${match[2]}`;
          const destino = relativa
            .split('/')
            .reduce((acc, parte) => {
              if (parte === '.' || parte === '') return acc;
              if (parte === '..') return acc.slice(0, -1);
              return [...acc, parte];
            }, [])
            .join('/');
          const exportados = valoresDeCliente.get(destino);
          if (exportados === undefined) continue;
          for (const bruto of match[1].split(',')) {
            const nombre = bruto.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim() ?? '';
            if (bruto.trim().startsWith('type ')) continue;
            if (!exportados.includes(nombre)) continue;
            problems.push(
              `${file} importa "${nombre}" de ${destino}, que es un módulo de cliente: en el servidor eso no es un valor sino una referencia, y la página falla al pintarse.`,
            );
          }
        }
      }

      return problems.length
        ? fail(problems)
        : ok(['Ningún módulo de servidor lee constantes declaradas dentro de un módulo de cliente.']);
    },
  },
  {
    id: 'C-F2-08',
    title: 'Fase 2: un módulo de acciones de servidor solo exporta funciones',
    phases: [2],
    run() {
      // El defecto que este control impide (`D-F4-012`): un archivo marcado
      // `'use server'` exportaba, además de sus acciones, una constante con el
      // estado inicial del formulario. Next lo rechaza en ejecución —«a "use
      // server" file can only export async functions»— y la pantalla entera
      // devuelve 500. Los tipos pasan, el linter calla y la compilación de
      // producción termina en verde: solo se ve abriendo la página.
      //
      // La frontera es la misma que la de `C-F2-07`, mirada desde el otro lado:
      // lo que cruza de servidor a cliente por esta vía son funciones, y nada
      // más. Las constantes van a un módulo sin directiva.
      const problems = [];
      const archivos = walk().filter((file) => /^(src|app)\//.test(file) && /\.tsx?$/.test(file));

      for (const file of archivos) {
        const contenido = read(file) ?? '';
        if (!/^\s*['"]use server['"]/.test(contenido)) continue;

        for (const match of contenido.matchAll(/^export\s+(const|let|var|class|enum)\s+([A-Za-z_$][\w$]*)/gm)) {
          // `export const algo = async (...)` sí es una acción.
          const resto = contenido.slice(match.index + match[0].length, match.index + match[0].length + 40);
          if (match[1] === 'const' && /^\s*(:[^=]*)?=\s*async\b/.test(resto)) continue;
          problems.push(
            `${file} exporta "${match[2]}", que no es una función: un módulo 'use server' solo exporta funciones asíncronas, y Next devuelve 500 al pintar la pantalla que lo importe.`,
          );
        }

        // Reexportar un valor tiene el mismo efecto y no lo ve el patrón de
        // arriba, porque la declaración vive en otro sitio.
        for (const match of contenido.matchAll(/^export\s*\{([^}]*)\}\s*(?:from\s*'[^']+')?\s*;?\s*$/gm)) {
          for (const bruto of match[1].split(',')) {
            const nombre = bruto.trim();
            if (nombre === '' || nombre.startsWith('type ')) continue;
            const local = nombre.split(/\s+as\s+/)[0]?.trim() ?? '';
            if (new RegExp(`export\\s+async\\s+function\\s+${local}\\b`).test(contenido)) continue;
            if (new RegExp(`async\\s+function\\s+${local}\\b`).test(contenido)) continue;
            problems.push(
              `${file} reexporta "${nombre}" desde un módulo 'use server': si no es una función asíncrona, la pantalla que lo importe devuelve 500.`,
            );
          }
        }
      }

      return problems.length
        ? fail(problems)
        : ok(['Los módulos de acciones de servidor exportan solo funciones asíncronas.']);
    },
  },
  {
    id: 'C-F1-12',
    title: 'Fase 1: quien reparte la bandeja de salida registra antes a quien escucha',
    phases: [1],
    run() {
      // El defecto que este control impide: el registro de manejadores vive en
      // memoria del proceso y aquí cada invocación arranca en frío. Un
      // despachador que reparte sin registrar marca los mensajes como
      // entregados con la nota «sin manejadores registrados» —y el hecho se
      // pierde en silencio mientras la bandeja dice que todo fue bien—.
      const problems = [];
      const archivos = walk().filter((file) => /^(src|app)\//.test(file) && /\.tsx?$/.test(file));

      let reparte = 0;
      for (const file of archivos) {
        const contenido = read(file) ?? '';
        if (!/\bdispatchOutbox\s*\(/.test(contenido)) continue;
        if (file === 'src/platform/jobs/queue.ts') continue;
        reparte += 1;
        if (!/registerDomainEventHandlers\s*\(/.test(contenido)) {
          problems.push(
            `${file} reparte la bandeja de salida sin llamar a registerDomainEventHandlers(): los mensajes se darían por entregados sin que nadie los escuchara.`,
          );
        }
      }

      if (reparte === 0) problems.push('Nadie reparte la bandeja de salida: los eventos de dominio no llegarían nunca.');

      return problems.length
        ? fail(problems)
        : ok(['Quien reparte la bandeja de salida registra primero a quien escucha.']);
    },
  },
  {
    id: 'C-F3-07',
    title: 'Fase 3: todo cobro que pasa a confirmado lo anuncia',
    phases: [3],
    run() {
      // Un cobro llega a `SUCCEEDED` desde cinco sitios distintos. Lo que
      // depende de que esté cobrado —activar una membresía— no puede vivir
      // pegado a los cinco: añadir un sexto camino dejaría a alguien pagado y
      // sin lo que pagó, sin que nada fallara (ADR-0082).
      const problems = [];
      const archivos = walk().filter(
        (file) => /^src\/modules\/billing\//.test(file) && /\.ts$/.test(file),
      );

      for (const file of archivos) {
        if (file.endsWith('payment-events.ts')) continue;
        const contenido = read(file) ?? '';

        // Se busca el estado **dentro** de la escritura sobre `payment`, no en
        // cualquier parte del archivo. La primera versión de este control
        // señalaba `refunds.ts`, que pone en SUCCEEDED una devolución —no un
        // cobro— y por separado toca la tabla de cobros: un control que acusa a
        // un archivo correcto enseña a ignorar los controles.
        let confirma = false;
        for (const match of contenido.matchAll(/\bpayment\.(create|update|updateMany)\s*\(/g)) {
          const bloque = contenido.slice(match.index, match.index + 700);
          if (/\bstatus:\s*'SUCCEEDED'/.test(bloque)) confirma = true;
        }
        if (!confirma) continue;

        if (!/announcePaymentSucceeded\s*\(/.test(contenido)) {
          problems.push(
            `${file} deja un cobro en SUCCEEDED y no lo anuncia: lo que dependa de ese cobro no se entera.`,
          );
        }
      }

      return problems.length
        ? fail(problems)
        : ok(['Cada sitio que confirma un cobro publica el hecho en la bandeja de salida.']);
    },
  },
  {
    id: 'C-F3-01',
    title: 'Fase 3: ningún acceso se activa por la página de retorno del navegador',
    phases: [3],
    run() {
      // El criterio 1 de la fase, y el que más caro sale ignorar: la dirección
      // de retorno la abre cualquiera, sin haber pagado. Si el cobro se
      // confirmara ahí, bastaría con visitarla para darse por pagado.
      const problems = [];

      const cobro = read('src/modules/billing/application/checkout.ts') ?? '';
      if (!/REQUIRES_PAYMENT/.test(cobro)) {
        problems.push('El cobro no nace sin confirmar: no se encuentra el estado inicial en `checkout.ts`.');
      }

      const retorno = read('app/(portal)/mi/pagos/[publicId]/page.tsx') ?? '';
      if (retorno === '') {
        problems.push('No existe la pantalla de retorno del cobro.');
      } else {
        if (/status:\s*'SUCCEEDED'/.test(retorno) || /paidAt/.test(retorno.replace(/pago\.data\.paidAt/g, ''))) {
          problems.push('La pantalla de retorno escribe el estado del cobro: eso lo decide el webhook.');
        }
        if (!/confirmando/i.test(retorno)) {
          problems.push('La pantalla de retorno no dice que el pago se está confirmando.');
        }
      }

      // Y la comprobación de fondo: solo el manejador de webhooks mueve un
      // pago a pagado.
      //
      // Se busca una **escritura sobre `payment`** que ponga ese estado, no la
      // palabra suelta: la primera versión de este control acusaba a la cola de
      // trabajos, donde `SUCCEEDED` es el estado de un trabajo, y a la
      // conciliación, donde aparece dentro de un filtro de consulta. Un control
      // que acusa de más enseña a ignorarlo (`D-F3-013`).
      const escriben = walk().filter((file) => {
        if (!/^(app|src)\//.test(file) || !/\.tsx?$/.test(file)) return false;
        const contenido = read(file) ?? '';
        return /\bpayment\.(update|updateMany|create)\(\s*\{[\s\S]{0,800}?status:\s*'SUCCEEDED'/.test(contenido);
      });
      const permitidos = [
        'src/modules/billing/application/webhook-processing.ts',
        'src/modules/billing/application/manual-payments.ts',
        'src/modules/billing/application/checkout.ts',
        'src/modules/billing/application/refunds.ts',
      ];
      for (const file of escriben) {
        if (!permitidos.includes(file)) {
          problems.push(`${file} marca un cobro como pagado, y eso solo lo deciden el webhook o la aprobación manual.`);
        }
      }

      return problems.length
        ? fail(problems)
        : ok(['El cobro nace sin confirmar y solo el webhook firmado o una aprobación con doble control lo mueven.']);
    },
  },
  {
    id: 'C-F3-02',
    title: 'Fase 3: repetir un webhook no duplica movimientos',
    phases: [3],
    run() {
      const problems = [];

      const esquema = read('prisma/schema/finance.prisma') ?? '';
      if (!/stripeEventId\s+String\s+@unique/.test(esquema)) {
        problems.push('El identificador del evento de la pasarela no es único: un reenvío se guardaría dos veces.');
      }
      if (!/idempotencyKey\s+String\s+@unique/.test(esquema)) {
        problems.push('Los cobros no tienen clave de idempotencia única: un reenvío podría duplicar un ingreso.');
      }

      const proceso = read('src/modules/billing/application/webhook-processing.ts') ?? '';
      if (!/stripe:invoice:/.test(proceso)) {
        problems.push('El ingreso de una renovación no se ancla al documento de la pasarela.');
      }
      if (!/updateMany/.test(proceso)) {
        problems.push('Las transiciones de estado no son condicionales: un evento viejo podría pisar uno nuevo.');
      }

      const pruebas = read('tests/integration/billing-webhooks.test.ts') ?? '';
      if (!/evento repetido/.test(pruebas)) {
        problems.push('No hay prueba del evento repetido, que el PRD §24 contrata.');
      }
      if (!/fuera de orden/.test(pruebas)) {
        problems.push('No hay prueba del evento fuera de orden, que el PRD §24 contrata.');
      }
      if (!/cuenta cruzada/.test(pruebas)) {
        problems.push('No hay prueba de la cuenta cruzada, que el PRD §24 contrata.');
      }

      return problems.length
        ? fail(problems)
        : ok(['El reenvío no duplica: identificador único, clave de idempotencia y transiciones condicionales.']);
    },
  },
  {
    id: 'C-F3-03',
    title: 'Fase 3: las dos entidades se cobran y se concilian por separado',
    phases: [3],
    run() {
      const problems = [];

      const esquema = read('prisma/schema/finance.prisma') ?? '';
      // Las ocho tablas de dinero llevan entidad receptora obligatoria.
      for (const modelo of ['Payment', 'LedgerEntry', 'Reconciliation', 'AssetRegister', 'BillingAccount']) {
        const bloque = new RegExp(`model ${modelo}\\s*\\{[^}]*\\}`, 's').exec(esquema)?.[0] ?? '';
        if (!/legalEntityId\s+String\s+@db\.Uuid/.test(bloque)) {
          problems.push(`El modelo ${modelo} no exige entidad jurídica: dos personas morales acabarían mezcladas.`);
        }
      }

      const cuentas = read('src/platform/payments/accounts.ts') ?? '';
      if (!/FUERZA_INDIGO: 'FUERZA'/.test(cuentas) || !/ALIANZA_INDIGO: 'ALIANZA'/.test(cuentas)) {
        problems.push('La correspondencia entre entidad y cuenta de cobro no está declarada en un solo sitio.');
      }
      if (!/null/.test(cuentas)) {
        problems.push('Una entidad sin cuenta asignada no devuelve nulo: se supondría una cuenta.');
      }

      // Una dirección de webhook por cuenta, y no una compartida.
      const ruta = walk().find((file) => /app\/api\/v1\/webhooks\/stripe\/.*route\.ts$/.test(file));
      if (ruta === undefined) problems.push('No existe la ruta de webhooks por cuenta.');

      return problems.length
        ? fail(problems)
        : ok(['Cada entidad cobra por su cuenta, con su secreto y su dirección, y el modelo lo conserva en cada movimiento.']);
    },
  },
  {
    id: 'C-F3-04',
    title: 'Fase 3: ningún importe es de coma flotante ni vive en una pantalla',
    phases: [3],
    run() {
      const problems = [];

      const esquema = read('prisma/schema/finance.prisma') ?? '';
      for (const linea of esquema.split('\n')) {
        if (/(amountMinor|ValueMinor|TotalMinor|differenceMinor)/.test(linea) && !/BigInt/.test(linea)) {
          if (!/\/\/\//.test(linea)) {
            problems.push(`Una columna de dinero no es entera: ${linea.trim()}`);
          }
        }
        if (/\b(Float|Decimal)\b/.test(linea) && !/\/\/\//.test(linea)) {
          problems.push(`El esquema financiero declara un tipo de coma flotante: ${linea.trim()}`);
        }
      }

      // Ningún importe sembrado: una cuota la acuerda la organización.
      const semilla = read('prisma/seed/index.ts') ?? '';
      if (/catalogPrice\.(create|upsert)/.test(semilla)) {
        problems.push('La semilla crea precios: una cuota sindical es una cantidad que acuerda la organización.');
      }

      // La conversión de pesos a centavos ocurre en un solo sitio.
      //
      // Se mira la **línea**, no el archivo, y solo cuando en ella hay dinero:
      // la primera versión acusaba al indicador de progreso, que multiplica por
      // cien para sacar un porcentaje (`D-F3-013`).
      for (const file of walk()) {
        if (!/^(app|src)\//.test(file) || !/\.tsx?$/.test(file)) continue;
        if (/i18n\/format\.ts$/.test(file)) continue;

        for (const linea of (read(file) ?? '').split('\n')) {
          if (!/[*/]\s*100\b/.test(linea)) continue;
          if (!/Minor|centavo|amount|importe/i.test(linea)) continue;
          problems.push(`${file} convierte dinero por cien fuera de \`platform/i18n\`: ${linea.trim()}`);
        }
      }

      return problems.length
        ? fail(problems)
        : ok(['Todo importe es entero en unidades menores, ninguno viene sembrado y la conversión vive en un solo sitio.']);
    },
  },
  {
    id: 'C-F3-05',
    title: 'Fase 3: lo que mueve dinero exige motivo, doble control y auditoría',
    phases: [3],
    run() {
      const problems = [];

      const permisos = read('src/platform/authz/permissions.ts') ?? '';
      // Registrar y aprobar son dos permisos; pedir y aprobar también.
      for (const par of [
        ['billing.payment.register_manual', 'billing.payment.approve_manual'],
        ['billing.refund.request', 'billing.refund.approve'],
      ]) {
        for (const permiso of par) {
          if (!permisos.includes(`'${permiso}'`)) problems.push(`Falta el permiso ${permiso}.`);
        }
      }

      // Y ninguna cartera de la semilla tiene los dos de un par.
      const roles = read('prisma/seed/data/roles.ts') ?? '';
      for (const bloque of roles.split('code: ').slice(1)) {
        const nombre = /'([A-Z_]+)'/.exec(bloque)?.[1] ?? 'desconocido';
        const cuerpo = bloque.split('},')[0] ?? '';
        if (cuerpo.includes("'billing.payment.register_manual'") && cuerpo.includes("'billing.payment.approve_manual'")) {
          problems.push(`El rol ${nombre} registra y aprueba pagos manuales: el doble control sería una casilla.`);
        }
        if (cuerpo.includes("'billing.refund.request'") && cuerpo.includes("'billing.refund.approve'")) {
          problems.push(`El rol ${nombre} pide y aprueba devoluciones.`);
        }
      }

      // La comprobación por persona, que es lo que protege cuando alguien
      // acumula las dos carteras.
      //
      // Se busca el **motivo interno** de la denegación y no la comparación,
      // porque la comparación también aparece en el listado —para no ofrecerle
      // a alguien un botón que le van a rechazar— y el control pasaba mirando
      // esa línea aunque se hubiera borrado la que de verdad impide el acto
      // (`D-F3-013`). El motivo interno solo existe donde se deniega.
      const manuales = read('src/modules/billing/application/manual-payments.ts') ?? '';
      if (!/doble control: quien registra un pago manual no puede aprobarlo/.test(manuales)) {
        problems.push('Quien registra un pago manual podría aprobarlo si acumulara los dos permisos.');
      }
      if (!/doble control: quien registra un pago manual no puede resolverlo/.test(manuales)) {
        problems.push('Quien registra un pago manual podría rechazarlo si acumulara los dos permisos.');
      }
      const devoluciones = read('src/modules/billing/application/refunds.ts') ?? '';
      if (!/doble control: quien pide una devolución no puede aprobarla/.test(devoluciones)) {
        problems.push('Quien pide una devolución podría aprobarla si acumulara los dos permisos.');
      }
      if (!/doble control: quien pide una devolución no puede resolverla/.test(devoluciones)) {
        problems.push('Quien pide una devolución podría rechazarla si acumulara los dos permisos.');
      }

      // Un ajuste del libro exige motivo escrito.
      const libro = read('src/modules/billing/application/ledger.ts') ?? '';
      if (!/reason:\s*z\s*\n?\s*\.string\(\)[\s\S]{0,200}min\(15/.test(libro) && !/min\(15/.test(libro)) {
        problems.push('Un ajuste del libro no exige motivo escrito.');
      }

      // Y el libro no se puede editar ni borrar desde la aplicación.
      const migraciones = walk().filter((file) => /^prisma\/migrations\/.*\/migration\.sql$/.test(file));
      const sql = migraciones.map((file) => read(file) ?? '').join('\n');
      if (!/REVOKE\s+UPDATE,\s*DELETE,\s*TRUNCATE\s+ON\s+TABLE\s+"ledger_entry"/.test(sql)) {
        problems.push('Las migraciones no revocan la edición del libro auxiliar.');
      }
      if (!/REVOKE\s+UPDATE,\s*DELETE,\s*TRUNCATE\s+ON\s+TABLE\s+"asset_movement"/.test(sql)) {
        problems.push('Las migraciones no revocan la edición de los movimientos patrimoniales.');
      }

      return problems.length
        ? fail(problems)
        : ok(['Registrar y aprobar están separados por permiso y por persona, y el libro no se edita: lo impide el motor.']);
    },
  },
  {
    id: 'C-F3-06',
    title: 'Fase 3: los cinco estados de un pago están probados de extremo a extremo',
    phases: [3],
    run() {
      const pruebas = read('tests/integration/billing-payment-states.test.ts') ?? '';
      if (pruebas === '') return fail(['No existe la suite de estados de pago que el PRD §24 contrata.']);

      const problems = [];
      for (const [estado, etiqueta] of [
        ['pendiente', 'pendiente'],
        ['exitoso', 'exitoso'],
        ['fallido', 'fallido'],
        ['reembolsado', 'reembolsado'],
        ['disputado', 'disputado'],
      ]) {
        if (!new RegExp(`describe\\('${estado}`).test(pruebas)) {
          problems.push(`Falta el escenario de pago ${etiqueta}.`);
        }
      }

      // No basta con que el estado se guarde: la persona tiene que verlo.
      if (!/comoLoVeLaPersona/.test(pruebas)) {
        problems.push('Los escenarios no comprueban lo que la persona ve de su propio cobro.');
      }

      return problems.length
        ? fail(problems)
        : ok(['Los cinco estados se recorren enteros y se comprueba lo que la persona ve de cada uno.']);
    },
  },

  {
    id: 'C-F4-01',
    title: 'Fase 4: el verificador de credenciales no se sirve de una copia',
    phases: [4],
    run() {
      // El PRD §24 Fase 4 contrata que «una credencial revocada se refleja
      // inmediatamente en el verificador». Una página cacheada convierte
      // «inmediatamente» en «cuando expire la caché», y eso no lo delata
      // ninguna prueba de dominio: la base diría que está revocada mientras la
      // pantalla pública sigue enseñándola como buena.
      // Se miran las rutas que **responden** una verificación, no todas las del
      // área: el formulario de entrada no afirma nada sobre ninguna credencial,
      // y exigirle la declaración sería ruido que enseña a ignorar el control.
      // Buscar por la llamada, y no por la carpeta, además cubre cualquier ruta
      // que alguien añada mañana en otro sitio.
      const problems = [];
      const archivos = walk().filter(
        (file) =>
          /^app\//.test(file) &&
          /\/(page|route)\.tsx?$/.test(file) &&
          /\bverifyCredential\s*\(/.test(read(file) ?? ''),
      );

      if (archivos.length === 0) {
        return fail(['Ninguna ruta responde una verificación: el verificador del PRD §7.4 no existe.']);
      }

      for (const file of archivos) {
        const contenido = read(file) ?? '';

        if (!/export const dynamic\s*=\s*'force-dynamic'/.test(contenido)) {
          problems.push(`${file} no se declara dinámica: su respuesta se puede servir de una copia.`);
        }
        const revalidate = /export const revalidate\s*=\s*(\d+)/.exec(contenido);
        if (revalidate !== null && Number(revalidate[1]) > 0) {
          problems.push(`${file} declara revalidate=${revalidate[1]}: la revocación tardaría eso en verse.`);
        }
      }

      return problems.length
        ? fail(problems)
        : ok(['El verificador se lee en vivo: ninguna de sus rutas admite copia cacheada.']);
    },
  },

  {
    id: 'C-F4-02',
    title: 'Fase 4: los estados derivados de una credencial no se guardan',
    phases: [4],
    run() {
      // Una credencial no tiene vida propia: acredita una membresía. Que esté
      // suspendida o vencida se **deriva** al leerla —de la membresía y del
      // calendario— y nunca se escribe. Escribirlo crearía una segunda verdad
      // que el verificador ignora, y la pantalla de gestión y la pública
      // pasarían a decir cosas distintas de la misma credencial.
      const problems = [];
      const archivos = walk().filter(
        (file) => /^(src|app)\//.test(file) && /\.tsx?$/.test(file) && !/^src\/generated\//.test(file),
      );

      for (const file of archivos) {
        const contenido = read(file) ?? '';
        for (const match of contenido.matchAll(/\bmemberCredential\.(create|update|updateMany|upsert)\s*\(/g)) {
          const bloque = contenido.slice(match.index, match.index + 900);
          const derivado = /\bstatus:\s*'(SUSPENDED|EXPIRED)'/.exec(bloque);
          if (derivado !== null) {
            problems.push(
              `${file} escribe status: '${derivado[1]}' en una credencial: ese estado se deriva al leerla, no se guarda.`,
            );
          }
        }
      }

      // Y la derivación tiene que existir y usarse: si nadie llama a
      // `estadoVigente`, el estado que se enseña vuelve a ser el de la columna.
      const modulo = read('src/modules/membership/application/credentials.ts') ?? '';
      if (!/export function estadoVigente\s*\(/.test(modulo)) {
        problems.push('No existe `estadoVigente`: el estado que se enseña saldría de la columna.');
      }
      if ((modulo.match(/estadoVigente\s*\(/g) ?? []).length < 3) {
        problems.push('`estadoVigente` apenas se usa: alguna ruta de lectura está leyendo la columna.');
      }

      return problems.length
        ? fail(problems)
        : ok(['Suspensión y vencimiento se derivan al leer la credencial; ninguna ruta los escribe.']);
    },
  },

  {
    id: 'C-F4-03',
    title: 'Fase 4: una consulta sobre una persona no se resuelve con la facultad de mirar a cualquiera',
    phases: [4],
    run() {
      // El defecto que impide (`D-F4-019`): `personConsents` recibía el
      // identificador de la persona **por parámetro** y decidía con una sola
      // facultad, `consent.read`, que tenían tanto la Secretaría como cualquier
      // agremiada. Bastaba con pedir el identificador de otra para leer su
      // historial de consentimientos.
      //
      // La regla: si el catálogo define la pareja `X` / `X_own`, ninguna función
      // que reciba un `personId` puede decidir mencionando solo `X`. O resuelve
      // las dos, o está tratando lo propio y lo ajeno como la misma cosa.
      const problems = [];

      const catalogo = read('src/platform/authz/permissions.ts') ?? '';
      const conPareja = new Set();
      for (const match of catalogo.matchAll(/define\('([a-z0-9_.]+)_own'/g)) {
        conPareja.add(match[1]);
      }
      if (conPareja.size === 0) {
        return fail(['El catálogo no declara ninguna facultad sobre lo propio: la pareja no existe.']);
      }

      const archivos = walk().filter(
        (file) => /^src\/(modules|platform)\//.test(file) && /\.ts$/.test(file) && !/^src\/generated\//.test(file),
      );

      for (const file of archivos) {
        const contenido = read(file) ?? '';
        // Se parte por declaración de función: el ámbito de la comprobación es
        // la función, no el archivo. Un archivo que resuelve la pareja en otra
        // función no absuelve a esta.
        const trozos = contenido.split(/\n(?=(?:export )?(?:async )?function )/);
        for (const trozo of trozos) {
          const nombre = /(?:export )?(?:async )?function (\w+)/.exec(trozo)?.[1] ?? '(anónima)';

          // Solo las que reciben la persona **por parámetro**: ahí está el
          // riesgo de que quien pregunta y quien es preguntado se separen.
          //
          // La lista de parámetros se recorta contando paréntesis, no cortando
          // en la primera llave: una firma como `input: { personId: string }`
          // lleva una llave **dentro** de los parámetros, y cortar ahí dejaba
          // fuera justo el nombre que se busca. La primera versión de este
          // control daba verde con `personConsents` delante, que es el defecto
          // que motivó escribirlo.
          const abre = trozo.indexOf('(');
          if (abre === -1) continue;
          let profundidad = 0;
          let cierra = -1;
          for (let i = abre; i < trozo.length; i += 1) {
            if (trozo[i] === '(') profundidad += 1;
            if (trozo[i] === ')') {
              profundidad -= 1;
              if (profundidad === 0) { cierra = i; break; }
            }
          }
          if (cierra === -1) continue;
          const firma = trozo.slice(abre, cierra + 1);
          if (!/\bpersonId\b/.test(firma)) continue;

          for (const match of trozo.matchAll(/\bcan\(\s*[^,]+,\s*'([a-z0-9_.]+)'/g)) {
            const permiso = match[1];
            if (permiso.endsWith('_own')) continue;
            if (!conPareja.has(permiso)) continue;
            if (trozo.includes(`'${permiso}_own'`)) continue;
            problems.push(
              `${file} · ${nombre}() decide con '${permiso}' sobre un personId recibido, sin resolver '${permiso}_own': lo propio y lo ajeno quedan igualados.`,
            );
          }
        }
      }

      return problems.length
        ? fail(problems)
        : ok(['Toda consulta sobre una persona distingue mirar lo propio de mirar lo ajeno.']);
    },
  },

  {
    id: 'C-F4-04',
    title: 'Fase 4: ninguna pantalla usa un token de color que no existe',
    phases: [4],
    run() {
      // Un `var(--color-que-no-existe)` **no falla**: la propiedad se queda sin
      // valor y el navegador hereda lo que hubiera. Dos pantallas pedían
      // `--color-on-accent`, que nunca se declaró, y el texto de su botón
      // principal salía en tinta oscura sobre el índigo del acento: contraste
      // insuficiente en el llamado a la acción más importante de la pantalla
      // (defecto `D-F4-021`).
      //
      // No lo ven los tipos, ni el linter, ni ninguna prueba de dominio. Lo vio
      // la suite de accesibilidad, que llegó tarde: este control lo caza antes,
      // y sin necesidad de levantar un navegador.
      const css = read('app/globals.css') ?? '';
      if (css === '') return fail(['No se encuentra la hoja de estilos con los tokens.']);

      const declarados = new Set();
      for (const match of css.matchAll(/(--[\w-]+)\s*:/g)) declarados.add(match[1]);

      const problems = [];
      const archivos = walk().filter((file) => /^(app|src)\//.test(file) && /\.tsx?$/.test(file));

      for (const file of archivos) {
        const contenido = read(file) ?? '';
        for (const match of contenido.matchAll(/var\((--color-[\w-]+)\)/g)) {
          const token = match[1];
          if (!declarados.has(token)) {
            problems.push(`${file} usa ${token}, que no está declarado: el color se hereda en silencio.`);
          }
        }
      }

      return problems.length
        ? fail([...new Set(problems)])
        : ok(['Todo token de color que una pantalla pide está declarado en la hoja de estilos.']);
    },
  },

  {
    id: 'C-F5-01',
    title: 'Fase 5: la urna no guarda tiempo ni identidad',
    phases: [5],
    run() {
      // La garantía del PRD §9.5 no se sostiene en una política de acceso: se
      // sostiene en la forma de dos tablas. Si alguien añadiera `createdAt` a
      // `Ballot` «para depurar», o le cambiara la clave primaria a UUIDv7, el
      // secreto del voto quedaría roto sin que ninguna prueba de dominio lo
      // notara: los conteos seguirían saliendo bien.
      const esquema = read('prisma/schema/voting.prisma') ?? '';
      if (esquema === '') return fail(['No se encuentra el esquema de votación.']);

      const problems = [];

      const ballot = esquema.match(/model Ballot \{([\s\S]*?)\n\}/);
      if (ballot === null) return fail(['No existe el modelo Ballot.']);
      const cuerpo = ballot[1] ?? '';

      for (const prohibida of ['createdAt', 'updatedAt', 'castAt', 'membershipId', 'personId', 'userId', 'ipHash']) {
        if (new RegExp(`\\b${prohibida}\\b`).test(cuerpo)) {
          problems.push(`Ballot tiene "${prohibida}": basta para emparejar una boleta con quien la depositó.`);
        }
      }
      if (!/@default\(uuid\(4\)\)/.test(cuerpo)) {
        problems.push('Ballot no usa UUIDv4: un identificador ordenable codifica el instante del depósito.');
      }

      const gastada = esquema.match(/model SpentVoteCredential \{([\s\S]*?)\n\}/);
      if (gastada === null) return fail(['No existe el modelo SpentVoteCredential.']);
      const cuerpoGastada = gastada[1] ?? '';
      for (const prohibida of ['createdAt', 'updatedAt', 'membershipId', 'personId', 'spentAt']) {
        if (new RegExp(`\\b${prohibida}\\b`).test(cuerpoGastada)) {
          problems.push(`SpentVoteCredential tiene "${prohibida}": permitiría correlacionar por proximidad temporal.`);
        }
      }
      if (!/@default\(uuid\(4\)\)/.test(cuerpoGastada)) {
        problems.push('SpentVoteCredential no usa UUIDv4.');
      }

      // El acuse se emite al entregar la credencial, no al depositar: si
      // naciera en la transacción de la boleta, el orden físico las emparejaría.
      const acuse = esquema.match(/model VoteReceipt \{([\s\S]*?)\n\}/);
      if (acuse !== null && !/issuedOn\s+DateTime\s+@db\.Date/.test(acuse[1] ?? '')) {
        problems.push('VoteReceipt guarda la hora de emisión y no solo la fecha civil.');
      }

      return problems.length
        ? fail(problems)
        : ok(['La urna no tiene tiempo ni identidad, y su identificador no codifica el instante del depósito.']);
    },
  },

  {
    id: 'C-F5-02',
    title: 'Fase 5: el depósito de la boleta no recibe actor ni deja asiento',
    phases: [5],
    run() {
      // Complemento del anterior, del lado del código. Un asiento de auditoría
      // nacido en la misma transacción que la boleta lleva actor e instante, y
      // eso deshace en la bitácora lo que el modelo protege en la urna. Que el
      // caso de uso ni siquiera **reciba** un actor es la forma de que nadie lo
      // use por descuido.
      const fuente = read('src/modules/voting/application/processes.ts') ?? '';
      if (fuente === '') return fail(['No se encuentra el módulo de votación.']);

      const firma = fuente.match(/export async function castBallot\(([\s\S]*?)\)\s*:/);
      if (firma === null) return fail(['No existe el caso de uso que deposita la boleta.']);
      const problems = [];
      if (/ActorContext/.test(firma[1] ?? '')) {
        problems.push('castBallot recibe un actor: tenerlo invita a usarlo, y usarlo crea el vínculo.');
      }

      const cuerpo = fuente.slice(fuente.indexOf('export async function castBallot'));
      const hastaSiguiente = cuerpo.slice(0, cuerpo.indexOf('\nexport ', 10));
      if (/recordAudit/.test(hastaSiguiente)) {
        problems.push('El depósito escribe un asiento de auditoría: llevaría actor e instante junto a la boleta.');
      }

      return problems.length
        ? fail(problems)
        : ok(['El depósito no recibe actor ni deja asiento; lo demás del proceso sí se asienta.']);
    },
  },

  {
    id: 'C-F5-03',
    title: 'Fase 5: el padrón congelado es inmutable en el motor, no en la aplicación',
    phases: [5],
    run() {
      // «El padrón no se recalcula» es una promesa hasta que la base la impone.
      // Se comprueba que la migración retire el privilegio de actualización y
      // borrado sobre las tablas cuya inmutabilidad sostiene el quórum y el
      // voto.
      const migraciones = walk().filter((file) => /^prisma\/migrations\/.*\/migration\.sql$/.test(file));
      const sql = migraciones.map((file) => read(file) ?? '').join('\n');
      if (sql === '') return fail(['No hay migraciones que revisar.']);

      const problems = [];
      for (const tabla of ['ballot', 'spent_vote_credential', 'assembly_roster_snapshot', 'assembly_roster_entry']) {
        const patron = new RegExp(`REVOKE\\s+UPDATE\\s*,\\s*DELETE\\s+ON\\s+"${tabla}"`, 'i');
        if (!patron.test(sql)) {
          problems.push(`Nadie retira UPDATE y DELETE sobre "${tabla}": su inmutabilidad depende de que la aplicación se porte bien.`);
        }
      }

      return problems.length
        ? fail(problems)
        : ok(['La urna y el padrón congelado son inmutables para las credenciales de la aplicación.']);
    },
  },

  {
    id: 'C-F5-04',
    title: 'Fase 5: un cargo vencido pierde acceso sin que nadie intervenga',
    phases: [5],
    run() {
      // El criterio del PRD §24 Fase 5. Se comprueba la cadena entera: que la
      // designación ate el acceso al periodo, que el trabajo programado exista
      // y que ese trabajo cierre los cargos vencidos además de los roles.
      const nombramiento = read('src/modules/governance/application/office-terms.ts') ?? '';
      const roles = read('src/modules/access/application/role-assignment.ts') ?? '';
      const ruta = read('app/api/v1/cron/role-expiry/route.ts') ?? '';

      const problems = [];
      if (!/roleAssignmentId/.test(nombramiento) || !/endsAt/.test(nombramiento)) {
        problems.push('La designación no ata el acceso al periodo del cargo.');
      }
      // Se busca la **llamada**, no el nombre: dejar la importación y borrar la
      // invocación es exactamente el error que este control tiene que ver, y
      // buscar el nombre a secas lo dejaba pasar.
      if (!/revokeExpiredOfficeAccess\s*\(/.test(roles)) {
        problems.push('El trabajo que revoca roles vencidos no cierra los cargos vencidos.');
      }
      if (!/expireDueRoleAssignments/.test(ruta)) {
        problems.push('No hay trabajo programado que ejecute la revocación.');
      }
      if ((nombramiento.match(/revokePowersOfTerm\s*\(/g) ?? []).length < 2) {
        problems.push(
          'Un cargo que vence o que se concluye antes de tiempo no revoca los poderes que salieron de él: hacen falta las dos llamadas.',
        );
      }

      return problems.length
        ? fail(problems)
        : ok(['Nombrar concede el acceso atado al periodo, y el trabajo programado lo retira al vencer, con sus poderes.']);
    },
  },

  {
    id: 'C-F5-05',
    title: 'Fase 5: ningún procedimiento de huelga puede abrirse sin acuerdo humano',
    phases: [5],
    run() {
      // «Los expedientes de huelga exigen acuerdo humano y no pueden iniciarse
      // por una automatización» (PRD §24 Fase 5). Se comprueba en los dos
      // sitios donde tiene que estar: la base y el caso de uso.
      const migraciones = walk().filter((file) => /^prisma\/migrations\/.*\/migration\.sql$/.test(file));
      const sql = migraciones.map((file) => read(file) ?? '').join('\n');
      const fuente = read('src/modules/bargaining/application/files.ts') ?? '';

      const problems = [];
      if (!/bargaining_huelga_exige_acuerdo/.test(sql)) {
        problems.push('La base no impide un expediente de huelga sin acuerdo habilitante.');
      }
      // Tiene que exigirse en los **dos** caminos que llevan a un expediente de
      // huelga: abrirlo así de origen y escalar a él desde uno ordinario. Con
      // una sola comprobación, borrar la del alta dejaba la puerta abierta y el
      // control seguía en verde porque el permiso aparecía en el otro sitio.
      const usosDelPermisoDeHuelga = (fuente.match(/'bargaining\.strike\.file_open'/g) ?? []).length;
      if (usosDelPermisoDeHuelga < 2) {
        problems.push(
          'Abrir un procedimiento de huelga o escalar a él no exige su permiso propio en los dos caminos.',
        );
      }
      if (!/enablingResolutionId === null/.test(fuente)) {
        problems.push('El caso de uso no comprueba el acuerdo habilitante antes de abrir.');
      }

      return problems.length
        ? fail(problems)
        : ok(['Un expediente de huelga exige acuerdo aprobado y permiso propio, y la base lo impone.']);
    },
  },

  {
    id: 'C-F5-06',
    title: 'Fase 5: sin notificación y sin audiencia no hay resolución disciplinaria',
    phases: [5],
    run() {
      const migraciones = walk().filter((file) => /^prisma\/migrations\/.*\/migration\.sql$/.test(file));
      const sql = migraciones.map((file) => read(file) ?? '').join('\n');
      const fuente = read('src/modules/discipline/application/decisions.ts') ?? '';

      const problems = [];
      if (!/disciplinary_resolucion_exige_debido_proceso/.test(sql)) {
        problems.push('La base no impide resolver sin notificación ni audiencia.');
      }
      if (!/notifiedAt === null/.test(fuente) || !/hearingWaivedAt === null/.test(fuente)) {
        problems.push('El caso de uso no comprueba el debido proceso antes de resolver.');
      }
      if (!/sinValorar/.test(fuente)) {
        problems.push('Se puede resolver con pruebas sin valorar: negar la defensa por omisión.');
      }
      // Ninguna asistencia automática interviene en el régimen disciplinario.
      for (const archivo of walk().filter((file) => file.startsWith('src/modules/discipline/'))) {
        if (/gemini|GEMINI|generateContent|@google\/gen/i.test(read(archivo) ?? '')) {
          problems.push(`${archivo} invoca un modelo de lenguaje: el PRD lo prohíbe en el régimen disciplinario.`);
        }
      }

      return problems.length
        ? fail(problems)
        : ok(['Resolver exige notificación, audiencia o su renuncia, y pruebas valoradas. Ninguna automatización interviene.']);
    },
  },

  {
    id: 'C-F5-07',
    title: 'Fase 5: el catálogo de permisos no admite códigos repetidos',
    phases: [5],
    run() {
      // Un código repetido no falla en ningún sitio: la segunda definición
      // gana o pierde según el orden de lectura, y una de las dos —con su
      // sensibilidad y su exigencia de motivo— desaparece en silencio. Se
      // detectó al añadir los cuarenta y siete permisos de esta fase, contando
      // a mano: tres ya existían y nadie se habría enterado.
      const fuente = read('src/platform/authz/permissions.ts') ?? '';
      if (fuente === '') return fail(['No se encuentra el catálogo de permisos.']);

      const vistos = new Map();
      const repetidos = [];
      for (const match of fuente.matchAll(/define\(\s*'([^']+)'/g)) {
        const codigo = match[1] ?? '';
        if (vistos.has(codigo)) repetidos.push(codigo);
        else vistos.set(codigo, true);
      }

      return repetidos.length
        ? fail([...new Set(repetidos)].map((codigo) => `El permiso "${codigo}" está definido más de una vez.`))
        : ok([`${vistos.size} permisos declarados, ninguno repetido.`]);
    },
  },

  {
    id: 'C-F5-08',
    title: 'Fase 5: todo acto que exige motivo recibe uno de quien lo ejecuta',
    phases: [5],
    run() {
      // El motor niega un permiso con `requiresReason` cuando el actor llega
      // sin motivo (`MOTIVO_REQUERIDO`, docs/PERMISSIONS.md §7). Si la acción
      // de servidor no lo adjunta, el botón existe, se pulsa y **siempre**
      // falla: nadie puede declarar quórum ni certificar un escrutinio.
      // Pasó exactamente eso con `declareQuorum` y `certifyVoteProcess`, y no
      // lo vio ni el compilador ni el linter, porque no es un error de tipos
      // sino de composición entre dos capas.
      const catalogo = read('src/platform/authz/permissions.ts') ?? '';
      if (catalogo === '') return fail(['No se encuentra el catálogo de permisos.']);

      const exigenMotivo = new Set();
      for (const match of catalogo.matchAll(/define\(\s*'([^']+)'[^)]*?\)/gs)) {
        if ((match[0] ?? '').includes('requiresReason: true')) exigenMotivo.add(match[1] ?? '');
      }
      if (exigenMotivo.size === 0) {
        return fail(['Ningún permiso exige motivo: el catálogo no se está leyendo bien.']);
      }

      // Caso de uso que guarda uno de esos permisos → nombre exportado.
      const guardianes = new Map();
      for (const ruta of walk().filter((f) => /^src\/modules\/[^/]+\/application\/.+\.ts$/.test(f))) {
        const fuente = read(ruta) ?? '';
        let caso = null;
        for (const linea of fuente.split('\n')) {
          const exportado = /^export async function (\w+)/.exec(linea);
          if (exportado) caso = exportado[1] ?? null;
          const comprobacion = /\bcan\(\s*(\w+)\s*,\s*'([^']+)'/.exec(linea);
          if (comprobacion && caso !== null && exigenMotivo.has(comprobacion[2] ?? '')) {
            guardianes.set(caso, { permiso: comprobacion[2], variable: comprobacion[1], ruta });
          }
        }
      }
      if (guardianes.size === 0) {
        return fail(['Ningún caso de uso guarda un permiso que exija motivo: la lectura falló.']);
      }

      // Quien los invoca desde la interfaz o la API debe traer el motivo.
      const invocables = walk().filter((f) => /^app\/.+\.(ts|tsx)$/.test(f));
      const problemas = [];
      let comprobados = 0;
      for (const [caso, dato] of guardianes) {
        if (dato.variable !== 'actor') continue; // ya lo compone dentro del caso de uso
        for (const ruta of invocables) {
          const lineas = (read(ruta) ?? '').split('\n');
          for (let i = 0; i < lineas.length; i += 1) {
            if (!new RegExp(`await ${caso}\\(`).test(lineas[i] ?? '')) continue;
            comprobados += 1;
            const contexto = lineas.slice(Math.max(0, i - 25), i).join('\n');
            const traeMotivo = contexto.includes('withReason(') || contexto.includes('systemContext(');
            if (!traeMotivo) {
              problemas.push(
                `${ruta}:${i + 1} llama a ${caso}() —que exige «${dato.permiso}»— con un actor sin motivo: el acto siempre será negado.`,
              );
            }
          }
        }
      }

      if (comprobados === 0) {
        return fail(['No se encontró ninguna llamada a un caso de uso que exija motivo.']);
      }
      return problemas.length
        ? fail(problemas)
        : ok([
            `${exigenMotivo.size} permisos exigen motivo; ${guardianes.size} casos de uso los guardan y las ${comprobados} llamadas desde app/ lo adjuntan.`,
          ]);
    },
  },

  {
    id: 'C-F5-09',
    title: 'Fase 5: ninguna prueba limpia la base con TRUNCATE en cascada',
    phases: [5],
    run() {
      // `TRUNCATE t CASCADE` no borra t: borra t y toda tabla que apunte a t,
      // en cadena. Mientras el grafo de claves ajenas estuvo abierto, la orden
      // parecía acotada; en cuanto el territorio pasó a nacer de una resolución
      // de asamblea el grafo se cerró en ciclo y la misma línea empezó a vaciar
      // la base entera —semilla incluida— sin error ni aviso. Los casos
      // siguientes fallaron por falta de permisos: el síntoma señalaba al motor
      // de autorización, que no tenía nada que ver.
      const culpables = [];
      for (const ruta of walk().filter((f) => f.startsWith('tests/') && /\.tsx?$/.test(f))) {
        const lineas = (read(ruta) ?? '').split('\n');
        for (let i = 0; i < lineas.length; i += 1) {
          const linea = lineas[i] ?? '';
          // Solo la orden ejecutada: ni un comentario que la nombre ni la
          // palabra citada al comprobar privilegios son una orden.
          if (/^\s*(\/\/|\*|\/\*)/.test(linea)) continue;
          if (/\bTRUNCATE\b[^;]*\bCASCADE\b/i.test(linea)) {
            culpables.push(`${ruta}:${i + 1} vacía en cascada: borra mucho más de lo que nombra.`);
          }
        }
      }
      return culpables.length
        ? fail(culpables)
        : ok(['Ninguna prueba usa TRUNCATE en cascada para limpiar entre casos.']);
    },
  },

  {
    id: 'C-F5-10',
    title: 'Fase 5: un permiso que exige asignación se comprueba con su sonda',
    phases: [5],
    run() {
      // `needsAssignment` significa «además de la facultad, estar a cargo de
      // este expediente». El motor lo resuelve con una sonda que aporta el caso
      // de uso; si no la aporta, la respuesta es siempre `SIN_ASIGNACION`. El
      // módulo disciplinario entero era así: seis casos de uso, una pantalla
      // completa y ningún camino que llegara a ellos. No lo vio el compilador
      // —la sonda es opcional— ni ninguna prueba, porque ninguna abría la lista
      // con una sesión de verdad.
      const catalogo = read('src/platform/authz/permissions.ts') ?? '';
      if (catalogo === '') return fail(['No se encuentra el catálogo de permisos.']);

      const exigenAsignacion = new Set();
      for (const match of catalogo.matchAll(/define\(\s*'([^']+)'[^)]*?\)/gs)) {
        if ((match[0] ?? '').includes('needsAssignment: true')) exigenAsignacion.add(match[1] ?? '');
      }
      if (exigenAsignacion.size === 0) {
        return fail(['Ningún permiso exige asignación: el catálogo no se está leyendo bien.']);
      }

      const problemas = [];
      let comprobados = 0;
      for (const ruta of walk().filter((f) => /^src\/modules\/[^/]+\/application\/.+\.ts$/.test(f))) {
        const fuente = read(ruta) ?? '';
        for (const match of fuente.matchAll(/can\(([^;]{0,800}?)\)\s*;/gs)) {
          const cuerpo = match[1] ?? '';
          // Todos los permisos citados en la llamada, no solo el primero: el
          // código elige a veces entre dos —según quien ofrezca la prueba— y
          // mirar solo uno deja el otro sin comprobar. Se cuentan además los
          // que la llamada recibe por variable, resolviéndolos en el archivo.
          const citados = new Set([...cuerpo.matchAll(/'([a-z_]+\.[a-z_]+\.[a-z_]+)'/g)].map((c) => c[1]));
          for (const variable of cuerpo.matchAll(/,\s*([a-zA-Z_$][\w$]*)\s*,/g)) {
            const nombre = variable[1] ?? '';
            const asignacion = new RegExp(`const ${nombre}\\s*=([^;]*);`, 's').exec(fuente);
            if (asignacion === null) continue;
            for (const codigo of (asignacion[1] ?? '').matchAll(/'([a-z_]+\.[a-z_]+\.[a-z_]+)'/g)) {
              citados.add(codigo[1]);
            }
          }

          const conAsignacion = [...citados].filter((codigo) => exigenAsignacion.has(codigo));
          if (conAsignacion.length === 0) continue;
          comprobados += conAsignacion.length;
          if (!cuerpo.includes('hasLiveAssignment')) {
            const linea = fuente.slice(0, match.index).split('\n').length;
            problemas.push(
              `${ruta}:${linea} comprueba «${conAsignacion.join('», «')}», que exige asignación, sin aportar la sonda: se negará siempre.`,
            );
          }
        }
      }

      if (comprobados === 0) {
        return fail(['Ningún caso de uso comprueba un permiso que exija asignación.']);
      }
      return problemas.length
        ? fail(problemas)
        : ok([
            `${exigenAsignacion.size} permisos exigen asignación y las ${comprobados} comprobaciones aportan su sonda.`,
          ]);
    },
  },

  {
    id: 'C-F6-01',
    title: 'Fase 6: toda decisión sobre un expediente lleva su territorio',
    phases: [6],
    run() {
      // El PRD §24 exige probar acceso denegado para territorios ajenos, y el
      // motor solo comprueba el territorio cuando el recurso lo declara: un
      // recurso sin `territorialPath` no se niega, **se permite**. Es la clase
      // de fallo que no rompe nada y no aparece en ninguna prueba salvo la que
      // se escriba justo para él.
      //
      // Por eso el recurso del expediente se arma en un solo sitio,
      // `recursoDelExpediente`, y este control impide que vuelva a escribirse a
      // mano: un `kind: 'Case'` suelto en un caso de uso es una decisión que ha
      // dejado de mirar dónde ocurre el asunto.
      //
      // Dos excepciones, y las dos se declaran aquí en vez de tolerarse por
      // omisión: la lectura de quien **es parte** de su propio expediente —que
      // no se acota por territorio ni por compartimento, porque esas fronteras
      // separan áreas de la organización, no a una persona de lo suyo— y la
      // comprobación previa de la lista, que decide si hay facultad antes de
      // saber de qué expedientes se habla.
      const EXCEPCIONES = new Set(['cases.case.read_own']);

      const ficheros = walk().filter((f) => /^src\/modules\/cases\/application\/.+\.ts$/.test(f));
      if (ficheros.length === 0) return fail(['No se encuentra el módulo de casos.']);

      const problemas = [];
      let comprobados = 0;
      for (const ruta of ficheros) {
        const fuente = read(ruta) ?? '';
        for (const match of fuente.matchAll(/can\(([^;]{0,800}?)\)\s*;/gs)) {
          const cuerpo = match[1] ?? '';
          const citados = [...cuerpo.matchAll(/'(cases\.[a-z_]+\.[a-z_]+)'/g)].map((c) => c[1]);
          if (citados.length === 0) continue;
          if (citados.every((codigo) => EXCEPCIONES.has(codigo))) continue;

          // Una llamada sin `id` no decide sobre un expediente concreto: es la
          // comprobación de facultad que antecede a una lista.
          if (!/\bid:\s/.test(cuerpo) && !cuerpo.includes('recursoDelExpediente')) continue;

          comprobados += 1;
          if (!cuerpo.includes('recursoDelExpediente') && !cuerpo.includes('territorialPath')) {
            const linea = fuente.slice(0, match.index).split('\n').length;
            problemas.push(
              `${ruta}:${linea} decide sobre «${citados.join('», «')}» con un recurso armado a mano y sin territorio: el motor no comprobará dónde ocurre el asunto.`,
            );
          }
        }
      }

      if (comprobados === 0) {
        return fail(['Ninguna decisión sobre un expediente concreto se está comprobando.']);
      }
      return problemas.length
        ? fail(problemas)
        : ok([`Las ${comprobados} decisiones sobre un expediente concreto declaran su territorio.`]);
    },
  },

  {
    id: 'C-COH-15',
    title: 'La fase que el arranque cree activa es la que el proyecto declara',
    phases: 'all',
    run() {
      // `ACTIVE_PHASE` decide **qué variables de entorno son obligatorias**. Si
      // se queda atrás, una instalación productiva arranca sin las que la fase
      // en curso necesita y lo descubre en el peor momento: pasó en la Fase 3
      // con las claves de cobro (`D-F4-002`) y volvió a pasar en la Fase 6.
      //
      // Dos sitios declaran la fase —`docs/PHASE_STATUS.md`, que es el contrato
      // con la persona usuaria, y `env.ts`, que es lo que el arranque cree— y
      // el segundo depende de que alguien se acuerde de subirlo. Este control
      // es ese acuerdo, escrito.
      const declarada = readActivePhase();
      if (declarada.phase === null) {
        return fail([declarada.error ?? 'no se pudo leer la fase activa de docs/PHASE_STATUS.md.']);
      }

      const fuente = read('src/platform/config/env.ts') ?? '';
      const match = /const ACTIVE_PHASE = (\d+);/.exec(fuente);
      if (match === null) {
        return fail(['src/platform/config/env.ts no declara `const ACTIVE_PHASE = N;`.']);
      }

      const enElArranque = Number(match[1]);
      if (enElArranque !== declarada.phase) {
        return fail([
          `docs/PHASE_STATUS.md declara la fase ${declarada.phase} y src/platform/config/env.ts arranca como fase ${enElArranque}: las variables que la fase ${declarada.phase} vuelve obligatorias no se exigirían.`,
        ]);
      }

      return ok([`Ambos declaran la fase ${declarada.phase}.`]);
    },
  },

  {
    id: 'C-COH-14',
    title: 'La integración continua tiene toda variable que la fase activa exige',
    phases: 'all',
    run() {
      // `env.ts` declara qué variable pasa a ser obligatoria en cada fase, y el
      // arranque se niega a continuar sin ella. Pero quien introduce la
      // variable la escribe en su `.env.local` y sigue trabajando: todo pasa en
      // su máquina y la integración continua se cae en la primera prueba que
      // toca el entorno, con un mensaje que habla de copiar `.env.example`
      // —un consejo dirigido a una persona, inútil dentro de un contenedor—.
      //
      // Pasó con `VOTE_CREDENTIAL_SECRET` al abrir la Fase 5: tres commits en
      // rojo, incluido el cierre de la fase, mientras aquí todo estaba verde.
      // La tabla existía; lo que faltaba era alguien que la cotejara con el
      // archivo de la integración continua.
      const entorno = read('src/platform/config/env.ts') ?? '';
      const flujo = read('.github/workflows/calidad.yml') ?? '';
      if (entorno === '' || flujo === '') {
        return fail(['No se encuentra src/platform/config/env.ts o .github/workflows/calidad.yml.']);
      }

      const tabla = /REQUIRED_BY_PHASE[^=]*=\s*\{([\s\S]*?)\n\};/.exec(entorno);
      if (tabla === null) return fail(['No se puede leer REQUIRED_BY_PHASE en src/platform/config/env.ts.']);

      const activa = readActivePhase().phase;
      const exigidas = [];
      for (const linea of (tabla[1] ?? '').split('\n')) {
        const entrada = /^\s*(\d+)\s*:\s*\[([\s\S]*)$/.exec(linea);
        if (entrada === null) continue;
        if (Number(entrada[1]) > activa) continue;
        // El arreglo puede ocupar varias líneas; se recogen todas hasta cerrarlo.
        const desde = (tabla[1] ?? '').indexOf(linea);
        const resto = (tabla[1] ?? '').slice(desde);
        const cierre = resto.indexOf(']');
        for (const nombre of resto.slice(0, cierre).matchAll(/'([A-Z0-9_]+)'/g)) {
          exigidas.push({ variable: nombre[1], fase: Number(entrada[1]) });
        }
      }

      if (exigidas.length === 0) {
        return ok([`Ninguna variable es obligatoria todavía en la fase ${activa}.`]);
      }

      const faltantes = exigidas.filter(
        ({ variable }) => !new RegExp(`^\\s{6}${variable}:`, 'm').test(flujo),
      );

      return faltantes.length
        ? fail(
            faltantes.map(
              ({ variable, fase }) =>
                `${variable} es obligatoria desde la Fase ${fase} y .github/workflows/calidad.yml no la declara: la integración continua se caerá en la primera prueba que arranque la aplicación.`,
            ),
          )
        : ok([
            `Las ${exigidas.length} variables que las fases 1 a ${activa} vuelven obligatorias están declaradas en la integración continua.`,
          ]);
    },
  },

  {
    id: 'C-COH-18',
    title: 'La tabla de variables por fase de ENVIRONMENT.md dice lo mismo que el código',
    phases: 'all',
    run() {
      // Cuarta vez que un número de fase escrito a mano sobrevive a una
      // renumeración. `D-F4-002` fue `ACTIVE_PHASE`, `D-F6-005` el contrato del
      // verificador, y al abrir la Fase 8 fue `REQUIRED_BY_PHASE`, que exigía
      // las claves de Gemini «desde la 10» —su número anterior—. Lo atrapó
      // `C-COH-14`. Lo que nadie cotejaba era la **tabla del §11 de
      // docs/ENVIRONMENT.md**, que decía 10 igual que el código y siguió
      // diciéndolo después de corregirlo, contradiciendo a la fila de arriba de
      // ese mismo documento, que decía 8.
      //
      // Una tabla que documenta una constante y no se coteja con ella no
      // documenta: repite, y las repeticiones se separan.
      const entorno = read('src/platform/config/env.ts') ?? '';
      const doc = read('docs/ENVIRONMENT.md') ?? '';
      if (entorno === '' || doc === '') {
        return fail(['No se encuentra src/platform/config/env.ts o docs/ENVIRONMENT.md.']);
      }

      const tabla = /REQUIRED_BY_PHASE[^=]*=\s*\{([\s\S]*?)\n\};/.exec(entorno);
      if (tabla === null) return fail(['No se puede leer REQUIRED_BY_PHASE en src/platform/config/env.ts.']);

      /** Fase declarada en el código para cada variable. */
      const enCodigo = new Map();
      const cuerpo = tabla[1] ?? '';
      for (const bloque of cuerpo.matchAll(/(\d+)\s*:\s*\[([\s\S]*?)\]/g)) {
        for (const nombre of (bloque[2] ?? '').matchAll(/'([A-Z0-9_]+)'/g)) {
          enCodigo.set(nombre[1], Number(bloque[1]));
        }
      }

      const seccion = /\|\s*Fase\s*\|\s*Variables que pasan a ser obligatorias\s*\|([\s\S]*?)\n\n/.exec(doc);
      if (seccion === null) {
        return fail(['docs/ENVIRONMENT.md no contiene la tabla de variables obligatorias por fase.']);
      }

      const problemas = [];
      let variablesCotejadas = 0;
      for (const fila of (seccion[1] ?? '').split('\n')) {
        const celdas = /^\|\s*(\d+)\s*\|(.*)\|\s*$/.exec(fila);
        if (celdas === null) continue;
        const faseDocumentada = Number(celdas[1]);
        for (const nombre of (celdas[2] ?? '').matchAll(/`([A-Z0-9_]+)`/g)) {
          const variable = nombre[1];
          const faseDelCodigo = enCodigo.get(variable);
          // Las entradas con comodín (`STRIPE_*`, `SUPERADMIN_*`) y las que el
          // documento explica que no dependen de la fase no llegan aquí: sin
          // fila en el código no hay nada que cotejar, y la prosa de su celda
          // dice por qué.
          if (faseDelCodigo === undefined) continue;
          variablesCotejadas += 1;
          if (faseDelCodigo !== faseDocumentada) {
            problemas.push(
              `docs/ENVIRONMENT.md §11 dice que ${variable} es obligatoria desde la Fase ${faseDocumentada} y REQUIRED_BY_PHASE la exige desde la ${faseDelCodigo}.`,
            );
          }
        }
      }

      if (variablesCotejadas === 0) {
        return fail(['La tabla del §11 de docs/ENVIRONMENT.md no nombra ninguna variable que el código exija: o cambió el formato o dejó de documentar la constante.']);
      }

      return problemas.length
        ? fail(problemas)
        : ok([`Las ${variablesCotejadas} variables que la tabla del §11 nombra coinciden en fase con REQUIRED_BY_PHASE.`]);
    },
  },

  {
    id: 'C-COH-16',
    title: 'El contrato de fases es uno solo y nadie nombra una fase que no existe',
    phases: 'all',
    run() {
      // La corrección de alcance del 5 de septiembre retiró CIAN y CENI como
      // fases y dejó el proyecto en once, 0 a 10. El PRD se reescribió, el
      // backlog se renumeró y el contrato del verificador también. El README
      // no: siguió anunciando trece fases, con CIAN en la 8 y CENI en la 9,
      // durante dos fases enteras. Es la puerta de entrada del repositorio y
      // la primera cosa que lee quien llega, incluida una máquina.
      //
      // El daño de una lista de fases equivocada no es que esté fea: es que
      // alguien construya la fase que dice. Por eso el contrato tiene una
      // sola fuente —los encabezados `## FASE n — nombre` del PRD §24— y todo
      // lo demás se compara contra ella.
      const prd = read('docs/PRD.md');
      if (prd === null) return fail('No existe docs/PRD.md.');

      const enElPrd = [...prd.matchAll(/^## FASE (\d+) — (.+?)\s*$/gm)].map((m) => ({
        id: Number(m[1]),
        name: m[2],
      }));
      if (enElPrd.length === 0) return fail('docs/PRD.md §24 no declara encabezados "## FASE n — nombre".');

      const problems = [];

      const esperado = enElPrd.map((f) => `${f.id}:${f.name}`).join(' | ');
      const enElContrato = CONTRACT.phases.map((f) => `${f.id}:${f.name}`).join(' | ');
      if (enElContrato !== esperado) {
        problems.push(
          `scripts/phase/prd-contract.json no coincide con los encabezados del PRD §24.\n      PRD:      ${esperado}\n      contrato: ${enElContrato}`,
        );
      }

      const readme = read('README.md');
      if (readme === null) {
        problems.push('No existe README.md.');
      } else {
        const lista = [...readme.matchAll(/^Fase (\d+)\s+(.+?)\s*$/gm)].map((m) => ({
          id: Number(m[1]),
          name: m[2],
        }));
        if (lista.length === 0) {
          problems.push('README.md no publica la lista de fases del PRD §24.');
        } else {
          const enElReadme = lista.map((f) => `${f.id}:${f.name}`).join(' | ');
          if (enElReadme !== esperado) {
            problems.push(
              `README.md anuncia un contrato de fases distinto del PRD §24.\n      PRD:    ${esperado}\n      README: ${enElReadme}`,
            );
          }
        }
        const cuenta = new RegExp(`se construye en ${enElPrd.length} fases \\(0 a ${enElPrd.length - 1}\\)`);
        if (!cuenta.test(readme)) {
          problems.push(
            `README.md no dice que el producto se construye en ${enElPrd.length} fases (0 a ${enElPrd.length - 1}).`,
          );
        }
      }

      // Nadie cita una fase fuera del contrato. Las citas viven sobre todo en
      // comentarios —«esto llega en la Fase 12»— y sobreviven a una
      // renumeración sin que nada se rompa: el código compila igual y la
      // promesa apunta a una fase que ya no existe.
      //
      // De `docs/PHASE_STATUS.md` se mira la parte viva y se deja fuera el
      // archivo, que empieza en su primer encabezado `# Archivo`. Es el
      // registro de lo que se dijo y se firmó cuando el contrato era otro, y
      // reescribirlo convertiría un historial en una versión conveniente del
      // pasado. Excluir el documento entero, en cambio, dejaría sin vigilar
      // justo la parte que se edita cada fase.
      const ultima = Math.max(...enElPrd.map((f) => f.id));
      const rastro = [];
      for (const ruta of tracked()) {
        if (!isTextFile(ruta)) continue;
        if (ruta === 'docs/PRD.md') continue;
        if (ruta === 'scripts/phase/verify.mjs') continue;
        let contenido = read(ruta);
        if (contenido === null) continue;
        if (ruta === 'docs/PHASE_STATUS.md') {
          const archivo = contenido.search(/^# Archivo\b/m);
          if (archivo !== -1) contenido = contenido.slice(0, archivo);
        }
        for (const [i, linea] of contenido.split('\n').entries()) {
          for (const m of linea.matchAll(/\bFases? (\d+)\b/g)) {
            const n = Number(m[1]);
            if (n > ultima) rastro.push(`${ruta}:${i + 1} nombra la Fase ${n}; el contrato termina en la ${ultima}.`);
          }
        }
      }
      problems.push(...rastro);

      return problems.length
        ? fail(problems)
        : ok([`Las ${enElPrd.length} fases coinciden en el PRD, el contrato y el README, y nadie cita una fase posterior a la ${ultima}.`]);
    },
  },

  {
    id: 'C-COH-17',
    title: 'El relevo existe, y no declara el estado del proyecto por su cuenta',
    phases: 'all',
    run() {
      // `AGENTS.md` es lo que un agente carga solo al abrir el repositorio, y
      // `docs/HANDOFF.md` es el manual de operación para quien llega sin haber
      // visto nada: otra ventana, otra cuenta, otra persona. Si faltan, quien
      // continúe tiene que reconstruir por lectura lo que aquí está escrito, y
      // lo reconstruirá distinto.
      //
      // Y ninguno de los dos dice en qué fase estamos. Eso lo dice
      // `docs/PHASE_STATUS.md` y solo él. Un manual que además declarara la
      // fase se quedaría atrás en el primer cierre y contaría una versión
      // distinta de la verdad a quien más depende de él: exactamente lo que
      // pasó con el README (`D-F6-006`).
      const problems = [];

      const agentes = read('AGENTS.md');
      if (agentes === null) {
        problems.push('No existe AGENTS.md: quien abra el repositorio no encontrará las reglas de trabajo.');
      }

      const relevo = read('docs/HANDOFF.md');
      if (relevo === null) {
        problems.push('No existe docs/HANDOFF.md: no hay manual para quien continúe el proyecto.');
      }

      if (agentes !== null && relevo !== null) {
        for (const documento of ['docs/PRD.md', 'docs/PHASE_STATUS.md', 'docs/HANDOFF.md', 'docs/BACKLOG.md']) {
          if (!agentes.includes(documento)) {
            problems.push(`AGENTS.md no remite a ${documento}, que es de los primeros que hay que leer.`);
          }
        }

        // Nada de declarar la fase activa ni su estado fuera de PHASE_STATUS.
        const declaraciones = [
          { patron: /\*\*Fase activa:\*\*/, queja: 'declara una fase activa' },
          { patron: /\bFase activa\b\s*[:=]/, queja: 'declara una fase activa' },
          { patron: /\b(IN_PROGRESS|APPROVED|BLOCKED)\b/, queja: 'declara un estado de fase' },
          { patron: /\bFases? \d+\b/, queja: 'nombra una fase concreta' },
        ];
        for (const [ruta, contenido] of [
          ['AGENTS.md', agentes],
          ['docs/HANDOFF.md', relevo],
        ]) {
          for (const { patron, queja } of declaraciones) {
            const linea = contenido.split('\n').findIndex((l) => patron.test(l));
            if (linea !== -1) {
              problems.push(
                `${ruta}:${linea + 1} ${queja}; el estado del proyecto lo declara docs/PHASE_STATUS.md y ningún otro documento.`,
              );
            }
          }
        }
      }

      const unicos = [...new Set(problems)];
      return unicos.length
        ? fail(unicos)
        : ok(['AGENTS.md y docs/HANDOFF.md existen, remiten a los documentos que rigen y no declaran el estado del proyecto.']);
    },
  },

  {
    id: 'C-F7-01',
    title: 'Fase 7: toda ruta pública del código está reservada frente al gestor de contenidos',
    phases: [7],
    run() {
      // El sitio público resuelve las páginas del gestor por una ruta
      // atrapatodo. Otra ruta que case con la misma dirección gana siempre,
      // **sin error y sin aviso**: la página se publica, el gestor la da por
      // publicada, y quien abre la dirección ve otra cosa.
      //
      // Era un riesgo latente hasta que el catálogo del ecosistema pasó a
      // servirse desde `/herramientas`. La lista de rutas del código existe por
      // eso, y este control la deriva de los directorios que hay de verdad: una
      // pantalla nueva sin declarar falla aquí, y no meses después en forma de
      // página fantasma que nadie sabe por qué no aparece.
      //
      // La comparación es por **ruta exacta**, con su profundidad. Reservar el
      // primer segmento sería más simple y estaría mal: `legales/:param` sirve
      // los documentos legales leyéndolos del propio gestor, así que reservar
      // `legales` entero prohibiría justo lo que esa ruta publica.
      const fuente = read('src/modules/content/domain/reserved-routes.ts');
      if (fuente === null) {
        return fail('No existe src/modules/content/domain/reserved-routes.ts.');
      }

      const listar = (nombre) => {
        const bloque = new RegExp(`export const ${nombre}[^=]*=\\s*\\[([\\s\\S]*?)\\];`).exec(fuente);
        return bloque === null ? null : [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
      };
      const reservadas = listar('RUTAS_DEL_CODIGO');
      const deContenido = listar('RUTAS_QUE_SIRVEN_CONTENIDO');
      if (reservadas === null || deContenido === null) {
        return fail('reserved-routes.ts no declara RUTAS_DEL_CODIGO y RUTAS_QUE_SIRVEN_CONTENIDO.');
      }
      const declaradas = new Set([...reservadas, ...deContenido]);

      const raiz = join(ROOT, 'app/(publico)');
      if (!existsSync(raiz)) return fail('No existe app/(publico).');

      // Recorre el árbol y anota cada ruta que sirve una pantalla, con su
      // profundidad. La atrapatodo del gestor —`[...slug]`— se salta: es la que
      // atiende todo lo demás y reservarla no tendría sentido.
      const enDisco = new Set();
      const recorrer = (directorio, prefijo) => {
        for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
          if (!entrada.isDirectory()) continue;
          if (entrada.name.startsWith('[...')) continue;
          const segmento = entrada.name.startsWith('[') ? ':param' : entrada.name;
          const ruta = prefijo === '' ? segmento : `${prefijo}/${segmento}`;
          const completo = join(directorio, entrada.name);
          const sirve = ['page.tsx', 'page.ts', 'route.ts'].some((archivo) =>
            existsSync(join(completo, archivo)),
          );
          if (sirve) enDisco.add(ruta);
          recorrer(completo, ruta);
        }
      };
      recorrer(raiz, '');

      const problems = [];
      for (const ruta of enDisco) {
        if (!declaradas.has(ruta)) {
          problems.push(
            `app/(publico)/${ruta} no está clasificada: decide si sirve contenido propio —y va a RUTAS_DEL_CODIGO, para que el gestor no publique una página que nadie vería— o si es una forma de publicar lo del gestor, y va a RUTAS_QUE_SIRVEN_CONTENIDO.`,
          );
        }
      }
      for (const ruta of declaradas) {
        if (!enDisco.has(ruta)) {
          problems.push(
            `reserved-routes.ts declara "${ruta}" y ninguna pantalla la sirve: o sobra, o la pantalla se borró y quedó la declaración.`,
          );
        }
      }
      for (const ruta of reservadas) {
        if (deContenido.includes(ruta)) {
          problems.push(`"${ruta}" está en las dos listas: o el gestor puede publicar ahí o no puede.`);
        }
      }

      return problems.length
        ? fail(problems)
        : ok([
            `Las ${enDisco.size} rutas públicas están clasificadas: ${reservadas.length} sirven contenido propio y ${deContenido.length} publican lo del gestor.`,
          ]);
    },
  },

  {
    id: 'C-F7-02',
    title: 'Fase 7: el acceso a una plataforma externa es una redirección y nada más',
    phases: [7],
    run() {
      // El PRD §12.3 admite **una sola** modalidad de acceso: redirección
      // externa. Sin inicio de sesión único, sin token de lanzamiento, sin API,
      // sin sincronización y sin iframe. Cada plataforma conserva su
      // autenticación, su operación, sus cobros y sus datos.
      //
      // Es una de esas garantías que nadie rompe de golpe. Se rompe un martes,
      // porque «solo hace falta pasarle el correo para que no lo teclee otra
      // vez», y para cuando alguien se da cuenta este repositorio ya sabe algo
      // de una plataforma que no opera y tiene que mantenerlo sincronizado con
      // ella para siempre.
      //
      // Las cuatro comprobaciones de abajo son las cuatro formas en que eso
      // empieza.
      const problems = [];
      const fuentes = tracked().filter(
        (ruta) =>
          (ruta.startsWith('app/') || ruta.startsWith('src/')) &&
          (ruta.endsWith('.tsx') || ruta.endsWith('.ts')) &&
          !ruta.startsWith('src/generated/'),
      );

      for (const ruta of fuentes) {
        const contenido = read(ruta);
        if (contenido === null) continue;
        const lineas = contenido.split('\n');

        for (const [i, linea] of lineas.entries()) {
          // 1. Ninguna dirección de acceso escrita en un componente. La
          //    dirección vive en el catálogo y se administra sin desplegar; una
          //    escrita aquí obliga a un despliegue para corregirla y, mientras,
          //    manda gente a donde ya no debe.
          if (/href\s*=\s*["'{`]\s*https?:\/\//.test(linea)) {
            problems.push(
              `${ruta}:${i + 1} escribe una dirección absoluta en un enlace. Las direcciones de acceso se administran desde el catálogo (PRD §12.2).`,
            );
          }

          // 2. Sin iframe. Meter una plataforma ajena dentro de esta página
          //    mezcla las dos sesiones ante quien mira, y convierte cualquier
          //    fallo suyo en un fallo aparente de Fuerza Índigo.
          if (/<iframe/i.test(linea)) {
            problems.push(`${ruta}:${i + 1} inserta un iframe. El PRD §12.3 admite solo redirección externa.`);
          }
        }

        // 3. El módulo del catálogo no llama a nadie. Es lo que garantiza, por
        //    construcción y no por una prueba de simulacro, que la caída de una
        //    plataforma externa no bloquee el portal central: no hay ninguna
        //    llamada que pueda quedarse esperando.
        if (ruta.startsWith('src/modules/ecosystem/')) {
          if (/\bfetch\s*\(/.test(contenido) || /from ['"]node:https?['"]/.test(contenido)) {
            problems.push(
              `${ruta} hace una llamada de red. El catálogo guarda ficha y dirección: no habla con las plataformas que anuncia (PRD §12.3).`,
            );
          }

          // 4. Y no aparece el vocabulario del intercambio de identidad, que es
          //    como esto empieza a dejar de ser una redirección.
          for (const marca of ['launchToken', 'ssoToken', 'singleSignOn', 'externalIdentity', 'impersonat']) {
            if (contenido.includes(marca)) {
              problems.push(
                `${ruta} menciona "${marca}": el acceso es redirección, sin inicio de sesión único ni intercambio de identidad (PRD §12.3).`,
              );
            }
          }
        }
      }

      return problems.length
        ? fail([...new Set(problems)])
        : ok([
            `Ninguna dirección escrita en un componente, ningún iframe, y el módulo del catálogo no llama a ninguna plataforma externa.`,
          ]);
    },
  },

  {
    id: 'C-F8-01',
    title: 'Fase 8: la IA solo habla con el proveedor por su puerto, y la clave no llega al cliente',
    phases: [8],
    run() {
      // El PRD §15.1 exige que la ejecución sea **solo en servidor** y que la
      // clave viva en el entorno. Dos garantías que nadie rompe de golpe:
      //
      //  1. Se rompe la primera el día que alguien llama a Gemini «rápido» desde
      //     otro módulo, saltándose los límites, la degradación y la bitácora que
      //     solo existen en el servicio. Por eso el host del proveedor solo puede
      //     aparecer en el puerto: cualquier otro sitio que lo nombre está
      //     hablando con el proveedor por su cuenta.
      //  2. Se rompe la segunda el día que alguien expone la clave al navegador
      //     con un `NEXT_PUBLIC_`, que es la única forma en que una variable llega
      //     al cliente. La clave del proveedor jamás lleva ese prefijo.
      const HOST = 'generativelanguage.googleapis.com';
      const PUERTO = 'src/platform/ai/provider-port.ts';
      const problems = [];

      const fuentes = tracked().filter(
        (ruta) =>
          (ruta.startsWith('app/') || ruta.startsWith('src/')) &&
          (ruta.endsWith('.ts') || ruta.endsWith('.tsx')) &&
          !ruta.startsWith('src/generated/'),
      );

      for (const ruta of fuentes) {
        const contenido = read(ruta);
        if (contenido === null) continue;

        if (contenido.includes(HOST) && ruta !== PUERTO) {
          problems.push(
            `${ruta} nombra el host del proveedor de IA. Solo ${PUERTO} habla con él: los límites, la degradación y la bitácora viven en el servicio y saltárselos deja una llamada sin gobernar (PRD §15.1).`,
          );
        }

        // La clave nunca lleva prefijo NEXT_PUBLIC_: sería exponerla al cliente.
        if (/NEXT_PUBLIC_GEMINI/.test(contenido)) {
          problems.push(
            `${ruta} declara una variable NEXT_PUBLIC_GEMINI. La clave del proveedor vive en el entorno del servidor y jamás se expone al navegador (PRD §15.1, §21).`,
          );
        }
      }

      return problems.length
        ? fail([...new Set(problems)])
        : ok([
            `El host del proveedor solo aparece en ${PUERTO}, y ninguna variable expone la clave al cliente.`,
          ]);
    },
  },

  {
    id: 'C-F8-02',
    title: 'Fase 8: la lista de efectos que la IA no puede producir es la del PRD §15.4',
    phases: [8],
    run() {
      // «La IA no decide» es la garantía que gobierna la fase. El servicio la
      // sostiene rechazando la ejecución cuando el efecto declarado es uno de los
      // diez del §15.4 (ADR-0147). Ese registro vive en el código, y si una
      // entrada se pierde, la IA podría volver a tomar esa decisión sin que nadie
      // lo note. Este control coteja el registro contra el contrato: los dos
      // dicen lo mismo, o falla nombrando la diferencia.
      const prd = read('docs/PRD.md');
      const policy = read('src/platform/ai/policy.ts');
      if (prd === null || policy === null) {
        return fail(['No se encuentra docs/PRD.md o src/platform/ai/policy.ts.']);
      }

      // Viñetas del §15.4: desde su encabezado hasta el siguiente «## ».
      const seccion = /##\s*15\.4[^\n]*\n([\s\S]*?)\n##\s/.exec(prd);
      if (seccion === null) return fail(['No se pudo aislar la sección §15.4 del PRD.']);
      const viñetas = seccion[1]
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('- '))
        .map((l) => l.slice(2).replace(/[;.]$/, '').trim());

      // Descripciones del registro PROHIBITED_EFFECTS.
      const descripciones = [...policy.matchAll(/^\s*[A-Z_]+:\s*'([^']+)',/gm)].map((m) => m[1]);

      const problems = [];
      for (const v of viñetas) {
        if (!descripciones.includes(v)) {
          problems.push(`El §15.4 prohíbe «${v}» y el registro PROHIBITED_EFFECTS no lo recoge con ese texto.`);
        }
      }
      for (const d of descripciones) {
        if (!viñetas.includes(d)) {
          problems.push(`El registro PROHIBITED_EFFECTS incluye «${d}», que ya no está en el §15.4 del PRD.`);
        }
      }
      if (viñetas.length !== descripciones.length) {
        problems.push(`El §15.4 enumera ${viñetas.length} efectos y el registro tiene ${descripciones.length}.`);
      }

      return problems.length
        ? fail([...new Set(problems)])
        : ok([`Los ${viñetas.length} efectos prohibidos del §15.4 coinciden, palabra por palabra, con el registro del servicio.`]);
    },
  },
  {
    id: 'C-F8-03',
    title: 'Fase 8: ningún caso de uso asistido declara un efecto que la IA no puede producir',
    phases: [8],
    run() {
      // Un flujo asistido sugiere; no decide. Cada uno declara el efecto de su
      // salida (bloque F), y ese efecto tiene que quedar **fuera** de la lista de
      // los prohibidos del §15.4: si alguno declarara «admisión» o «diagnóstico»,
      // estaría cableando la IA a una decisión que no le toca, y el guardián lo
      // rechazaría en ejecución —pero es mejor que no llegue a escribirse—. Este
      // control lo comprueba estáticamente, cotejando los efectos declarados
      // contra el registro PROHIBITED_EFFECTS.
      const assist = read('src/modules/ai/application/assist.ts');
      const policy = read('src/platform/ai/policy.ts');
      if (assist === null || policy === null) {
        return fail(['No se encuentra src/modules/ai/application/assist.ts o src/platform/ai/policy.ts.']);
      }

      const claves = [...policy.matchAll(/^\s*([A-Z_]+):\s*'[^']+',/gm)].map((m) => m[1]);
      const efectos = [...assist.matchAll(/intendedEffect:\s*'([^']+)'/g)].map((m) => m[1]);
      if (efectos.length === 0) {
        return fail(['No se encontró ningún `intendedEffect` declarado en los casos de uso asistidos.']);
      }

      const problems = [];
      for (const efecto of efectos) {
        if (claves.includes(efecto)) {
          problems.push(
            `El caso de uso asistido declara el efecto «${efecto}», que es uno de los prohibidos por el §15.4: un flujo asistido no puede decidir eso.`,
          );
        }
      }

      return problems.length
        ? fail([...new Set(problems)])
        : ok([`Los ${efectos.length} efectos declarados por los casos de uso asistidos quedan fuera de los diez prohibidos del §15.4.`]);
    },
  },
  {
    id: 'C-F8-04',
    title: 'Fase 8: la consulta de consumo no toca ninguna columna de contenido',
    phases: [8],
    run() {
      // «Los costos y errores se consultan por módulo **sin exponer contenido
      // sensible**» es el criterio 6, y su fuerza está en el «sin». La consulta
      // de consumo (ai.usage.read) agrega números y estados; para que se colara
      // contenido habría que nombrar una columna de texto —`outputSummary`, la
      // huella `inputDigest`— en su archivo. Este control lo rechaza: quien
      // vigila el gasto no lee, de paso, lo que se le escribió a un modelo.
      const usage = read('src/modules/ai/application/usage.ts');
      if (usage === null) return fail(['No se encuentra src/modules/ai/application/usage.ts.']);

      const prohibidas = ['outputSummary', 'inputDigest'];
      const encontradas = prohibidas.filter((col) => usage.includes(col));

      return encontradas.length
        ? fail(
            encontradas.map(
              (col) => `La consulta de consumo nombra «${col}», una columna de contenido: el consumo se consulta sin exponer contenido (criterio 6).`,
            ),
          )
        : ok(['La consulta de consumo no nombra ninguna columna de contenido: agrega solo números y estados.']);
    },
  },
  {
    id: 'C-F9-01',
    title: 'Fase 9: lo obligatorio y lo promocional se gestionan por separado',
    phases: [9],
    run() {
      // El criterio 1 exige que las comunicaciones obligatorias y las
      // promocionales se gestionen por separado. Dos cosas lo sostienen y este
      // control las vigila: que solo la clase obligatoria de gobierno sea no
      // silenciable —ni una más, para que el relato «lo demás lo decide la
      // persona» se cumpla—, y que una campaña rechace enviar una plantilla de
      // esa clase, porque lo obligatorio no viaja como difusión.
      const dominio = read('src/modules/notifications/domain/preferences.ts');
      if (dominio === null) return fail(['No se encuentra el dominio de preferencias de notificación.']);

      const setMatch = dominio.match(/NO_SILENCIABLES\s*=\s*new Set<[^>]*>\(\[([^\]]*)\]\)/);
      if (setMatch === null) return fail(['El dominio no declara qué clases no se pueden silenciar.']);
      const clases = [...(setMatch[1] ?? '').matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
      if (clases.length !== 1 || clases[0] !== 'GOVERNANCE_MANDATORY') {
        return fail([
          `Las clases no silenciables deberían ser solo GOVERNANCE_MANDATORY; son: ${clases.join(', ') || 'ninguna'}.`,
        ]);
      }

      const campanas = read('src/modules/notifications/application/campaigns.ts');
      if (campanas === null) return fail(['No se encuentra el caso de uso de campañas.']);
      if (!/isMandatoryCategory\(template\.category\)/.test(campanas) || !campanas.includes('ruleViolation')) {
        return fail([
          'El envío de campaña no rechaza una plantilla de clase obligatoria: una campaña no debe enviar lo obligatorio.',
        ]);
      }

      return ok(['Solo el aviso obligatorio de gobierno es no silenciable, y una campaña no lo envía.']);
    },
  },
  {
    id: 'C-F9-02',
    title: 'Fase 9: una constancia revocada se verifica como revocada, nunca como válida',
    phases: [9],
    run() {
      // El criterio 5 exige constancias verificables y revocables. La trampa
      // está en la revocación: si la verificación leyera un estado copiado en
      // vez del vivo, una constancia revocada hace un minuto seguiría
      // apareciendo válida —el peor fallo posible, porque parece funcionar—.
      // Este control vigila que la verificación derive «revocada» del estado en
      // vivo de la inscripción, y que revocar deje esa marca y cancele el
      // documento.
      const fuente = read('src/modules/events/application/attendance.ts');
      if (fuente === null) return fail(['No se encuentra el caso de uso de constancias.']);

      // La verificación deriva `revoked` de la revocación en vivo de la
      // inscripción, no de una copia guardada al emitir.
      if (!/revoked:\s*registro\.constancyRevokedAt\s*!==\s*null/.test(fuente)) {
        return fail([
          'La verificación de constancias no deriva su estado de la revocación en vivo: una revocada podría verificar como válida.',
        ]);
      }

      // Revocar deja la marca en la inscripción y cancela el documento emitido.
      if (!/constancyRevokedAt:\s*new Date\(\)/.test(fuente)) {
        return fail(['Revocar una constancia no deja la marca de revocación en la inscripción.']);
      }
      if (!/status:\s*'CANCELLED'/.test(fuente)) {
        return fail(['Revocar una constancia no cancela el documento emitido.']);
      }

      return ok(['La verificación de constancias lee la revocación en vivo; revocar la marca y cancela el documento.']);
    },
  },
  {
    id: 'C-F9-03',
    title: 'Fase 9: el tablero muestra decisiones accionables, no métricas decorativas',
    phases: [9],
    run() {
      // El criterio 6 exige que los paneles muestren «decisiones accionables, no
      // métricas decorativas». Dos cosas lo sostienen y este control las vigila:
      // que toda tarea del tablero lleve a donde se atiende —un contador sin
      // enlace es una métrica—, y que una cola vacía no aparezca —una tarjeta con
      // un cero es decoración—.
      const fuente = read('src/modules/dashboards/application/management-panel.ts');
      if (fuente === null) return fail(['No se encuentra el tablero de gestión.']);

      // Toda tarea que se construye trae una acción: tantos `accion:` como
      // tareas (cada tarea se identifica con `id: '…'`). Un contador sin enlace
      // es justo la métrica que el criterio prohíbe.
      const tareas = (fuente.match(/\bid:\s*'/g) ?? []).length;
      const acciones = (fuente.match(/\baccion:\s*\{\s*href:/g) ?? []).length;
      if (tareas === 0 || tareas !== acciones) {
        return fail([
          `El tablero tiene ${tareas} tarea(s) y ${acciones} con enlace: toda tarea debe llevar a donde se atiende.`,
        ]);
      }

      // Cada fuente omite la cola vacía: hay al menos tantos guardianes de cero
      // como tareas. Sin ese guardián, una cola sin trabajo saldría con un cero.
      const guardias = (fuente.match(/cantidad === 0\)\s*return null;/g) ?? []).length;
      if (guardias < tareas) {
        return fail([
          `El tablero tiene ${tareas} tarea(s) pero solo ${guardias} omiten la cola vacía: una tarjeta con un cero es decoración.`,
        ]);
      }

      // Y el panel descarta las colas que no aplican en vez de mostrarlas vacías.
      if (!fuente.includes('!== null')) {
        return fail(['El tablero no descarta las colas vacías o inalcanzables.']);
      }

      return ok(['Toda tarea del tablero lleva a donde se atiende, y una cola vacía no aparece.']);
    },
  },
  {
    id: 'C-F9-04',
    title: 'Fase 9: los indicadores territoriales agregan con umbral de privacidad, de una sola definición',
    phases: [9],
    run() {
      // El criterio 3 exige que los indicadores sensibles usen agregación y
      // umbrales de privacidad. Dos cosas lo sostienen: que las cuentas de
      // personas del indicador territorial pasen por el umbral —una cuenta de
      // uno señala a esa persona—, y que el umbral sea uno solo en todo el
      // sistema —dos definiciones serían dos privacidades, una de las cuales
      // alguien bajaría sin querer—.
      const primitiva = read('src/platform/privacy/threshold.ts');
      if (primitiva === null || !/export const UMBRAL_DE_PRIVACIDAD\s*=/.test(primitiva)) {
        return fail(['El umbral de privacidad no vive en la capa compartida.']);
      }

      // Una sola definición del umbral en todo el código.
      let definiciones = 0;
      for (const ruta of walk().filter((f) => /\.tsx?$/.test(f) && !f.startsWith('src/generated/'))) {
        const contenido = read(ruta) ?? '';
        definiciones += (contenido.match(/export const UMBRAL_DE_PRIVACIDAD\s*=/g) ?? []).length;
      }
      if (definiciones !== 1) {
        return fail([
          `El umbral de privacidad se define ${definiciones} veces: debe ser uno solo (dos privacidades es ninguna).`,
        ]);
      }

      // El indicador territorial pasa sus cuentas de personas por el umbral.
      const indicador = read('src/modules/dashboards/application/territorial-indicators.ts');
      if (indicador === null) return fail(['No se encuentra el indicador territorial.']);
      if (!indicador.includes("from '@/platform/privacy/threshold'")) {
        return fail(['El indicador territorial no usa el umbral compartido.']);
      }
      for (const cuenta of ['aplicarUmbral(asistentes)', 'aplicarUmbral(constancias)']) {
        if (!indicador.includes(cuenta)) {
          return fail([`El indicador territorial no pasa por el umbral la cuenta de personas: falta ${cuenta}.`]);
        }
      }

      return ok(['Los indicadores territoriales agregan las cuentas de personas con un umbral único y compartido.']);
    },
  },
  {
    id: 'C-F9-05',
    title: 'Fase 9: la transparencia pública publica agregados con umbral, nunca datos de personas',
    phases: [9],
    run() {
      // El alcance de la fase incluye «transparencia publicada». Una página
      // pública que dijera quién hizo qué no sería transparencia, sería una
      // fuga. Este control vigila que la transparencia (a) solo cuente —nada de
      // nombres, folios ni identificadores— y (b) pase las cuentas de personas
      // por el umbral de privacidad.
      const fuente = read('src/modules/dashboards/application/public-transparency.ts');
      if (fuente === null) return fail(['No se encuentra la transparencia pública.']);

      // Se mira el código, no los comentarios: la prosa que explica la regla
      // nombra «folios» e «identificadores», y eso no es tocar el dato.
      const codigo = fuente
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((linea) => !linea.trim().startsWith('*') && !linea.trim().startsWith('//'))
        .join('\n');

      // Solo agregados: cuenta, no nombra. Ningún dato que señale a una persona.
      for (const identificador of ['givenName', 'familyName', 'publicId', 'folio', 'select:']) {
        if (codigo.includes(identificador)) {
          return fail([`La transparencia pública toca un dato de persona («${identificador}»): debe publicar solo agregados.`]);
        }
      }

      // Las cuentas de participación de personas pasan por el umbral compartido.
      if (!fuente.includes("from '@/platform/privacy/threshold'")) {
        return fail(['La transparencia pública no usa el umbral de privacidad compartido.']);
      }
      for (const cuenta of ['aplicarUmbral(personasFormadas)', 'aplicarUmbral(constanciasVigentes)']) {
        if (!fuente.includes(cuenta)) {
          return fail([`La transparencia pública no pasa por el umbral la cuenta de personas: falta ${cuenta}.`]);
        }
      }

      return ok(['La transparencia pública publica solo agregados, y las cuentas de personas pasan por el umbral.']);
    },
  },
  {
    id: 'C-F9-06',
    title: 'Fase 9: toda exportación queda auditada (criterio 4)',
    phases: [9],
    run() {
      // El criterio 4 exige que las exportaciones respeten permisos y **queden
      // auditadas**. Las exportaciones existen desde fases anteriores; este
      // control las mantiene auditadas: cada acción de exportación tiene que
      // registrarse en la bitácora desde su caso de uso, no salir sin rastro.
      const modulos = walk().filter((f) => /^src\/modules\/.+\.ts$/.test(f));
      const problemas = [];
      for (const accion of ['ROSTER_EXPORTED', 'DIRECTORY_EXPORTED', 'FINANCIAL_REPORT_EXPORTED']) {
        const auditada = modulos.some((ruta) => {
          const contenido = read(ruta) ?? '';
          return new RegExp(`action:\\s*AUDIT_ACTIONS\\.${accion}`).test(contenido);
        });
        if (!auditada) {
          problemas.push(`La exportación ${accion} no se registra en la bitácora: una exportación sin rastro no cumple el criterio 4.`);
        }
      }
      return problemas.length
        ? fail(problemas)
        : ok(['Las exportaciones de padrón, directorio y finanzas quedan registradas en la bitácora.']);
    },
  },
  {
    id: 'C-F9-07',
    title: 'Fase 9: las alertas de vencimiento no se repiten',
    phases: [9],
    run() {
      // El alcance incluye «alertas de vencimientos y obligaciones». Correr el
      // trabajo cada día no debe llenar el buzón de la misma persona con el
      // mismo aviso. La idempotencia se sostiene en el propio aviso —su
      // `relatedKind` y `relatedId`—: antes de crear uno se comprueba que no
      // exista ya. Sin esa comprobación, la segunda pasada duplica.
      const fuente = read('src/modules/notifications/application/expiry-alerts.ts');
      if (fuente === null) return fail(['No se encuentra el trabajo de alertas de vencimiento.']);

      // El aviso lleva de qué vencimiento es, para poder reconocerlo.
      if (!/relatedKind:\s*input\.relatedKind/.test(fuente) || !/relatedId:\s*input\.relatedId/.test(fuente)) {
        return fail(['El aviso de vencimiento no lleva qué vence y cuál: sin eso no se puede evitar repetirlo.']);
      }

      // Antes de crear, se comprueba que no exista ya, y si existe no se crea.
      if (!/findFirst\(/.test(fuente) || !/if \(yaExiste !== null\) return 0;/.test(fuente)) {
        return fail(['El trabajo no comprueba si el aviso ya existe antes de crearlo: se repetiría cada pasada.']);
      }

      return ok(['Las alertas de vencimiento se dan una sola vez: el propio aviso es la marca de que ya se dio.']);
    },
  },
  {
    id: 'C-F9-08',
    title: 'Fase 9: el aviso web no llega a quien no lo pidió (criterio 9 bloque D)',
    phases: [9],
    run() {
      // La notificación web se distingue del centro y del correo: exige la
      // suscripción explícita del navegador de la persona. La garantía es que la
      // entrega web **nunca llama al servicio de push sin una suscripción
      // guardada**. Se sostiene en `deliverWebPushForNotification`: si no hay
      // suscripción, registra `SUPPRESSED` y sale antes de tomar el puerto.
      const fuente = read('src/modules/notifications/application/web-push.ts');
      if (fuente === null) return fail(['No se encuentra la entrega de avisos web.']);

      const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

      // La puerta: sin suscripción se suprime y se sale antes de tomar el puerto.
      const puertaIndex = sinComentarios.search(/if \(suscripciones\.length === 0\) \{[\s\S]*?return ok\(/);
      if (puertaIndex === -1) {
        return fail(['La entrega web no cierra la puerta: falta el corte «sin suscripción, no hay entrega».']);
      }

      // El puerto solo se toma después de esa puerta: si `webPushPort()` apareciera
      // antes del corte, se llamaría al servicio de push sin autorización.
      const puertoIndex = sinComentarios.indexOf('webPushPort()');
      if (puertoIndex === -1) {
        return fail(['La entrega web no toma el puerto de push por ninguna parte.']);
      }
      if (puertoIndex < puertaIndex) {
        return fail(['El puerto de push se toma antes de comprobar la suscripción: podría enviarse sin autorización.']);
      }

      // Y hay una prueba que rompe y restaura esa puerta con un puerto falso.
      const prueba = read('tests/integration/notification-web-push.test.ts');
      if (prueba === null || !/setWebPushForTests/.test(prueba) || !/toHaveLength\(0\)/.test(prueba)) {
        return fail(['Falta la prueba con puerto falso que verifica que sin suscripción el puerto no se llama.']);
      }

      return ok(['El aviso web solo sale a quien tiene una suscripción guardada: sin ella, el puerto no se llama.']);
    },
  },
  {
    id: 'C-F9-09',
    title: 'Fase 9: las plantillas de aviso están versionadas (criterio 2)',
    phases: [9],
    run() {
      // El criterio 2 exige que las plantillas estén versionadas. Dos cosas lo
      // sostienen y este control las vigila en `templates.ts`: que un borrador
      // **no sobrescriba** —calcula la versión siguiente a partir de la mayor,
      // nunca reescribe una existente—, y que publicar **retire** la versión
      // publicada anterior del mismo (código, canal, idioma), de modo que nunca
      // haya dos publicadas a la vez: la vigente es una, y las anteriores quedan
      // como historia, no borradas.
      const fuente = read('src/modules/notifications/application/templates.ts');
      if (fuente === null) return fail(['No se encuentra el caso de uso de plantillas de aviso.']);
      const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

      const problemas = [];

      // El borrador calcula la versión siguiente; no reescribe.
      if (!/orderBy:\s*\{\s*version:\s*'desc'\s*\}/.test(sinComentarios) || !/\(\s*ultima\?\.version\s*\?\?\s*0\s*\)\s*\+\s*1/.test(sinComentarios)) {
        problemas.push('El borrador no calcula la versión siguiente a partir de la mayor: una plantilla sin versión creciente no está versionada.');
      }

      // Al publicar, se busca la publicada anterior del mismo (código, canal, idioma) y se retira
      // esa misma —por su id—, no una cualquiera: la vigente pasa a historia.
      const buscaAnterior = /where:\s*\{\s*code:\s*plantilla\.code,\s*channel:\s*plantilla\.channel,\s*locale:\s*plantilla\.locale,\s*status:\s*'PUBLISHED'\s*\}/.test(sinComentarios);
      const retira = /where:\s*\{\s*id:\s*anterior\.id\s*\},\s*data:\s*\{\s*status:\s*'RETIRED'\s*\}/.test(sinComentarios);
      if (!buscaAnterior || !retira) {
        problemas.push('Publicar no retira la versión publicada anterior: sin eso podrían quedar dos vigentes y la versión dejaría de tener sentido.');
      }

      // Y hay una prueba que ejerce el versionado ejecutando el sistema.
      const prueba = read('tests/integration/notification-templates.test.ts');
      if (prueba === null || !/retiredVersion/.test(prueba)) {
        problemas.push('Falta la prueba que comprueba que publicar una versión retira la anterior.');
      }

      return problemas.length
        ? fail(problemas)
        : ok(['Las plantillas se versionan: el borrador no sobrescribe y publicar retira la versión anterior; nunca hay dos vigentes.']);
    },
  },
  {
    id: 'C-F10-01',
    title: 'Fase 10: los trece flujos E2E globales del §22.2 se ejercen íntegros',
    phases: [10],
    run() {
      // La Fase 10 exige la prueba integral de los trece flujos E2E globales del
      // PRD §22.2. La suite `fase10-flujos-globales.test.ts` los ejerce de
      // extremo a extremo sobre la base real; este control vigila que no se caiga
      // ninguno: que el archivo exista y declare los trece `describe('Flujo N ·
      // …')`. Quitar un flujo —o dejarlo sin describir— cae en rojo aquí antes de
      // que nadie crea que sigue probado.
      const fuente = read('tests/integration/fase10-flujos-globales.test.ts');
      if (fuente === null) return fail(['No se encuentra la suite integral de los trece flujos E2E globales (§22.2).']);
      const faltantes = [];
      for (let n = 1; n <= 13; n += 1) {
        if (!new RegExp(`describe\\(\\s*['\`]Flujo ${n} `).test(fuente)) faltantes.push(n);
      }
      return faltantes.length
        ? fail([`Faltan flujos E2E globales en la suite integral: ${faltantes.map((n) => `Flujo ${n}`).join(', ')}.`])
        : ok(['Los trece flujos E2E globales del §22.2 están en la suite integral, ejercidos de extremo a extremo.']);
    },
  },
  {
    id: 'C-F10-02',
    title: 'Fase 10: la revisión de seguridad cubre las catorce amenazas del plan (§20.5)',
    phases: [10],
    run() {
      // El PRD §20.5 y `docs/SECURITY.md` §8 enumeran catorce amenazas, y cada
      // una «tiene control, prueba automatizada y fase propietaria; la ausencia
      // de cualquiera de estas pruebas bloquea el cierre de su fase». La revisión
      // de seguridad de la Fase 10 exige que el plan siga completo —las catorce
      // filas, cada una con su control, su prueba y su fase— y que la suite de
      // revisión transversal exista.
      const plan = read('docs/SECURITY.md');
      if (plan === null) return fail(['No se encuentra docs/SECURITY.md.']);
      const seccion = plan.slice(plan.search(/^## 8\. Amenazas/m));
      if (seccion === '') return fail(['docs/SECURITY.md no tiene la sección §8 de amenazas.']);
      const problemas = [];
      for (let n = 1; n <= 14; n += 1) {
        // Cada fila empieza por «| n |» y ha de traer control, prueba y fase (cinco columnas).
        const fila = new RegExp(`^\\|\\s*${n}\\s*\\|([^\\n]*\\|){4}`, 'm').exec(seccion);
        if (fila === null) problemas.push(`La amenaza ${n} no está en la tabla del §8 con control, prueba y fase.`);
      }
      const suite = read('tests/integration/fase10-seguridad.test.ts');
      if (suite === null || !/Amenaza 2|Amenaza 14/.test(suite)) {
        problemas.push('Falta la suite de revisión de seguridad transversal (fase10-seguridad.test.ts).');
      }
      return problemas.length
        ? fail(problemas)
        : ok(['Las catorce amenazas del §20.5 siguen en el plan con control, prueba y fase; la revisión transversal existe.']);
    },
  },
];




/* ------------------------------------------------------------------ */
/* Ejecución                                                           */
/* ------------------------------------------------------------------ */

/**
 * Un control de una fase **ya cerrada sigue ejecutándose**.
 *
 * Antes solo corrían los de la fase activa, y eso convertía cada cierre en una
 * amnistía: los diez controles de la Fase 1 —el aislamiento entre entidades, que
 * ningún alcance se conceda por omisión, que no se invente un valor normativo—
 * dejaban de comprobarse el día que empezaba la Fase 2, justo cuando el código
 * que garantizan empieza a cambiar por razones ajenas. Una garantía que deja de
 * verificarse deja de ser una garantía; pasa a ser una frase en un informe
 * viejo.
 *
 * Los de fases **futuras** sí se saltan, y por una razón distinta: comprueban
 * cosas que todavía no existen, así que fallarían sin que nadie pudiera
 * arreglarlo.
 */
function applies(check, phase) {
  if (check.phases === 'all') return true;
  if (check.scope === 'exclusive') return check.phases.includes(phase);
  return check.phases.some((declarada) => declarada <= phase);
}

function main() {
  const active = readActivePhase();

  if (STATUS_ONLY) {
    if (active.error) {
      process.stdout.write(`Fase activa desconocida: ${active.error}\n`);
      process.exit(1);
    }
    process.stdout.write(`Fase activa: ${active.phase} — Estado: ${active.state}\n`);
    process.exit(0);
  }

  if (active.error) {
    const payload = { generatedAt: new Date().toISOString(), phase: null, result: 'FAIL', error: active.error, checks: [] };
    emit(payload, [`ERROR: ${active.error}`]);
    process.exit(1);
  }

  const phaseMeta = CONTRACT.phases.find((p) => p.id === active.phase);
  const lines = [];
  lines.push('');
  lines.push('  VERIFICACIÓN DE FASE — Plataforma Integral Fuerza Índigo');
  lines.push(`  Fase activa: ${active.phase} — ${phaseMeta ? phaseMeta.name : 'fase desconocida'}`);
  lines.push(`  Estado declarado: ${active.state}`);
  lines.push('');

  const results = [];
  for (const check of CHECKS) {
    const result = applies(check, active.phase)
      ? check.run()
      : skip('Corresponde a una fase posterior: comprueba algo que todavía no existe.');
    results.push({ id: check.id, title: check.title, ...result });
    const badge = result.status === 'PASS' ? 'OK  ' : result.status === 'SKIP' ? '--  ' : 'FALLA';
    lines.push(`  [${badge}] ${check.id}  ${check.title}`);
    for (const detail of result.details) lines.push(`          · ${detail}`);
  }

  const failed = results.filter((r) => r.status === 'FAIL');
  const passed = results.filter((r) => r.status === 'PASS');
  const skipped = results.filter((r) => r.status === 'SKIP');

  lines.push('');
  lines.push(`  Resumen: ${passed.length} aprobados, ${failed.length} fallidos, ${skipped.length} no aplicables.`);
  lines.push('');
  lines.push(
    failed.length === 0
      ? '  RESULTADO: la fase activa cumple los controles automatizables de la puerta universal (PRD §23.2).'
      : '  RESULTADO: la fase activa NO cumple la puerta universal. Corrija los controles fallidos antes de cerrar.',
  );
  lines.push('');

  const payload = {
    generatedAt: new Date().toISOString(),
    prdVersion: CONTRACT.prdVersion,
    phase: active.phase,
    phaseName: phaseMeta ? phaseMeta.name : null,
    declaredState: active.state,
    result: failed.length === 0 ? 'PASS' : 'FAIL',
    totals: { passed: passed.length, failed: failed.length, skipped: skipped.length },
    checks: results,
  };

  emit(payload, lines);
  process.exit(failed.length === 0 ? 0 : 1);
}

function emit(payload, lines) {
  const reportsDir = join(ROOT, 'reports');
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, 'phase-verify.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  if (JSON_ONLY) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else process.stdout.write(`${lines.join('\n')}\n`);
}

main();
