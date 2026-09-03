# Estado de fase

> Documento de seguimiento exigido por el PRD §23.1. Se actualiza durante toda la construcción. El verificador `npm run phase:verify` lee de aquí la fase activa y ejecuta los controles que le corresponden.

---

## Situación actual

- **Fase activa:** 0 — Arquitectura integral y preparación del repositorio
- **Estado:** `APPROVED`
- **Fecha de inicio:** 3 de septiembre de 2026
- **Cierre revocado y reabierto:** 3 de septiembre de 2026, por revisión semántica externa
- **Cierre definitivo:** 3 de septiembre de 2026, tras corregir los catorce defectos y superar la segunda revisión
- **SHA del punto de control:** registrado en el **Historial de fases** al final de este documento
- **Fase siguiente:** 1 — Infraestructura, datos, autenticación, permisos y Superadmin, **no autorizada** hasta que la persona usuaria lo indique expresamente (PRD §23.3)

> **Historia de este cierre.** El 3 de septiembre de 2026 este documento declaró `APPROVED` apoyándose en que los quince controles de `npm run phase:verify` estaban en verde. Una revisión semántica encontró doce defectos que esos controles **no podían detectar**, porque comprobaban existencia, tamaño y presencia de nombres, no coherencia entre documentos. El cierre se revocó, se registraron los defectos, se corrigieron los catorce —los doce de la revisión, el del propio verificador y uno que los controles nuevos descubrieron al estrenarse— y el verificador pasó de quince a veintitrés controles. El registro de defectos se conserva completo: es la parte más útil de este documento para quien construya las fases siguientes.

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
| 1 | Todas las entidades de las secciones §18.1 a §18.10 están modeladas o justificadamente consolidadas | Cumplido — 130 entidades del PRD, 7 de apoyo y 26 tablas de relación, todas con bloque de definición. Controles `C-DATA-01`, `C-DATA-03` y `C-COH-01` |
| 2 | Cada módulo conoce sus dependencias y no obliga a rediseñar identidad, permisos, pagos o archivos después | Cumplido — la bandeja de salida transaccional resuelve el otorgamiento de derechos sin dependencia circular (ADR-0025) y el control `C-COH-03` verifica el orden entre fases |
| 3 | Las diferencias entre agremiado, afiliado honorario y beneficiario protegido están reflejadas en datos y permisos | Cumplido — invariante de derechos políticos, campos de solicitud condicionados por categoría y matriz de permisos diferenciada |
| 4 | La separación Fuerza Índigo / Alianza Índigo está resuelta antes de crear cobros o expedientes | Cumplido — `legalEntityId` presente desde el modelo; `INTEGRATIONS.md` §2.1 y `PERMISSIONS.md` §5 |
| 5 | No se implementan funciones de fases posteriores salvo infraestructura mínima | Cumplido — verificado por el control `C-F0-01` |

Criterios de la puerta universal del PRD §23.2 aplicables a una fase documental:

| # | Criterio | Cumplimiento |
|---|---|---|
| 1 | Todo el alcance de la fase implementado | Cumplido — 21 tareas de alcance y 14 de corrección terminadas |
| 2 | Sin defectos conocidos de severidad crítica, alta o media | Cumplido — los catorce registrados están cerrados con su corrección verificable. Control `C-COH-06` |
| 3 | Sin botones, rutas o acciones incompletas | Cumplido — la fase no introduce interfaz; los comandos declarados funcionan (ADR-0023) |
| 4 | Migraciones desde cero y desde la fase anterior | No aplica — no hay esquema todavía; el plan está en `ARCHITECTURE.md` §8 y se prueba en la Fase 1 |
| 5 | Permisos probados en positivo y en negativo | No aplica — no hay código ejecutable; el catálogo de pruebas obligatorias está contratado en `PERMISSIONS.md` §9 |
| 6 | Interfaz revisada en móvil y escritorio | No aplica en esta fase |
| 7 | Accesibilidad validada | No aplica en esta fase; umbrales contratados en `TEST_PLAN.md` §7 |
| 8 | Estados vacíos y de error terminados | No aplica en esta fase; contratados en `TEST_PLAN.md` §9 |
| 9 | Auditoría conectada | No aplica en esta fase; estrategia en `ARCHITECTURE.md` §10 |
| 10 | Documentación que refleja el código real | Cumplido — `SECURITY.md` §9 distingue ahora lo que el diseño garantiza de lo que no, y el control `C-COH-05` impide que el modelo se aparte de esa afirmación |
| 11 | Lint, tipos, pruebas y build correctos | No aplica — se habilitan en la Fase 1 (ADR-0023); `phase:verify` sí se ejecuta y aprueba |
| 12 | Sin secretos ni datos reales en el repositorio | Cumplido — controles `C-REPO-04` y `C-ENV-02` |
| 13 | Informe de cierre emitido | Cumplido — el informe vigente está al final de este documento |

---

## Tareas completadas

Las 20 tareas de la sección **Fase 0** de [`BACKLOG.md`](BACKLOG.md) se ejecutaron, pero cinco de ellas quedan **reabiertas** por los defectos registrados: `F0-DAT-001` (D-F0-003, D-F0-004, D-F0-005, D-F0-009), `F0-DAT-002` (D-F0-010), `F0-PER-001` (D-F0-001, D-F0-011), `F0-ARQ-003` (D-F0-006) y `F0-OPS-002` (D-F0-013). Se añaden las tareas de corrección `F0-COR-001` a `F0-COR-013`.


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
| `C-DATA-03` | Cada entidad tiene bloque de definición con campos, no una mención suelta | Aprobado |
| `C-COH-01` | Ninguna relación se modela como arreglo de identificadores | Aprobado |
| `C-COH-02` | No quedan decisiones redactadas como disyuntiva abierta | Aprobado |
| `C-COH-03` | Ninguna entidad depende obligatoriamente de otra de fase posterior | Aprobado |
| `C-COH-04` | El algoritmo de decisión no concede por vía rápida a ningún actor | Aprobado |
| `C-COH-05` | La urna no contiene identidad ni marca temporal | Aprobado |
| `C-COH-06` | Una fase con defectos abiertos no puede declararse aprobada | Aprobado |
| `C-COH-07` | Cada defecto abierto tiene su tarea de corrección | Aprobado |

Reproducir con:

```bash
npm run phase:verify
```

**Resultado: 23 aprobados, 0 fallidos.**

### Primera revisión semántica del 3 de septiembre de 2026

**Resultado: no aprobada.** Una revisión de coherencia entre documentos —no de existencia de documentos— encontró doce defectos que los quince controles automatizados no detectan, y un decimotercero en los controles mismos. El aprendizaje queda registrado como defecto `D-F0-013`: un control que comprueba que el nombre de una entidad aparece en un archivo **no** comprueba que esa entidad esté modelada, y una fase no puede declararse aprobada apoyándose en semejante señal.

La corrección de `D-F0-013` incorporó al verificador ocho controles de coherencia, detallados en [`TEST_PLAN.md`](TEST_PLAN.md) §11.2.

### Segunda revisión semántica del 3 de septiembre de 2026

**Resultado: aprobada.** Se ejecutó tras corregir los trece defectos y comprendió tres comprobaciones:

1. **Controles automatizados:** 23 aprobados, 0 fallidos. Los ocho nuevos se estrenaron sobre el material ya corregido.
2. **Hallazgo de los controles nuevos:** `C-COH-03` encontró en su primera ejecución once referencias hacia fases posteriores. Diez resultaron anulables y quedaron justificadas por escrito en el contrato del PRD; **una era obligatoria** y constituía un error real de orden de fases, registrado como `D-F0-014` y corregido. Vale la pena subrayarlo: el control encontró un defecto que ninguna de las dos revisiones humanas había visto.
3. **Prueba negativa de los controles nuevos:** un control que nunca ha fallado no está probado. Se reintrodujo deliberadamente cada defecto y se comprobó que su control lo detecta: un arreglo de identificadores (`C-COH-01` falla), identidad y marca temporal en la urna (`C-COH-05` falla con ambas), una vía rápida para el Superadmin (`C-COH-04` falla y además detecta el segundo punto de concesión) y un defecto abierto con la fase declarada aprobada (`C-COH-06` y `C-COH-07` fallan). Después se restauró el estado correcto.
4. **Barrido de residuos:** se buscaron referencias supervivientes al diseño anterior —`SUBSTANTIVE_ACTS`, `blindTokenHash`, `castAt`, `createdById`, arreglos de identificadores, conteos de entidades desactualizados— y se corrigieron nueve apariciones en cinco documentos. Corregir un diseño sin barrer sus restos deja documentación que se contradice a sí misma, que es la clase de defecto que originó este ciclo.

---

## Defectos abiertos

Trece defectos detectados por revisión semántica el 3 de septiembre de 2026, más uno detectado por los controles nuevos, todos con fase propietaria **0**. **Los catorce están cerrados.** Se conservan aquí, con su corrección, porque el PRD §23.1 exige el registro de defectos y porque el historial de lo que falló es la mejor guía para las fases siguientes.

| Id | Severidad | Descripción | Evidencia | Estado y corrección |
|---|---|---|---|---|
| D-F0-001 | Crítica | El algoritmo de decisión concede al Superadmin toda acción ausente de una lista de prohibiciones y retorna antes de verificar entidad, territorio, asignación, consentimiento y compartimento. Contradice la matriz, que le deniega lo clínico y lo disciplinario. | `PERMISSIONS.md` §5.1 | Cerrado — el algoritmo recorre la tubería completa con lista cerrada de concesión y compartimentos vacíos (`PERMISSIONS.md` §5.1). Control `C-COH-04` |
| D-F0-002 | Crítica | El testigo ciego electoral no tiene construcción criptográfica definida. `VoteEligibility.ballotConsumedAt` conserva precisión completa mientras `Ballot.castAt` se trunca al minuto: con volumen bajo, un cotejo temporal correlaciona persona y sentido del voto. La garantía afirmada en `SECURITY.md` §9 no es demostrable con este diseño. | `DATA_MODEL.md` §6, `SECURITY.md` §9 | Cerrado — la credencial no se almacena al emitirse; urna sin identidad, sin tiempo y con UUIDv4 (ADR-0012, `SECURITY.md` §9). Control `C-COH-05` |
| D-F0-003 | Alta | Veintiún campos modelan relaciones como arreglos de identificadores sin clave foránea ni integridad referencial, en contradicción con la regla de §3 y con la justificación de §14 que descartó esa forma para el padrón congelado y las planillas. | `DATA_MODEL.md`, campos `*Ids` de tipo `string[]` | Cerrado — 26 tablas de relación con clave foránea (`DATA_MODEL.md` §13.bis). Control `C-COH-01` |
| D-F0-004 | Alta | `MembershipApplication` exige ocupación, forma de trabajo, declaración de contacto con personas neurodivergentes y pertenencia a otro sindicato con independencia de la categoría, imponiendo requisitos laborales a la afiliación honoraria. | `DATA_MODEL.md` §5 | Cerrado — campos laborales anulables con obligatoriedad por categoría y comprobación en base (`DATA_MODEL.md` §5) |
| D-F0-005 | Alta | Los campos de autoría de las entidades base solo admiten `User`. El Superadmin raíz y los trabajos del sistema no tienen fila en `User`, de modo que sus actos no pueden atribuirse sin dejar nulos o inventar cuentas. La solución ya existe en `AuditEvent` y no se generalizó. | `DATA_MODEL.md` §3 | Cerrado — entidad `Actor` como sujeto de atribución (ADR-0026) |
| D-F0-006 | Alta | El cobro debe otorgar derechos de membresía, herramientas, CIAN y CENI dentro de una transacción, pero el mapa de módulos sitúa `billing` por debajo de ellos y prohíbe dependencias circulares, sin nombrar el coordinador ni el patrón de bandeja de salida que resolvería el conflicto. | `ARCHITECTURE.md` §4, `INTEGRATIONS.md` §2.4 | Cerrado — bandeja de salida transaccional con entrega inmediata y manejadores idempotentes (ADR-0025, `ARCHITECTURE.md` §4.3) |
| D-F0-007 | Media | La activación por invitación y la recuperación de contraseña se construyen en la Fase 1, pero las plantillas versionadas de notificación y el registro de entrega llegan en la Fase 11, pese a que las integraciones prohíben textos de mensaje incrustados en el código. | `BACKLOG.md` Fases 1 y 11, `INTEGRATIONS.md` §5 | Cerrado — las plantillas de mensaje y el registro de entrega se migran en la Fase 1 (`F1-NOT-001`) |
| D-F0-008 | Media | CENI se completa en la Fase 9, pero `TrainingRequirement` depende de `Event`, cuya entidad y funcionalidad se introducen en la Fase 11. CENI no podría cerrarse al cien por ciento en su propia fase. | `BACKLOG.md` Fases 9 y 11, `DATA_MODEL.md` §12 | Cerrado — la acreditación de capacitación CENI es por evidencia documental; el enlace con eventos es opcional y posterior |
| D-F0-009 | Media | La búsqueda semántica solo cuenta con `KnowledgeSource`. No hay entidad de fragmento, ni almacenamiento de vectores, ni decisión sobre el índice, pese a que `chunkCount` presupone una fragmentación que no está modelada. | `DATA_MODEL.md` §13 | Cerrado — `KnowledgeChunk` con pgvector, índice HNSW y búsqueda híbrida con filtro de permisos en la consulta (ADR-0028) |
| D-F0-010 | Media | `TerritorialUnit.path` deja abierta la elección entre `ltree` y texto materializado. El PRD §0.1 obliga a cerrar esa decisión en esta fase y registrarla. | `DATA_MODEL.md` §6 | Cerrado — ruta materializada en texto con índice de prefijo (ADR-0027). Control `C-COH-02` |
| D-F0-011 | Media | El rol de agremiado tiene lectura sobre `LedgerEntry`. El PRD §9.7 concede a los agremiados los informes financieros semestrales, no el libro auxiliar con movimientos individuales que pueden revelar quién pagó qué. | `PERMISSIONS.md` §4 | Cerrado — `accountability.read` para informes de rendición; `ledger.read` reservado (`PERMISSIONS.md` §4) |
| D-F0-012 | Media | `QR_SIGNING_SECRET` es una clave única sin identificador ni versión. Su rotación invalida de forma simultánea todas las credenciales sindicales y todos los distintivos CENI, en lugar de permitir la coexistencia de la clave anterior y la nueva. | `ENVIRONMENT.md` §9 y §10, `DATA_MODEL.md` §5 y §12 | Cerrado — llavero de firma con identificador de clave (ADR-0029) |

### Defecto encontrado por los controles nuevos

| Id | Severidad | Descripción | Estado y corrección |
|---|---|---|---|
| D-F0-014 | Alta | `MembershipApplication.acceptedStatuteVersionId` referenciaba **obligatoriamente** a `NormativeRuleSet`, que estaba asignada a la Fase 5. La Fase 4 no habría podido cerrarse al 100 %: no se puede aceptar una versión de estatutos que todavía no existe en la base. El defecto no lo vio ninguna persona: lo encontró el control `C-COH-03` en su primera ejecución, junto con otras diez referencias hacia adelante que resultaron ser anulables y quedaron justificadas por escrito. | Cerrado — las reglas estatutarias versionadas se migran y se siembran en la Fase 1, que es además donde la semilla ya las creaba |

### Defecto del propio control de calidad

| Id | Severidad | Descripción | Estado y corrección |
|---|---|---|---|
| D-F0-013 | Alta | `npm run phase:verify` comprueba existencia, tamaño y presencia de nombres, no coherencia entre documentos. `C-DATA-01` da por modelada una entidad con encontrar su nombre en el texto. Esta ceguera permitió declarar aprobada una fase con doce defectos y es, en sí misma, un defecto de la Fase 0. | Cerrado — ocho controles de coherencia en el verificador (ADR-0030, `TEST_PLAN.md` §11.2) |

---

## Decisiones

**30 decisiones** de arquitectura registradas en [`DECISIONS.md`](DECISIONS.md). Las estructurales: monolito modular en Next.js (ADR-0001), autenticación propia con Argon2id por el requisito de Superadmin sin base (ADR-0003), fronteras de módulo verificadas por el linter (ADR-0006), abstracción de Stripe por entidad jurídica (ADR-0014), reglas estatutarias versionadas como dato (ADR-0022) y la regla de no declarar comandos que no funcionan (ADR-0023).

Las seis nacidas de la corrección de defectos: secreto del voto sin almacenar la credencial (ADR-0012, que **sustituye** su primera redacción), bandeja de salida transaccional (ADR-0025), `Actor` como sujeto de atribución (ADR-0026), jerarquía territorial por ruta materializada (ADR-0027), pgvector con búsqueda híbrida (ADR-0028), llavero de firma con identificador de clave (ADR-0029) y verificación de coherencia (ADR-0030).

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
| 0 | 2026-09-03 | 2026-09-03 | `APPROVED` | por registrar tras el commit de cierre definitivo. El cierre revocado fue `a441aa7` |
| 1 a 12 | — | — | No iniciadas | — |

---

## Informe de cierre de la Fase 0

### Lo entregado

La Fase 0 entrega la arquitectura completa que el PRD exige antes de construir módulos:

- **Arquitectura:** capas con dirección de dependencias verificable, 39 módulos con sus fronteras, contratos uniformes de servicio, siete superficies de interfaz, dieciséis familias de API, estrategia de archivos, de auditoría y plan de migraciones.
- **Datos:** las 130 entidades del PRD §18, 7 de apoyo exigidas por el articulado y 26 tablas de relación, con enumeraciones, máquinas de estado, índices y reglas de integridad.
- **Acceso:** 19 roles, catálogo de permisos, matriz completa, seis alcances de aislamiento, algoritmo de decisión con un único punto de concesión y mapa de once propósitos de consentimiento.
- **Flujos:** veinte, con sus caminos alternos, de error, de autorización y de cancelación.
- **Integraciones:** Stripe por entidad jurídica, Gemini, Blob, correo, herramientas y trabajos programados, todos por puertos y adaptadores.
- **Seguridad:** catorce amenazas con control, prueba y fase propietaria, y una sección de secreto del voto que distingue lo que el diseño garantiza de lo que no.
- **Calidad:** pirámide de pruebas, quince flujos E2E globales, umbrales de accesibilidad y rendimiento, y 23 controles automatizados.
- **Gobierno del proyecto:** 30 decisiones registradas, backlog completo en trece fases sin tareas huérfanas y catorce defectos con su corrección.

### Lo aprendido

Este cierre se emite en segundo intento. El primero declaró la fase aprobada apoyándose en quince controles en verde que solo comprobaban existencia, tamaño y presencia de nombres. Tres consecuencias quedan incorporadas al proyecto:

1. **Un control solo prueba lo que mide.** Antes de usar un resultado en verde para justificar una decisión, hay que preguntarse qué **no** mide el control que lo produjo.
2. **Cada defecto deja tras de sí un control.** Los ocho controles de coherencia nacieron de defectos reales de esta fase. Un defecto sin control es un defecto que puede repetirse.
3. **Los controles encuentran lo que las revisiones humanas no ven.** `C-COH-03` descubrió, al estrenarse, una referencia obligatoria hacia una fase posterior que dos revisiones humanas habían pasado por alto y que habría impedido cerrar la Fase 4.

### Estado

Veintitrés controles automatizados en verde, incluido el de cumplimiento del PRD §0.2. Catorce defectos registrados y cerrados, cada uno con su corrección verificable. Cero defectos abiertos de severidad crítica, alta o media. Ninguna función de fases posteriores implementada.

```text
FASE APROBADA — 100% COMPLETA
```

La Fase 1 **no** se inicia en esta ejecución. Queda a la espera de autorización expresa de la persona usuaria, conforme al PRD §23.3.
