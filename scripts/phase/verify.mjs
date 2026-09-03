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
  const stateMatch = content.match(/^-\s*\*\*Estado:\*\*\s*`?(IN_PROGRESS|BLOCKED|APPROVED)`?/m);
  if (!phaseMatch) {
    return { phase: null, state: null, error: 'docs/PHASE_STATUS.md no declara "- **Fase activa:** N".' };
  }
  if (!stateMatch) {
    return { phase: Number(phaseMatch[1]), state: null, error: 'docs/PHASE_STATUS.md no declara "- **Estado:** IN_PROGRESS|BLOCKED|APPROVED".' };
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

/** Marcadores de trabajo inconcluso prohibidos por el PRD §0.3. */
const FORBIDDEN_MARKERS = [
  ['TO', 'DO'].join(''),
  ['FIX', 'ME'].join(''),
  ['HACK', ''].join(''),
  ['XX', 'X'].join(''),
  'próximamente',
  'proximamente',
  'lorem ipsum',
  'Lorem Ipsum',
  'placeholder de contenido',
];

/** Rutas exentas del control de marcadores: contienen el texto normativo o el propio control. */
const MARKER_ALLOWLIST = new Set([
  'docs/PRD.md',
  'scripts/phase/verify.mjs',
]);

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
            if (line.includes(marker)) {
              problems.push(`${file}:${index + 1} contiene el marcador "${marker}".`);
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
      for (const file of walk()) {
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
];

/* ------------------------------------------------------------------ */
/* Ejecución                                                           */
/* ------------------------------------------------------------------ */

function applies(check, phase) {
  return check.phases === 'all' || check.phases.includes(phase);
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
    const result = applies(check, active.phase) ? check.run() : skip('No aplica a la fase activa.');
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
