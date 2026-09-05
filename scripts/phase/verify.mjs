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

/** Defectos registrados en docs/PHASE_STATUS.md con su estado. */
function registeredDefects() {
  const status = read('docs/PHASE_STATUS.md');
  if (status === null) return [];
  const found = [];
  for (const line of status.split('\n')) {
    const m = line.match(/^\|\s*(D-F\d+-\d+)\s*\|.*\|\s*(Abierto|Cerrado)\s*\|/);
    if (m) found.push({ id: m[1], open: m[2] === 'Abierto', severity: line.split('|')[2]?.trim() ?? '' });
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
    title: 'Todas las entidades del PRD §18.1–18.10 están modeladas o consolidadas con justificación',
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
      const blocking = open.filter((d) => /Cr[íi]tica|Alta|Media/i.test(d.severity));
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
    title: 'Los 15 flujos E2E globales del PRD §22.2 están planificados',
    phases: 'all',
    run() {
      const plan = read('docs/TEST_PLAN.md');
      if (plan === null) return fail('No existe docs/TEST_PLAN.md.');
      const missing = CONTRACT.globalE2eFlows.filter((flow) => !plan.includes(flow));
      return missing.length
        ? fail(missing.map((flow) => `El flujo ${flow} no aparece en docs/TEST_PLAN.md.`))
        : ok(['15 flujos E2E globales planificados.']);
    },
  },
  {
    id: 'C-PHASE-01',
    title: 'El backlog cubre las 13 fases sin tareas huérfanas',
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
      return problems.length ? fail(problems) : ok(['13 fases con backlog asignado y sin tareas huérfanas.']);
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
    title: 'Fase 1: todo caso de uso exportado se invoca desde alguna pantalla o ruta',
    phases: [1],
    run() {
      // El defecto que este control impide: `assignRole` y `revokeRole` existían
      // completos, probados y documentados, y ninguna pantalla los llamaba. Una
      // función que nadie puede invocar es alcance no entregado, aunque el código
      // esté escrito.
      const superficies = walk().filter(
        (file) => (file.startsWith('app/') || file.startsWith('scripts/')) && /\.tsx?$/.test(file),
      );
      const invocado = superficies.map((file) => read(file) ?? '').join('\n');

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
            if (!new RegExp(`\\b${nombre}\\b`).test(invocado)) {
              problems.push(`${file} exporta "${nombre}" y ninguna pantalla, ruta o guion lo invoca.`);
            }
          }
        }
      }
      return problems.length
        ? fail(problems)
        : ok(['Todo caso de uso exportado tiene al menos una superficie que lo invoca.']);
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
        ['1', 'prueba negativa 1', /acceso horizontal|E2E-14|expediente ajeno|archivo ajeno/i],
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
