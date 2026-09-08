# Operación, recuperación y puesta en producción

> Manual operativo de la **Fase 10** (PRD §24). Reúne lo que hace falta para
> operar la plataforma en producción, recuperarla ante un fallo, observarla, y
> desplegarla. No repite el contrato (`docs/PRD.md`) ni el manual de puesta en
> marcha para desarrollo (`docs/HANDOFF.md`): esto es el manual de **operación**.
> El estado del proyecto lo declara solo `docs/PHASE_STATUS.md`.

## 1. Recuperación y restauración

La regla: **el sistema se reconstruye desde el repositorio y una copia de la
base; nada vive solo en un servidor.**

### 1.1 Ejercicio de recuperación en ambiente controlado

Probado en `tests/integration/fase10-operacion.test.ts`: una base levantada
aplicando cada migración del repositorio y sembrada con `seed()` queda **sana**
—`healthReport()` reporta `base_de_datos`, `migraciones`, `semilla` y
`bitacora_encadenada` en `ok`—. Es la prueba de que el despliegue desde cero, y
por tanto la recuperación, funciona sin intervención manual.

### 1.2 Restauración de la base

1. Aprovisionar una base PostgreSQL 16 vacía con la extensión `pgvector`.
2. `npm run db:migrate` (aplica las migraciones del repositorio, en orden).
3. Restaurar la copia de datos (`pg_restore` del respaldo más reciente) **o**,
   para una instalación nueva, `npm run db:seed`.
4. `npm run db:check` — la base ha de coincidir con las migraciones del repositorio.
5. `GET /api/v1/health` (o `healthReport()`) — todos los subsistemas en `ok` o
   `degraded` justificado; ninguno en `failed`.

### 1.3 Restauración de archivos

Los archivos privados viven en el almacén de objetos (Vercel Blob en
producción; ver `docs/INTEGRATIONS.md` §4). La restauración es del propio
proveedor; la aplicación no guarda archivos en su proceso. Tras restaurar,
`healthReport().almacen_de_archivos` ha de reportar `PERSISTS`.

### 1.4 Copias de seguridad

- **Base:** copia gestionada por el proveedor (Neon), con retención según su
  política. La bitácora encadenada permite detectar cualquier alteración
  retrospectiva de lo restaurado (amenaza 14, `docs/SECURITY.md` §8).
- **Archivos:** versionado del propio almacén de objetos.
- **Secretos:** viven en el entorno (`docs/ENVIRONMENT.md`), nunca en la base ni
  en el repositorio; se rotan según la matriz de secretos de `docs/INTEGRATIONS.md` §9.

## 2. Observabilidad

Una sola vía expone el estado de todos los subsistemas: `healthReport()`
(`src/platform/health/health-check.ts`), servido en `/api/v1/health`. Comprueba
base de datos, migraciones, semilla, bitácora encadenada, protocolo de riesgo,
**trabajos programados**, **bandeja de salida**, correo, cobro, almacén de
archivos, inteligencia artificial, avisos web y firma de credenciales. Cada uno
reporta `ok`, `degraded` (estado de operación legítimo, p. ej. un canal sin
configurar) o `failed` (avería real).

- **Trabajos y webhooks:** `stuckJobs()` lista los trabajos agotados; la
  conciliación de webhooks desordenados (`retryUnreconciledWebhooks`) los
  resuelve sin perder ni duplicar (probado en `fase10-operacion.test.ts`).
- **Bitácora y alertas:** las acciones críticas quedan en `audit_event`
  (inmutable en la base). Los registros de aplicación **no llevan datos
  personales** (`docs/SECURITY.md` §6): se registran identificadores y huellas,
  no contenido.
- **SEO y aplicación instalable:** verificados de extremo a extremo en
  `tests/e2e/seo.spec.ts` y `tests/e2e/pwa.spec.ts`.
- **Rendimiento:** los flujos críticos se miden en `tests/e2e/performance/`.

## 3. Checklist de despliegue en Vercel

Antes de desplegar a producción, en orden:

1. **Variables de entorno** completas para producción según `docs/ENVIRONMENT.md`
   §11 (obligatorias por fase). Ningún secreto con prefijo `NEXT_PUBLIC_` salvo
   los declarados públicos por diseño.
2. **Base de datos** aprovisionada, con `pgvector`, `DATABASE_URL` y `DIRECT_URL`
   apuntando a producción.
3. **Migraciones** aplicadas (`npm run db:migrate`) y `npm run db:check` en verde.
4. **Trabajos programados** (Vercel Cron) configurados según `vercel.json`, con
   `CRON_SECRET` compartido.
5. **Webhooks de Stripe** apuntando a las rutas de cada cuenta, con sus secretos
   de firma (`STRIPE_*_WEBHOOK_SECRET`).
6. **Regiones y runtime** según la configuración del proyecto; cabeceras de
   seguridad activas.
7. **Puerta de calidad** en verde en la integración continua sobre el commit a
   desplegar (`npm run phase:verify`, lint, typecheck, pruebas, build, `db:check`,
   extremo a extremo y accesibilidad).
8. **Despliegue de vista previa** verificado antes del de producción (criterio
   transversal 12, PRD §25).

### Verificación posterior al despliegue

1. `GET /api/v1/health` — sin subsistemas en `failed`.
2. Un recorrido de humo de los flujos críticos del §22.2 (los mismos que
   `tests/integration/fase10-flujos-globales.test.ts` ejerce en integración).
3. Confirmar que la entrada pública, el acceso con sesión y la verificación de
   credenciales QR responden.

## 4. Migración de datos existentes

A la fecha no hay datos productivos que migrar (instalación nueva). Cuando los
haya, la migración se escribe como una migración correctiva del repositorio
—nunca reescribiendo una aplicada— y se prueba por los dos caminos que exige
`AGENTS.md`: sobre una base al día y sobre una instalación desde cero.

## 5. Capacitación administrativa

El material de capacitación para las personas administradoras se apoya en las
pantallas de gestión ya construidas y en este manual. Su **impartición** es un
acto de la organización y queda a cargo de la persona usuaria; esta sección es
el guion de referencia, no un sustituto de la sesión presencial.

## 6. Aprobación final por módulo

Cada módulo está construido y probado (unidad, integración y, donde aplica,
extremo a extremo y accesibilidad). La **aprobación final** es un acto humano de
la persona usuaria: esta matriz la registra. La columna «Aprobación» se llena
cuando la persona usuaria firma cada módulo; hasta entonces queda **pendiente de
su revisión**, no por falta de construcción.

| Módulo | Construido y probado | Aprobación (persona usuaria) |
|---|---|---|
| identity (identidad y cuentas) | Sí | Pendiente |
| access (roles y permisos) | Sí | Pendiente |
| membership (afiliación, padrones, credenciales) | Sí | Pendiente |
| billing (cobro y libro auxiliar) | Sí | Pendiente |
| documents (documentos y plantillas) | Sí | Pendiente |
| content (gestor de contenidos) | Sí | Pendiente |
| governance (gobierno y cargos) | Sí | Pendiente |
| assembly (asambleas y quórum) | Sí | Pendiente |
| election / voting (elecciones y voto secreto) | Sí | Pendiente |
| bargaining (negociación colectiva) | Sí | Pendiente |
| discipline (procedimientos disciplinarios) | Sí | Pendiente |
| cases / support (casos y entrada de apoyo) | Sí | Pendiente |
| ecosystem (catálogo de plataformas) | Sí | Pendiente |
| ai (inteligencia artificial gobernada) | Sí | Pendiente |
| notifications (centro, correo y avisos web) | Sí | Pendiente |
| events (eventos, asistencia y constancias) | Sí | Pendiente |
| dashboards (tableros e indicadores) | Sí | Pendiente |
| audit (bitácora encadenada) | Sí | Pendiente |
| admin (superadministración) | Sí | Pendiente |

## 7. Trazabilidad

| Requisito del PRD §24 Fase 10 | Dónde |
|---|---|
| Prueba integral de los 13 flujos E2E | `tests/integration/fase10-flujos-globales.test.ts` |
| Revisión de seguridad y de permisos | `tests/integration/fase10-seguridad.test.ts`, `docs/SECURITY.md` §8 |
| Recuperación y restauración | §1, `tests/integration/fase10-operacion.test.ts` |
| Conciliación Stripe; costos y límites | §2, `tests/integration/fase10-operacion.test.ts`; `docs/INTEGRATIONS.md` |
| Observabilidad; SEO y PWA | §2, `tests/e2e/{seo,pwa}.spec.ts`, `tests/e2e/performance/` |
| Migración reproducible | `tests/integration/migrations.test.ts`, `deployment.test.ts` |
| Manuales y checklist de Vercel | §1–§3 |
| Aprobación final por módulo | §6 |
