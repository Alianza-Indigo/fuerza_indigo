# Estado de fase

> Documento de seguimiento exigido por el PRD §23.1. Se actualiza durante toda la construcción. El verificador `npm run phase:verify` lee de aquí la fase activa y ejecuta los controles que le corresponden.

---

## Situación actual

- **Fase activa:** 0 — Arquitectura integral y preparación del repositorio
- **Estado:** `APPROVED`
- **Fecha de inicio:** 3 de septiembre de 2026
- **Fecha de cierre:** 3 de septiembre de 2026
- **SHA del punto de control:** registrado en el **Historial de fases** al final de este documento
- **Fase siguiente:** 1 — Infraestructura, datos, autenticación, permisos y Superadmin, **no autorizada** hasta que la persona usuaria lo indique expresamente

---

## Alcance contratado

El PRD §24 Fase 0 contrata: inspección del repositorio; inventario de código reutilizable y deuda; mapa de módulos y dependencias; modelo de dominios; diagrama completo de datos; matriz de roles, atributos y permisos; contratos de servicios e integraciones; arquitectura de rutas; estrategia de archivos; estrategia de auditoría; estrategia de Stripe por entidad; estrategia de IA y privacidad; mapa de consentimientos; catálogo inicial de estados y transiciones; plan de migraciones; plan de pruebas; ADR y documentación base; y configuración de seguimiento de fases.

Entregables contratados: `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/PERMISSIONS.md`, `docs/FLOWS.md`, `docs/INTEGRATIONS.md`, `docs/SECURITY.md`, `docs/TEST_PLAN.md`, `docs/PHASE_STATUS.md`, diagramas Mermaid mantenibles y backlog asignado a fases sin tareas huérfanas.

### Lo que esta fase deliberadamente **no** hace

El PRD §24 Fase 0 prohíbe implementar funciones de fases posteriores, salvo la infraestructura mínima necesaria para validar la arquitectura. En consecuencia, este repositorio **no** contiene todavía la aplicación Next.js, el esquema Prisma ni los comandos de calidad: son alcance de las Fases 1 y 2, según el calendario de [`BACKLOG.md`](BACKLOG.md). La infraestructura mínima incorporada se limita al verificador de fase, al contrato del PRD en formato legible por máquina y a la plantilla de variables de entorno.

---

## Criterios de aceptación

Criterios específicos del PRD §24 Fase 0:

| # | Criterio | Cumplimiento |
|---|---|---|
| 1 | Todas las entidades de las secciones §18.1 a §18.10 están modeladas o justificadamente consolidadas | Cumplido — 130 de 130 entidades verificadas por el control `C-DATA-01`; consolidaciones justificadas en `DATA_MODEL.md` §14 |
| 2 | Cada módulo conoce sus dependencias y no obliga a rediseñar identidad, permisos, pagos o archivos después | Cumplido — `ARCHITECTURE.md` §4, con reglas de frontera verificables por el linter desde la Fase 1 |
| 3 | Las diferencias entre agremiado, afiliado honorario y beneficiario protegido están reflejadas en datos y permisos | Cumplido — `DATA_MODEL.md` §5 (invariante de `MembershipType`) y `PERMISSIONS.md` §2 y §4 |
| 4 | La separación Fuerza Índigo / Alianza Índigo está resuelta antes de crear cobros o expedientes | Cumplido — `legalEntityId` presente desde el modelo; `INTEGRATIONS.md` §2.1 y `PERMISSIONS.md` §5 |
| 5 | No se implementan funciones de fases posteriores salvo infraestructura mínima | Cumplido — verificado por el control `C-F0-01` |

Criterios de la puerta universal del PRD §23.2 aplicables a una fase documental:

| # | Criterio | Cumplimiento |
|---|---|---|
| 1 | Todo el alcance de la fase implementado | Cumplido — 20 de 20 tareas de `F0` terminadas |
| 2 | Sin defectos conocidos de severidad crítica, alta o media | Cumplido — ver **Defectos abiertos** |
| 3 | Sin botones, rutas o acciones incompletas | Cumplido — la fase no introduce interfaz; los comandos declarados funcionan (ADR-0023) |
| 4 | Migraciones desde cero y desde la fase anterior | No aplica — no hay esquema todavía; el plan está en `ARCHITECTURE.md` §8 y se prueba en la Fase 1 |
| 5 | Permisos probados en positivo y en negativo | No aplica — no hay código ejecutable; el catálogo de pruebas obligatorias está contratado en `PERMISSIONS.md` §9 |
| 6 | Interfaz revisada en móvil y escritorio | No aplica en esta fase |
| 7 | Accesibilidad validada | No aplica en esta fase; umbrales contratados en `TEST_PLAN.md` §7 |
| 8 | Estados vacíos y de error terminados | No aplica en esta fase; contratados en `TEST_PLAN.md` §9 |
| 9 | Auditoría conectada | No aplica en esta fase; estrategia en `ARCHITECTURE.md` §10 |
| 10 | Documentación que refleja el código real | Cumplido — la documentación describe lo que existe y marca explícitamente lo que aún no |
| 11 | Lint, tipos, pruebas y build correctos | No aplica — se habilitan en la Fase 1 (ADR-0023); `phase:verify` sí se ejecuta y aprueba |
| 12 | Sin secretos ni datos reales en el repositorio | Cumplido — controles `C-REPO-04` y `C-ENV-02` |
| 13 | Informe de cierre emitido | Cumplido |

---

## Tareas completadas

Las 20 tareas de la sección **Fase 0** de [`BACKLOG.md`](BACKLOG.md) están terminadas:

| Id | Tarea | Evidencia |
|---|---|---|
| F0-ARQ-001 | Inspección del repositorio e inventario | Repositorio sin commits previos; sin código reutilizable ni deuda heredada. Registrado en **Inventario inicial** |
| F0-ARQ-002 | Capas y contratos de servicios | `ARCHITECTURE.md` §3, §6 |
| F0-ARQ-003 | Mapa de módulos y dependencias | `ARCHITECTURE.md` §4 |
| F0-ARQ-004 | Arquitectura de rutas y familias de API | `ARCHITECTURE.md` §7 |
| F0-DAT-001 | 130 entidades modeladas | `DATA_MODEL.md` §4 a §13 |
| F0-DAT-002 | Enumeraciones y máquinas de estado | `DATA_MODEL.md` §16 |
| F0-DAT-003 | Consolidaciones justificadas | `DATA_MODEL.md` §14 |
| F0-DAT-004 | Plan de migraciones | `ARCHITECTURE.md` §8 |
| F0-PER-001 | Matriz de roles y algoritmo de decisión | `PERMISSIONS.md` §2 a §5 |
| F0-PER-002 | Mapa de consentimientos | `PERMISSIONS.md` §6 |
| F0-ARC-001 | Estrategia de archivos | `ARCHITECTURE.md` §9, `INTEGRATIONS.md` §4 |
| F0-AUD-001 | Estrategia de auditoría | `ARCHITECTURE.md` §10, `SECURITY.md` §6 |
| F0-PAG-001 | Estrategia de Stripe por entidad | `INTEGRATIONS.md` §2 |
| F0-IA-001 | Estrategia de IA y privacidad | `INTEGRATIONS.md` §3, `SECURITY.md` §5 |
| F0-QA-001 | Plan de pruebas y quince flujos E2E | `TEST_PLAN.md` |
| F0-DOC-001 | Entregables documentales con diagramas | Directorio `docs/` |
| F0-DOC-002 | Registro de decisiones | `DECISIONS.md`, 24 entradas |
| F0-OPS-001 | Preparación del repositorio | `README.md`, `.gitignore`, `.editorconfig`, `.nvmrc`, `.env.example` |
| F0-OPS-002 | Verificador de fase y contrato del PRD | `scripts/phase/verify.mjs`, `scripts/phase/prd-contract.json` |
| F0-DOC-003 | Backlog completo asignado a fases | `BACKLOG.md` |

### Inventario inicial

El repositorio se encontró **vacío**: sin commits, sin archivos versionados y sin historial. No existía implementación previa que conservar (PRD §0 punto 2), ni deuda técnica heredada, ni rastro del proveedor prohibido por el PRD §0.2. Toda la arquitectura parte de cero, lo que elimina el riesgo de arrastrar decisiones incompatibles.

---

## Evidencias

| Evidencia | Ubicación |
|---|---|
| Documentación de arquitectura y sus doce entregables | `docs/` |
| Contrato del PRD legible por máquina | `scripts/phase/prd-contract.json` |
| Resultado de la verificación de fase | `reports/phase-verify.json` |
| Copia íntegra de la especificación maestra | `docs/PRD.md` |
| Diagramas Mermaid mantenibles | Integrados en `ARCHITECTURE.md`, `DATA_MODEL.md` y `FLOWS.md` |

---

## Pruebas y resultados

La Fase 0 no introduce código ejecutable de producto, por lo que su verificación es documental y automatizada mediante `npm run phase:verify`. Controles ejecutados:

| Control | Qué comprueba | Resultado |
|---|---|---|
| `C-REPO-01` | Los doce entregables documentales existen y tienen contenido sustantivo | Aprobado |
| `C-REPO-02` | No hay marcadores de trabajo inconcluso (PRD §0.3) | Aprobado |
| `C-REPO-03` | Cero coincidencias del proveedor prohibido fuera del control de cumplimiento (PRD §0.2) | Aprobado |
| `C-REPO-04` | No hay archivos de entorno ni material criptográfico versionado | Aprobado |
| `C-DATA-01` | Las 130 entidades del PRD §18 están en el modelo de datos | Aprobado |
| `C-DATA-02` | Hay diagramas Mermaid en arquitectura, datos y flujos | Aprobado |
| `C-ACCESS-01` | Los 19 roles base del PRD §4.2 están en la matriz de permisos | Aprobado |
| `C-ENV-01` | Las 22 variables del PRD §21 están en la plantilla y documentadas | Aprobado |
| `C-ENV-02` | La plantilla de entorno no contiene valores que parezcan secretos reales | Aprobado |
| `C-API-01` | Las 16 familias de endpoints del PRD §19.2 están contratadas | Aprobado |
| `C-TEST-01` | Los 15 flujos E2E globales del PRD §22.2 están planificados | Aprobado |
| `C-PHASE-01` | Las 13 fases tienen backlog asignado y no hay tareas huérfanas | Aprobado |
| `C-PHASE-02` | Este documento declara los apartados del PRD §23.1 | Aprobado |
| `C-F0-01` | No se implementaron funciones de fases posteriores | Aprobado |
| `C-F0-02` | Cada entregable referencia la sección del PRD que lo contrata | Aprobado |

Reproducir con:

```bash
npm run phase:verify
```

---

## Defectos abiertos

Ninguno de severidad crítica, alta o media.

| Id | Severidad | Descripción | Fase propietaria |
|---|---|---|---|
| — | — | Sin defectos registrados en la Fase 0 | — |

---

## Decisiones

24 decisiones de arquitectura registradas en [`DECISIONS.md`](DECISIONS.md), entre ellas: monolito modular en Next.js (ADR-0001), autenticación propia con Argon2id por el requisito de Superadmin sin base (ADR-0003), fronteras de módulo verificadas por el linter (ADR-0006), secreto del voto por testigo ciego y urna sin identidad (ADR-0012), abstracción de Stripe por entidad jurídica (ADR-0014), reglas estatutarias versionadas como dato (ADR-0022) y la regla de no declarar comandos que no funcionan (ADR-0023).

Ninguna decisión técnica fue trasladada a la persona usuaria, conforme al PRD §0.1.

---

## Riesgos identificados para las fases siguientes

Se registran aquí para que la fase propietaria los atienda, no como defectos de la Fase 0.

| Riesgo | Fase propietaria | Mitigación contratada |
|---|---|---|
| El secreto del voto es difícil de garantizar si el diseño se relaja al implementar | 5 | Prueba de no correlación sobre el volcado de la base en E2E-07 |
| La conciliación financiera puede degradarse con eventos fuera de orden | 3 | Persistencia previa al procesamiento y estado `UNRECONCILED` con alerta |
| Los compartimentos de datos clínicos pueden filtrarse por consultas cruzadas | 8 | Prohibición de consultas Prisma cruzadas entre módulos y prueba negativa por compartimento |
| El volumen del padrón puede degradar el directorio | 4 | Índices declarados en `DATA_MODEL.md` §15 y umbral de rendimiento en `TEST_PLAN.md` §8 |
| La reforma estatutaria podría alterar actos pasados | 5 | Reglas versionadas con vigencia y referencia guardada en cada acto (ADR-0022) |

---

## Historial de fases

| Fase | Inicio | Cierre | Estado | SHA del punto de control |
|---|---|---|---|---|
| 0 | 2026-09-03 | 2026-09-03 | `APPROVED` | por registrar tras el commit de cierre |
| 1 a 12 | — | — | No iniciadas | — |

---

## Informe de cierre de la Fase 0

La Fase 0 entregó la arquitectura completa que el PRD exige antes de construir módulos: capas y contratos de servicio, mapa de módulos con dependencias permitidas, arquitectura de las siete superficies de interfaz y de las dieciséis familias de API, las 130 entidades del PRD §18 con sus enumeraciones y máquinas de estado, la matriz de 19 roles con su algoritmo de decisión y el mapa de once propósitos de consentimiento, las estrategias de archivos, auditoría, cobro por entidad jurídica e inteligencia artificial, el plan de migraciones, el plan de pruebas con los quince flujos E2E globales y sus umbrales, 24 decisiones de arquitectura registradas y el backlog completo distribuido en trece fases sin tareas huérfanas.

Los quince controles automatizados de `npm run phase:verify` se ejecutan en verde, incluido el control de cumplimiento del PRD §0.2. No hay defectos abiertos de severidad crítica, alta o media. No se implementaron funciones de fases posteriores.

```text
FASE APROBADA — 100% COMPLETA
```

La Fase 1 **no** se inicia en esta ejecución. Queda a la espera de autorización expresa de la persona usuaria, conforme al PRD §23.3.
