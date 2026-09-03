# Registro de decisiones de arquitectura (ADR)

> Entregable de la **Fase 0** (PRD §24). El PRD §0.1 obliga al agente constructor a **decidir**, no a preguntar, las cuestiones puramente técnicas, y a registrar aquí cada decisión. Cada entrada declara contexto, decisión, alternativas descartadas y consecuencias.
>
> Criterio de decisión aplicado en todas ellas (PRD §0.1): respetar el PRD; ser compatible con Vercel, Neon, Prisma y Vercel Blob; reducir deuda técnica; preservar seguridad, trazabilidad y accesibilidad; ser mantenible por otros agentes; y evitar dependencias innecesarias.

| ADR | Decisión | Estado |
|---|---|---|
| [0001](#adr-0001-monolito-modular-en-nextjs-app-router) | Monolito modular en Next.js App Router | Aceptada |
| [0002](#adr-0002-prisma-sobre-neon-con-doble-conexión) | Prisma sobre Neon con doble conexión | Aceptada |
| [0003](#adr-0003-autenticación-propia-con-argon2id-y-sesiones-en-base) | Autenticación propia con Argon2id y sesiones en base | Aceptada |
| [0004](#adr-0004-zod-como-única-biblioteca-de-validación) | Zod como única biblioteca de validación | Aceptada |
| [0005](#adr-0005-server-actions-para-lo-interno-apiv1-para-lo-externo) | Server Actions para lo interno, `/api/v1` para lo externo | Aceptada |
| [0006](#adr-0006-fronteras-de-módulo-verificadas-por-el-linter) | Fronteras de módulo verificadas por el linter | Aceptada |
| [0007](#adr-0007-tailwind-css-con-primitivas-accesibles-y-tokens-propios) | Tailwind CSS con primitivas accesibles y tokens propios | Aceptada |
| [0008](#adr-0008-vitest-y-playwright) | Vitest y Playwright | Aceptada |
| [0009](#adr-0009-dinero-en-unidades-menores-con-moneda-explícita) | Dinero en unidades menores con moneda explícita | Aceptada |
| [0010](#adr-0010-identificadores-internos-uuidv7-y-públicos-opacos) | Identificadores internos UUIDv7 y públicos opacos | Aceptada |
| [0011](#adr-0011-auditoría-transaccional-anexable-y-encadenada) | Auditoría transaccional, anexable y encadenada | Aceptada |
| [0012](#adr-0012-secreto-del-voto-por-testigo-ciego-y-urna-sin-identidad) | Secreto del voto por testigo ciego y urna sin identidad | Aceptada |
| [0013](#adr-0013-archivos-privados-con-descarga-por-ruta-autenticada) | Archivos privados con descarga por ruta autenticada | Aceptada |
| [0014](#adr-0014-abstracción-de-stripe-por-entidad-jurídica) | Abstracción de Stripe por entidad jurídica | Aceptada |
| [0015](#adr-0015-internacionalización-sin-dependencia-externa) | Internacionalización sin dependencia externa | Aceptada |
| [0016](#adr-0016-correo-por-puerto-con-adaptadores-intercambiables) | Correo por puerto con adaptadores intercambiables | Aceptada |
| [0017](#adr-0017-trabajos-en-base-de-datos-disparados-por-vercel-cron) | Trabajos en base de datos disparados por Vercel Cron | Aceptada |
| [0018](#adr-0018-prohibición-absoluta-del-proveedor-vetado) | Prohibición absoluta del proveedor vetado | Aceptada |
| [0019](#adr-0019-separación-de-estados-de-solicitud-y-de-membresía) | Separación de estados de solicitud y de membresía | Aceptada |
| [0020](#adr-0020-borrado-lógico-con-retención-y-bloqueo-legal) | Borrado lógico con retención y bloqueo legal | Aceptada |
| [0021](#adr-0021-esquema-prisma-multiarchivo-por-dominio) | Esquema Prisma multiarchivo por dominio | Aceptada |
| [0022](#adr-0022-reglas-estatutarias-versionadas-como-dato) | Reglas estatutarias versionadas como dato | Aceptada |
| [0023](#adr-0023-el-repositorio-solo-declara-comandos-que-funcionan) | El repositorio solo declara comandos que funcionan | Aceptada |
| [0024](#adr-0024-verificador-de-fase-sin-dependencias) | Verificador de fase sin dependencias | Aceptada |

---

## ADR-0001 · Monolito modular en Next.js App Router

**Contexto.** El PRD §17.1 fija Vercel, Next.js con App Router y TypeScript estricto. Queda por decidir la forma interna: monolito modular, microservicios o aplicación con servicios auxiliares.

**Decisión.** Un **monolito modular**: una aplicación Next.js con módulos de dominio de fronteras explícitas, desplegada en Vercel, con Neon como única base de datos.

**Alternativas descartadas.** Microservicios por entidad jurídica: la separación que el PRD exige (§2.3) es de datos, permisos y contabilidad, no de infraestructura; repartir el sistema multiplicaría la complejidad operativa sin mejorar el aislamiento real, y rompería transacciones que deben ser atómicas (pago + membresía + credencial + auditoría). Servicios auxiliares fuera de Vercel: prohibido por el PRD §26.

**Consecuencias.** Las fronteras entre módulos dejan de estar garantizadas por la red y pasan a garantizarse por convención verificada (ADR-0006). Una fase puede tocar varios módulos sin coordinación de despliegues.

---

## ADR-0002 · Prisma sobre Neon con doble conexión

**Contexto.** Neon ofrece una conexión agrupada y una directa. Prisma requiere la directa para migraciones y funciona mejor con la agrupada en ejecución serverless.

**Decisión.** `DATABASE_URL` con la conexión agrupada para la aplicación y `DIRECT_URL` con la conexión directa exclusivamente para `prisma migrate` y las semillas. Las rutas que usan Prisma se ejecutan en el runtime de Node.js, no en el borde.

**Consecuencias.** El middleware no puede consultar la base: se limita a comprobaciones sin acceso a datos, y la autorización real ocurre en los casos de uso. Es una restricción deseable, porque impide que la seguridad dependa de una capa que puede omitirse.

---

## ADR-0003 · Autenticación propia con Argon2id y sesiones en base

**Contexto.** El PRD §4.4 exige un Superadmin definido por variables de entorno **sin registro en base**, y el §20.1 exige listado de sesiones propias, revocación inmediata, rotación tras autenticar e invalidación masiva por versión de sesión.

**Decisión.** Módulo de autenticación **propio**: sesión opaca cuyo hash se guarda en `Session`, cookie endurecida, y hash de contraseña **Argon2id** mediante `@node-rs/argon2` (binarios precompilados compatibles con el runtime de Node.js en Vercel). Parámetros iniciales documentados y almacenados junto al hash: memoria 19 MiB, iteraciones 2, paralelismo 1, con revisión al inicio de la Fase 12.

**Alternativas descartadas.** Una biblioteca de autenticación de propósito general: obligaría a modelar el Superadmin sin base como un caso especial fuera de su diseño, y a reimplementar de todos modos el listado y la revocación de sesiones. `bcrypt`: inferior frente a ataques con hardware especializado. JSON Web Tokens como sesión: no permiten revocación inmediata, requisito explícito del PRD.

**Consecuencias.** Cada inicio de sesión consulta la base; a cambio, revocar una sesión surte efecto de inmediato, que es lo que el producto necesita.

---

## ADR-0004 · Zod como única biblioteca de validación

**Contexto.** El PRD §17.1 admite "Zod o equivalente" y el §19.1 exige validar toda entrada en servidor.

**Decisión.** Zod, con esquemas **compartidos** entre cliente y servidor definidos en la capa de aplicación de cada módulo. El cliente valida para dar retroalimentación inmediata; el servidor valida siempre, sin excepción, y su resultado es el que decide.

**Consecuencias.** Un solo esquema por operación evita divergencias entre lo que el formulario acepta y lo que el caso de uso admite. Los mensajes de error se escriben en lenguaje claro y se muestran junto al campo (PRD §5.3).

---

## ADR-0005 · Server Actions para lo interno, `/api/v1` para lo externo

**Contexto.** El PRD §19.1 pide servicios de aplicación invocados por Server Actions o Route Handlers, y el §19.2 contrata familias de endpoints externos.

**Decisión.** Las operaciones internas se invocan por **Server Actions**; la API `/api/v1` existe para integraciones, verificación pública, webhooks y cron. Ambas rutas llaman al **mismo** caso de uso: no hay lógica duplicada ni un camino con menos verificaciones que el otro.

**Consecuencias.** No se crean endpoints externos "por si acaso": la familia queda contratada en la arquitectura y se implementa cuando su fase la habilita, siempre con autorización, validación, documentación y pruebas.

---

## ADR-0006 · Fronteras de módulo verificadas por el linter

**Contexto.** El PRD §17.2 prohíbe que rutas y componentes accedan directamente a Prisma, Blob, Stripe o Gemini. Una prohibición que solo vive en la documentación se incumple sin que nadie lo note.

**Decisión.** Reglas de importación en la configuración de ESLint que hacen **fallar la compilación** cuando: `app/**` importa `@prisma/client`, `@vercel/blob`, `stripe` o el SDK de IA; un módulo importa archivos internos de otro en lugar de su `index.ts`; o la capa de dominio importa infraestructura.

**Consecuencias.** La arquitectura deja de depender de la disciplina de quien escribe. `npm run lint` es parte de la puerta de salida de cada fase.

---

## ADR-0007 · Tailwind CSS con primitivas accesibles y tokens propios

**Contexto.** El PRD §5.1 recomienda Tailwind y componentes accesibles de shadcn/ui o equivalente, y exige que ningún componente de biblioteca se considere terminado hasta adaptarse a la identidad visual.

**Decisión.** Tailwind CSS con una capa de **tokens propios** (color, tipografía, espaciado, radio, sombra, movimiento) definidos como variables CSS, y primitivas accesibles basadas en Radix copiadas al repositorio y personalizadas, no consumidas como dependencia opaca. El tema claro y oscuro, las preferencias sensoriales y el control de densidad se resuelven sobre esos tokens.

**Consecuencias.** El sistema de diseño se construye en la Fase 2 y es el lenguaje visual de toda la plataforma; ningún módulo posterior introduce estilos ad hoc.

---

## ADR-0008 · Vitest y Playwright

**Contexto.** El PRD §17.1 fija Playwright y admite "Vitest o equivalente".

**Decisión.** Vitest para unidad, integración, contractuales y componentes; Playwright para E2E, accesibilidad automatizada y pruebas visuales. Un solo ejecutor para todo lo que no es navegador reduce configuración y tiempo de arranque.

---

## ADR-0009 · Dinero en unidades menores con moneda explícita

**Contexto.** PRD §18.11. Los importes cruzan Stripe, el libro auxiliar, el registro patrimonial y los reportes semestrales.

**Decisión.** `bigint` en unidades menores más `char(3)` ISO 4217 en toda columna monetaria. Prohibida la aritmética de punto flotante sobre importes; las conversiones a texto ocurren solo en la capa de presentación.

---

## ADR-0010 · Identificadores internos UUIDv7 y públicos opacos

**Contexto.** El PRD §18.11 exige identificadores opacos no secuenciales para exposición pública. Una clave primaria aleatoria pura degrada la localidad de los índices en tablas grandes como auditoría, pagos o padrón.

**Decisión.** Clave primaria **UUIDv7** (ordenable en el tiempo, no adivinable, con buena localidad de índice) y, para toda entidad expuesta al público, un `publicId` **independiente** generado con aleatoriedad criptográfica. Los códigos de credencial y de certificado se firman además con `QR_SIGNING_SECRET`. Los folios legibles son series controladas y nunca aparecen en una URL como identificador.

**Consecuencias.** Conocer un `publicId` no permite inferir otro, ni deducir volumen ni antigüedad, que es lo que el PRD busca impedir.

---

## ADR-0011 · Auditoría transaccional, anexable y encadenada

**Contexto.** PRD §20.4: eventos anexables, no editables desde la interfaz, con actor, acción, objeto, fecha, resultado, motivo, alcance y correlación.

**Decisión.** El evento se escribe **en la misma transacción** que el acto. Las tablas `AuditEvent` y `SecurityEvent` no reciben `UPDATE` ni `DELETE` del usuario de base de datos de la aplicación —privilegio retirado en la migración inicial—. Cada evento guarda el hash del anterior en su partición lógica.

**Alternativas descartadas.** Auditoría asíncrona por cola: podría perder eventos de actos ya consumados, que es justo lo que no debe ocurrir. Disparadores de base de datos: no conocen el motivo capturado por la persona ni el alcance efectivo del actor.

---

## ADR-0012 · Secreto del voto por testigo ciego y urna sin identidad

**Contexto.** PRD §9.5: la identidad del votante y la boleta deben separarse criptográfica y lógicamente; la auditoría debe demostrar elegibilidad y emisión sin revelar contenido.

**Decisión.** Tres almacenes separados: `VoteEligibility` prueba el derecho y consume un testigo ciego de un solo uso; `Ballot` guarda el sentido **sin** identidad, sin IP, sin agente de usuario y con la hora truncada al minuto; `VoteReceipt` entrega a la persona un acuse de que votó. La emisión del testigo y el depósito de la boleta ocurren en transacciones separadas para que el orden de inserción no revele la correspondencia.

**Consecuencias.** Un volcado completo de la base no permite reconstruir el sentido individual del voto. Esa propiedad se prueba explícitamente en E2E-07.

---

## ADR-0013 · Archivos privados con descarga por ruta autenticada

**Contexto.** PRD §17.4: los archivos son privados por omisión y no basta confiar en una URL difícil de adivinar.

**Decisión.** Todo objeto se escribe con acceso privado y ruta lógica opaca. Las descargas pasan por una ruta de la aplicación que **reevalúa la política** y emite una URL temporal cuya vigencia depende de la clasificación del archivo (tabla en `INTEGRATIONS.md` §4). El material sensible y clínico exige motivo y no admite vista previa en el navegador.

---

## ADR-0014 · Abstracción de Stripe por entidad jurídica

**Contexto.** PRD §11.2: cuentas independientes para Fuerza Índigo y Alianza Índigo, con la posibilidad de operar inicialmente una sola sin reconstruir el historial.

**Decisión.** Un `PaymentPort` con un adaptador **por cuenta**, seleccionado por `accountKey`. Cada cuenta tiene su ruta de webhook y su secreto. `legalEntityId` y `stripeAccountKey` se guardan en cada pago, asiento y suscripción desde el primer día.

**Consecuencias.** Migrar de una cuenta a dos es configuración. Un evento de una cuenta no puede afectar registros de la otra, y la conciliación por entidad es directa.

---

## ADR-0015 · Internacionalización sin dependencia externa

**Contexto.** PRD §5.2: español como idioma inicial y arquitectura internacionalizable, con extensión prevista a Latinoamérica.

**Decisión.** Catálogos de mensajes por módulo en archivos TypeScript tipados, resueltos en servidor, con `Intl` nativo para fechas, números y monedas. Sin biblioteca de internacionalización en la Fase 2; si el proyecto incorpora un segundo idioma con enrutamiento por idioma, se reevalúa y se registra un ADR nuevo.

**Consecuencias.** Cero dependencias para una necesidad que hoy es de un solo idioma, y ninguna cadena de texto incrustada en componentes, que es lo que haría costosa la traducción futura.

---

## ADR-0016 · Correo por puerto con adaptadores intercambiables

**Contexto.** PRD §16.2: proveedor de correo desacoplado y arquitectura preparada para WhatsApp o SMS sin asumirlos como requisito.

**Decisión.** `MailerPort` con tres adaptadores: `resend` para producción, `smtp` como alternativa institucional y `console` para desarrollo y pruebas. La selección es por `EMAIL_PROVIDER`. Agregar un canal nuevo es agregar un adaptador, no tocar los módulos que notifican.

---

## ADR-0017 · Trabajos en base de datos disparados por Vercel Cron

**Contexto.** PRD §17.5. Vercel no ofrece una cola persistente propia y el PRD prohíbe infraestructura fuera de Vercel, Neon y Vercel Blob (§26).

**Decisión.** Tabla `BackgroundJob` como cola, con toma de lote mediante `SELECT … FOR UPDATE SKIP LOCKED`, clave de idempotencia `(jobType, businessKey)`, reintentos con espera exponencial y alerta al agotarlos. Las rutas `/api/v1/cron/*` solo despachan y se autentican con `CRON_SECRET` comparado en tiempo constante.

**Consecuencias.** Sin dependencia de un servicio de colas externo, y con la ventaja de que el estado de cada trabajo es consultable y auditable como cualquier otro dato.

---

## ADR-0018 · Prohibición absoluta del proveedor vetado

**Contexto.** El PRD §0.2 prohíbe **Supabase** de forma absoluta: base de datos, autenticación, almacenamiento, funciones, tiempo real, SDK cliente o servidor, paquetes, adaptadores o tipos, variables de entorno, referencias en documentación y código o configuración heredada. Exige que una búsqueda global, sin distinguir mayúsculas y minúsculas, devuelva cero coincidencias fuera del propio control de cumplimiento.

**Decisión.** No se utiliza. Sus funciones se cubren así: persistencia con **Neon PostgreSQL + Prisma**; autenticación **propia** (ADR-0003); almacenamiento con **Vercel Blob** (ADR-0013); funciones con rutas y Server Actions de Next.js en Vercel; tiempo real, cuando se requiera, mediante consulta bajo demanda y notificaciones, sin canal persistente.

**Verificación.** El control `C-REPO-03` de `npm run phase:verify` recorre todo archivo de texto del repositorio y falla si la cadena aparece fuera de la lista de cumplimiento, que contiene únicamente los documentos que **explican** la prohibición: el PRD, esta entrada, la sección §11 de `SECURITY.md` y el propio verificador. El control se ejecuta en cada fase, no solo en la primera.

---

## ADR-0019 · Separación de estados de solicitud y de membresía

**Contexto.** El PRD §3.6 enumera quince estados bajo el rótulo "estados de membresía", pero los primeros pertenecen a la solicitud (borrador, enviada, en revisión) y los últimos a la relación ya constituida (activa, suspendida, vencida).

**Decisión.** Dos enumeraciones: `ApplicationStatus` para `MembershipApplication` y `MembershipStatus` para `Membership`, con una correspondencia **uno a uno** documentada en `DATA_MODEL.md` §16.1 que no pierde ninguno de los quince. Se agregan `WITHDRAWN` (desistimiento antes de resolver) y `PENDING_PAYMENT` (resolución favorable con cobro pendiente), estados reales que el sistema debe representar en lugar de fingir.

**Consecuencias.** Una fila de `Membership` nunca existe en estado "borrador", lo que permite índices únicos parciales correctos para impedir membresías activas duplicadas.

---

## ADR-0020 · Borrado lógico con retención y bloqueo legal

**Contexto.** PRD §18.11 y §17.4: conservar historial donde hay obligación, y no borrar archivos sin verificar retención, bloqueo legal y referencias.

**Decisión.** Borrado lógico (`archivedAt`, `deletedAt`) como comportamiento normal. La eliminación física solo la ejecuta el trabajo de retención cuando la política vence, **no** hay `LegalHold` activo y no quedan referencias vivas. Las bitácoras, los padrones congelados, las evaluaciones cerradas, los asientos contables y las boletas nunca se eliminan por esta vía.

---

## ADR-0021 · Esquema Prisma multiarchivo por dominio

**Contexto.** El modelo contrata 130 entidades. Un archivo único sería inmanejable para revisión humana y para agentes.

**Decisión.** Esquema multiarchivo bajo `prisma/schema/`, un archivo por dominio, con la misma división que el mapa de módulos. Las migraciones siguen siendo únicas y versionadas en el repositorio.

---

## ADR-0022 · Reglas estatutarias versionadas como dato

**Contexto.** PRD §9.3 y §9.4: periodos, umbrales de quórum, mayorías, integración de comisiones y reglas de proporcionalidad deben poder cambiar por reforma estatutaria **sin alterar retrospectivamente** actos anteriores.

**Decisión.** Entidad `NormativeRuleSet` con vigencia. Cada asamblea, elección, planilla, consulta y procedimiento disciplinario guarda el identificador de la versión con la que se ejecutó. Ninguna regla estatutaria se codifica como constante en el código.

**Consecuencias.** Una reforma es un alta de versión, no un cambio de código ni una migración de datos. Las asambleas pasadas conservan su cálculo original y siguen siendo reproducibles.

---

## ADR-0023 · El repositorio solo declara comandos que funcionan

**Contexto.** El PRD §22.3 contrata una lista de comandos de calidad y el §0.3 prohíbe botones sin acción y funciones incompletas.

**Decisión.** `package.json` declara únicamente los comandos que hacen lo que prometen en la fase activa. Los demás se incorporan en la fase que los habilita, según el calendario de `BACKLOG.md`. Un comando declarado que falla o no hace nada sería exactamente el "botón sin acción" que el PRD prohíbe.

---

## ADR-0024 · Verificador de fase sin dependencias

**Contexto.** El PRD §22.3 exige un `phase:verify` que produzca un resultado legible por humanos y por agentes, y el §23 hace del cierre de fase un acto verificable.

**Decisión.** `scripts/phase/verify.mjs` en Node.js puro, **sin dependencias**, ejecutable en un repositorio recién clonado y sin `npm install`. Lee la fase activa de `docs/PHASE_STATUS.md`, ejecuta los controles aplicables, imprime el resultado y escribe `reports/phase-verify.json`. Devuelve código de salida distinto de cero cuando algún control falla, de modo que la integración continua lo use como puerta.

**Consecuencias.** El contrato del PRD (entidades, roles, variables, familias de endpoints, flujos E2E, fases) vive en `scripts/phase/prd-contract.json` y se comprueba de forma automática, no por lectura humana. Los controles crecen con cada fase.
