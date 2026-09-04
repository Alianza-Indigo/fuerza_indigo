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
| [0012](#adr-0012-secreto-del-voto-la-credencial-no-se-almacena-al-emitirse) | Secreto del voto: la credencial no se almacena al emitirse | Aceptada, sustituye la redacción original |
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
| [0025](#adr-0025-bandeja-de-salida-transaccional-para-otorgar-derechos) | Bandeja de salida transaccional para otorgar derechos | Aceptada |
| [0026](#adr-0026-actor-como-sujeto-de-atribución) | `Actor` como sujeto de atribución | Aceptada |
| [0027](#adr-0027-jerarquía-territorial-por-ruta-materializada) | Jerarquía territorial por ruta materializada | Aceptada |
| [0028](#adr-0028-pgvector-con-búsqueda-híbrida-para-la-base-documental) | pgvector con búsqueda híbrida para la base documental | Aceptada |
| [0029](#adr-0029-llavero-de-firma-con-identificador-de-clave) | Llavero de firma con identificador de clave | Aceptada |
| [0030](#adr-0030-el-verificador-comprueba-coherencia-no-solo-existencia) | El verificador comprueba coherencia, no solo existencia | Aceptada |

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

## ADR-0012 · Secreto del voto: la credencial no se almacena al emitirse

**Estado.** Aceptada. **Sustituye** la primera redacción de esta decisión, que titulaba "testigo ciego y urna sin identidad" y resultó insuficiente (defecto `D-F0-002`).

**Contexto.** PRD §9.5: la identidad del votante y la boleta deben separarse criptográfica y lógicamente; la auditoría debe demostrar elegibilidad y emisión sin revelar contenido.

**Por qué la primera decisión no bastaba.** Guardaba `VoteEligibility.blindTokenHash` junto a `membershipId`, y `Ballot.castAt` truncado al minuto. Eso deja dos vías de correlación: la huella del testigo permitiría unir ambas filas si la boleta la referenciara, y —aun sin referenciarla— con pocos votos por minuto basta comparar `ballotConsumedAt` con `castAt` para emparejar persona y boleta. Además, un identificador UUIDv7 en la boleta codifica el instante del depósito en el propio identificador, de modo que truncar la columna temporal no servía de nada. La decisión afirmaba una garantía que el modelo no sostenía.

**Decisión.**

1. **La credencial de voto no se almacena al emitirse.** Se generan 32 bytes aleatorios, se firman con HMAC bajo una clave derivada por proceso y se entregan al navegador de la persona. El servidor no guarda ni el valor ni su huella. Del lado identificado solo queda `VoteEligibility.credentialIssued` (booleano) y `credentialIssuedOn` (**fecha civil**, sin hora).
2. **La urna no tiene tiempo ni identidad.** `Ballot` carece de `membershipId`, `personId`, IP, agente de usuario y de **toda** columna temporal, incluido `createdAt`. Su clave primaria es **UUIDv4**, excepción documentada a la convención UUIDv7, porque un identificador ordenable en el tiempo reintroduciría la fuga que se busca cerrar.
3. **El doble depósito se impide sin identificar.** Al depositar se verifica la firma y se inserta `SpentVoteCredential` con la huella de la credencial, en la misma transacción que la boleta. Esa fila tampoco tiene tiempo ni identidad.
4. **La verificación la conserva la persona.** El `verificationCode` de su boleta le permite comprobar que fue contada en la lista que publica el acta. La lista publica los códigos escrutados, **no** el sentido de cada uno: la persona verifica inclusión sin poder demostrar ante un tercero por quién votó, lo que retira el instrumento de la coacción.
5. **El acuse se emite al entregar la credencial, no al depositar.** Crear el acuse en el depósito produciría dos filas nacidas en la misma transacción —una identificada y otra no— cuyo orden físico permitiría emparejarlas.
6. **La clave HMAC del proceso se destruye al certificar los resultados**, de modo que nadie pueda fabricar credenciales válidas retroactivamente.

**Consecuencia asumida.** Quien obtiene su credencial y se abstiene es indistinguible de quien depositó. Es el precio directo de no crear el vínculo: acreditar el depósito por persona exigiría exactamente la correspondencia que se decidió no persistir. Los conteos agregados —elegibles, credenciales emitidas, credenciales consumidas, boletas contadas— detectan la diferencia sin señalar a nadie. Los límites del diseño están enunciados sin adorno en `SECURITY.md` §9.3.

**Verificación.** `E2E-07` ejecuta una prueba adversaria sobre un volcado completo tras una votación con tres personas electoras. Con ese volumen, cualquier fuga temporal residual sería trivial de explotar; que la prueba pase es lo que convierte la afirmación en demostración.

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

---

## ADR-0025 · Bandeja de salida transaccional para otorgar derechos

**Contexto.** Un pago confirmado debe activar una membresía, un derecho de herramienta, un servicio CIAN o un programa CENI. El PRD §11.4 exige que el webhook actualice pagos y derechos de acceso mediante transacciones. Pero el mapa de módulos sitúa `billing` **por debajo** de esos módulos y prohíbe dependencias circulares: si `billing` los invocara, rompería el grafo. La primera redacción de la arquitectura mencionaba "un evento de dominio o un módulo de coordinación superior" sin decidir cuál ni definirlo (defecto `D-F0-006`).

**Decisión.** Bandeja de salida transaccional en `platform/events`, del que dependen tanto el publicador como los consumidores:

1. El webhook escribe, **en una sola transacción**, el `Payment`, el `LedgerEntry`, el `AuditEvent` y un `OutboxMessage` con el evento de dominio.
2. Tras confirmar, el mismo proceso intenta la entrega **en memoria**; en operación normal el derecho se otorga en el mismo instante.
3. Si esa entrega falla o el proceso termina antes, el despachador de trabajos reintenta desde el mensaje persistido.
4. Cada manejador es idempotente por `(outboxMessageId, handlerCode)`, de modo que la entrega al menos una vez produce efecto exactamente una vez.
5. `billing` publica un nombre de evento; no conoce a sus consumidores. `membership`, `tools`, `cian`, `ceni` y `events` registran manejadores; no conocen a `billing`.

**Alternativa descartada.** Un módulo coordinador por encima de todos, que hospedara el webhook y ejecutara el otorgamiento en la misma transacción. Es más simple de leer, pero concentra el conocimiento de todos los módulos de derechos en un punto: cada herramienta, programa o servicio nuevo obligaría a modificarlo, en contra de la extensibilidad que pide el PRD §24 Fase 7.

**Consecuencia asumida.** La activación deja de ser síncrona en sentido estricto. Es aceptable y hasta deseable: el PRD §11.4 ya prohíbe activar derechos desde la página de retorno del navegador, de modo que la interfaz debía mostrar un estado de confirmación en curso de todas formas. Un mensaje sin entregar tras agotar reintentos genera alerta y aparece en el panel de salud.

---

## ADR-0026 · `Actor` como sujeto de atribución

**Contexto.** Los campos de autoría del modelo apuntaban a `User`. Pero el Superadmin raíz **no tiene fila en `User`** por exigencia del PRD §4.4, y los trabajos programados tampoco. Sus actos quedaban sin poder atribuirse (defecto `D-F0-005`).

**Decisión.** Una entidad `Actor` con `kind` (`PERSON`, `ROOT_SUPERADMIN`, `SYSTEM_JOB`, `MIGRATION`), `userId` opcional y `label`. Todos los campos de autoría del modelo —`createdByActorId`, `updatedByActorId`, `AuditEvent.actorId`— apuntan a ella.

**Cómo se concilia con el PRD §4.4.** La fila de `Actor` del Superadmin raíz **no es una credencial ni una fuente de permisos**: no guarda contraseña, no concede nada, borrarla no le quita el acceso y crearla no se lo da. Su autenticación sigue viniendo de `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD_HASH`, y sus permisos de la lista cerrada `SUPERADMIN_GRANTED`. Es un asidero de atribución, no un sujeto de autorización. La prohibición del PRD apunta a que su **acceso** no dependa de un registro editable, y eso se mantiene intacto.

**Alternativas descartadas.** Denormalizar `actorKind` + `actorUserId` + `actorLabel` en cada entidad: triplica columnas en más de ciento cincuenta tablas y pierde la integridad referencial. Crear cuentas de usuario ficticias para el sistema: peor que el problema, porque una cuenta ficticia puede recibir permisos por error y aparecer en padrones o directorios.

---

## ADR-0027 · Jerarquía territorial por ruta materializada

**Contexto.** `TerritorialUnit` necesita consultas eficientes de descendientes para el alcance territorial de los permisos. La primera redacción dejó la elección abierta entre `ltree` y texto materializado, que es exactamente la clase de decisión que el PRD §0.1 obliga a cerrar en la Fase 0 (defecto `D-F0-010`).

**Decisión.** **Ruta materializada en `text`**, con formato `/nacional/mx/jal/guadalajara/seccion-3` e índice B-tree con `text_pattern_ops` para las consultas por prefijo. La descendencia se resuelve con `path LIKE '/nacional/mx/jal/%'`.

**Por qué no `ltree`.** Es más expresivo y más rápido en jerarquías profundas, pero exige habilitar una extensión y, sobre todo, Prisma no lo tipa: obligaría a declararlo como tipo no soportado y a escribir SQL crudo en las consultas de alcance, que son las más críticas del sistema en materia de seguridad. Prefiero que el filtro territorial —del que depende el aislamiento entre delegaciones— viva en código tipado y verificable. La jerarquía real tiene seis niveles como mucho, donde la ventaja de rendimiento de `ltree` es irrelevante.

**Consecuencia.** La ruta se recalcula cuando una unidad cambia de padre, en una transacción que actualiza también la de sus descendientes. Es una operación rara y administrativa, y queda auditada.

---

## ADR-0028 · pgvector con búsqueda híbrida para la base documental

**Contexto.** El PRD §15.2 contrata búsqueda semántica sobre una base documental autorizada. El modelo solo tenía `KnowledgeSource` con un `chunkCount` que presuponía una fragmentación inexistente: ni entidad de fragmento, ni almacenamiento de vectores, ni estrategia de recuperación (defecto `D-F0-009`).

**Decisión.** `KnowledgeChunk` con `embedding vector(768)` mediante la extensión **pgvector** sobre Neon, índice HNSW con distancia coseno, más `tsvector` con índice GIN para la mitad léxica. La recuperación es **híbrida**: vecinos más próximos y coincidencia léxica combinados por fusión de rangos.

**El filtro de permisos va dentro de la consulta.** `requiredPermissionCode` se copia de la fuente al fragmento para poder filtrar en la misma consulta del vecino más próximo. Recuperar primero y filtrar después significaría que el modelo ya vio fragmentos que la persona no puede leer, lo que incumpliría la separación de fuentes por permisos del PRD §15.5.

**Por qué no un índice vectorial externo.** El PRD §26 deja fuera de alcance la infraestructura ajena a Vercel, Neon y Vercel Blob. pgvector mantiene los fragmentos en la misma base, en la misma transacción y bajo las mismas políticas de acceso y retención que el resto del modelo.

---

## ADR-0029 · Llavero de firma con identificador de clave

**Contexto.** `QR_SIGNING_SECRET` era una clave única sin versión. Rotarla invalidaba de golpe todas las credenciales sindicales y todos los distintivos CENI vigentes, lo que convertía una medida rutinaria de higiene criptográfica en un incidente institucional (defecto `D-F0-012`).

**Decisión.** La variable pasa a ser un **llavero**: una lista de entradas `identificador:clave`, donde la primera es la activa. `MemberCredential` y `CeniCertificate` guardan en `signingKeyId` la clave con la que se firmaron. Rotar consiste en anteponer una clave nueva; lo emitido antes sigue verificando con la anterior mientras permanezca en el llavero.

**Consecuencia operativa.** Una entrada solo se retira cuando ya no queda credencial viva que dependa de ella. El panel de salud muestra ese conteo por clave antes de permitir el retiro, porque retirar una clave con credenciales vigentes sí produce la invalidación masiva que esta decisión evita.

---

## ADR-0030 · El verificador comprueba coherencia, no solo existencia

**Contexto.** La primera versión de `phase:verify` daba por modelada una entidad **con encontrar su nombre en el documento**. Sus quince controles pasaron en verde sobre una Fase 0 que contenía doce contradicciones entre documentos, y esa señal verde sirvió para declararla aprobada (defecto `D-F0-013`).

**Decisión.** El verificador incorpora controles de **coherencia** que comprueban relaciones entre documentos y propiedades estructurales del contenido, no solo su presencia. Los primeros ocho, cada uno derivado de un defecto real de esta fase:

| Control | Qué impide que vuelva a ocurrir |
|---|---|
| `C-DATA-03` | Que una entidad se dé por modelada por aparecer su nombre: exige bloque de definición con campos |
| `C-COH-01` | Que una relación se declare como arreglo de identificadores (`D-F0-003`) |
| `C-COH-02` | Que una decisión quede redactada como disyuntiva abierta (`D-F0-010`) |
| `C-COH-03` | Que una entidad se use en una fase anterior a aquella en que se migra (`D-F0-007`, `D-F0-008`) |
| `C-COH-04` | Que el algoritmo de decisión conceda a un actor por vía rápida (`D-F0-001`) |
| `C-COH-05` | Que la urna recupere identidad o marca temporal (`D-F0-002`) |
| `C-COH-06` | Que se declare `APPROVED` una fase con defectos abiertos (la causa raíz del cierre revocado) |
| `C-COH-07` | Que un defecto registrado quede sin tarea de corrección |

**Principio que queda establecido.** Un control automatizado solo prueba lo que mide. Cuando el resultado en verde de un control se use para justificar una decisión, hay que preguntarse antes qué **no** mide. La lista de controles crece con cada defecto que se descubra: un defecto que no deja tras de sí un control es un defecto que puede repetirse.

---

## ADR-0031 · ESLint fijado en la línea 9 mientras el ecosistema de React alcanza la 10

**Contexto.** El proyecto arrancó con ESLint 10.9.1, la versión más reciente. La configuración de Next se cargaba a través del puente `FlatCompat`, que bajo ESLint 10 falla al intentar serializar el grafo de complementos —es circular— y aborta antes de revisar un solo archivo. Retirado el puente, `eslint-plugin-react` 7.37.5, que `eslint-config-next` arrastra, llama a `context.getFilename()`, API que ESLint 10 eliminó. Su rango de compatibilidad declarado termina en `^9.7`.

**Decisión.** ESLint queda fijado en **9.39.5**, la línea de mantenimiento, y la configuración importa directamente `eslint-config-next/core-web-vitals`, que desde la versión 16 ya es configuración plana nativa. Se retira la dependencia `@eslint/eslintrc`.

**Por qué no la alternativa.** Desactivar `eslint-plugin-react` para conservar la versión 10 habría dejado sin revisar las reglas de accesibilidad y de reglas de los ganchos, que son precisamente las que el PRD §5 vuelve obligatorias. Un revisor que no revisa lo que importa es peor que un revisor una versión más antiguo.

**Cuándo se revierte.** Cuando `eslint-plugin-react` publique compatibilidad con ESLint 10, se sube la dependencia y se retira este anclaje. La condición es comprobable: `npm view eslint-plugin-react peerDependencies`.

---

## ADR-0032 · Los campos de formulario se leen con tipo, no con `String()`

**Contexto.** `FormData.get` devuelve `string | File | null`. Las acciones de servidor leían sus campos con `String(formData.get('email') ?? '')`. Si alguien envía un archivo en un campo de texto —cosa trivial con un formulario alterado—, esa expresión produce la cadena literal `[object File]`, que sigue viaje hasta la validación y hasta las comparaciones de credenciales como si fuera un valor tecleado.

**Decisión.** Toda lectura pasa por `textField(formData, nombre)` en `@/platform/http/form-fields`, que devuelve el valor solo cuando es una cadena y `''` en cualquier otro caso. Un valor que no es texto **no es texto vacío**: es un campo ausente. La misma regla se aplica a las cargas de los trabajos en segundo plano, que llegan de la base de datos como JSON sin forma garantizada (`textValue` y `stringMap` en `src/platform/jobs/handlers.ts`).

**Consecuencia.** El envío manipulado recibe exactamente el mismo mensaje que un campo en blanco. No se le confirma que su manipulación fue detectada, y tampoco entra en la lógica de negocio.

---

## ADR-0033 · La intercepción de peticiones usa la convención `proxy`

**Contexto.** Next 16 declara obsoleta la convención `middleware` y la sustituye por `proxy`. La compilación lo advierte en cada ejecución.

**Decisión.** El archivo es `proxy.ts` con exportación por defecto. El contenido no cambia y ADR-0002 sigue vigente: **aquí no se decide ninguna autorización**, solo se propaga la correlación y la ruta. Arrancar una plataforma nueva sobre una convención ya obsoleta contradice el §0.3 del PRD.

---

## ADR-0034 · Nombrar es un acto institucional: la facultad vive en la Secretaría Ejecutiva

**Contexto.** `assignRole` y `revokeRole` estaban escritos, probados y documentados, pero ningún rol de la semilla recibía `access.role.assign` y el Superadmin raíz no lo tiene por diseño. En un despliegue nuevo, nadie podía nombrar a nadie, nunca. El defecto no lo detectaba ninguna prueba negativa: todas seguían en verde, porque todas comprobaban que quien **no** debe nombrar no puede.

**Decisión.** La facultad reside en `EXECUTIVE_SECRETARY`, que es el `office.appoint` de la matriz de [`PERMISSIONS.md`](PERMISSIONS.md) §4. **No** se añade a la lista cerrada del actor raíz: administrar la plataforma y gobernar el sindicato son cosas distintas, y nombrar pertenece a lo segundo.

**El problema del primer nombramiento.** Si solo la Secretaría Ejecutiva puede nombrar y no existe ninguna, nadie de dentro del sistema puede crear la primera. Ese nombramiento viene necesariamente de fuera, igual que la contraseña del actor raíz: `npm run access:bootstrap` lo hace desde la consola de operación. El guion **se niega a ejecutarse** en cuanto existe una Secretaría vigente, de modo que no se queda como puerta trasera permanente; a partir de ahí los nombramientos ocurren dentro de la plataforma, con motivo escrito y registro en la bitácora.

**Consecuencia que se acepta.** La regla de no elevación acota a la Secretaría Ejecutiva a otorgar roles cuyos permisos ya posee. No puede, por tanto, crear una Comisión de Vigilancia ni una auditoría, que tienen permisos que ella no tiene. Es correcto: esos cargos los elige la asamblea, no los nombra el Comité Ejecutivo, y su alta llega con el módulo de gobernanza de la Fase 7.

---

## ADR-0035 · Descargar lo propio es un permiso distinto de descargar lo ajeno

**Contexto.** La persona titular de un documento no podía abrirlo. Su rol de afiliación no tiene `files.file.download` —y no debe tenerlo, porque le daría también los documentos de las demás personas de su alcance—, de modo que la titularidad no bastaba. La matriz de permisos ya decía `O`, «solo lo propio», pero el catálogo no tenía ningún permiso que expresara esa `O`.

**Decisión.** Se añade `files.file.download_own`. Exige asignación viva, que para este permiso es precisamente la titularidad, y **no** exige motivo escrito: pedirle a alguien que justifique por qué abre su propio expediente sería tratarla como sospechosa de sí misma. `authorizeDownload` elige el permiso según quién pide: la titular por la vía de lo propio, el resto por la de los expedientes ajenos.

**Por qué no la alternativa.** Dar la descarga general a los roles de afiliación habría resuelto el caso de la titular abriendo, de paso, los documentos de todas las demás. Un permiso demasiado ancho concedido para resolver un caso estrecho es la forma más común de que una matriz de permisos deje de significar lo que dice.

---

## ADR-0036 · Las pruebas de integración clonan una plantilla y se conectan con el rol acotado

**Contexto.** Buena parte de lo que la Fase 1 garantiza no vive en el código de la aplicación sino en el motor de base de datos: los índices únicos parciales, el bloqueo consultivo que serializa la cadena de la bitácora, el `FOR UPDATE SKIP LOCKED` de la cola y la revocación de `UPDATE` y `DELETE` sobre las bitácoras. Un doble en memoria las daría todas por buenas sin comprobar ninguna.

**Decisión.** `global-setup` construye una base **plantilla** aplicando `prisma migrate deploy` sobre una base vacía —el mismo camino que ejecuta un despliegue— y cada archivo de prueba la clona con `CREATE DATABASE ... TEMPLATE`. El aislamiento no depende de que la prueba recuerde limpiar lo que escribió: la base entera se destruye al terminar.

La aplicación se conecta durante las pruebas con el rol **sin** privilegios de modificación sobre las bitácoras, igual que en producción. Es la única forma de que la prueba de inmutabilidad demuestre algo: conectada como propietaria, el `UPDATE` prohibido tendría éxito y la garantía quedaría sin verificar.

**Lo que esta decisión hizo posible.** El arnés encontró, en su primera ejecución, que la migración inicial creaba `audit_event` sin `chainKey` ni `chainSequence`. El modelo era correcto, el código compilaba y toda acción auditada habría fallado en producción.

---

## ADR-0037 · Un origen desconocido no comparte cubo con todo el sistema

**Contexto.** El límite de intentos omitía el filtro cuando la petición no traía origen identificable. El recuento pasaba entonces a abarcar los fallos de **todo** el sistema: bastaba un atacante sin IP reconocible para agotar el cupo y dejar fuera a las personas legítimas. Una medida contra el abuso convertida en el abuso mismo.

**Decisión.** Un discriminante ausente se cuenta como el valor nulo y agrupa los orígenes desconocidos entre sí, que es un cubo acotado y separado del de cada origen conocido. Un recuento sin ningún discriminante **lanza** en vez de contar todo: es un error de programación, y fallar ruidosamente es preferible a aplicar un límite global sin que nadie lo pretendiera.

---

## ADR-0038 · Un alcance total se declara; nunca se hereda de un campo vacío

**Contexto.** El motor de políticas convertía un nombramiento sin entidad jurídica en alcance a **todas** las entidades. [`PERMISSIONS.md`](PERMISSIONS.md) §6 decía desde el principio lo contrario: «un permiso sin entidad en el contexto no lee nada». Con dos personas morales separadas por diseño, y con el guion de arranque creando la primera Secretaría Ejecutiva sin entidad, la primera persona operadora quedaba con acceso transversal a las dos (defecto `D-F1-012`).

Ninguna prueba lo detectaba porque las fixtures fijaban `legalEntityId: null` como valor por omisión: todas corrían con el caso defectuoso, y ninguna comprobaba qué debía ocurrir con él.

**Decisión.** Un nombramiento sin entidad no alcanza ninguna. El alcance total sigue existiendo para el actor raíz y para los trabajos programados, pero se declara de forma explícita en su propia rama de `resolveGrants`, no por omisión de un campo. Al otorgar, un rol con permisos exige entidad jurídica, y uno de alcance `ORGANIZATION` exige además organización.

**La asimetría con las organizaciones es deliberada.** Las dos entidades son personas morales distintas y ningún nombramiento debe cruzarlas por descuido. Las organizaciones viven **dentro** de una entidad, y hay cargos —la coordinación del CENI— cuya función es verlas todas. Ahí `null` sí significa «todas las de su entidad», porque la comprobación de entidad ya acotó antes. Lo que evita el descuido es que un rol de alcance `ORGANIZATION` no pueda nombrarse sin ella.

**Principio que queda.** Un valor por omisión que amplía el acceso es un permiso que nadie concedió. Cuando la ausencia de un dato tenga que significar algo, que signifique lo restrictivo.

---

## ADR-0039 · La máscara es para mostrar; para agrupar hace falta una huella

**Contexto.** El límite de intentos agrupaba por `subjectLabel`, que es el correo enmascarado. La máscara no es inyectiva: conserva las dos primeras letras, la última y el dominio, de modo que `pedro@dominio` y `pedrito@dominio` producen la misma. Dos personas distintas compartían cupo, y los intentos fallidos contra una cuenta bloqueaban otra, por accidente o a propósito (defecto `D-F1-015`).

**Decisión.** El recuento se agrupa por `subjectKey`, una huella HMAC del correo normalizado con `AUTH_SECRET`. Agrupa sin colisionar y sin conservar el correo en claro. `subjectLabel` se queda para lo único que siempre debió hacer, que es mostrarse en la bitácora.

**Principio que queda.** Un valor pensado para ser legible por una persona está pensado para perder información. Usarlo como clave hace que dos cosas distintas se traten como la misma, y en un control de seguridad eso se convierte en una vía de denegación de servicio contra terceros.

---

## ADR-0040 · Los valores normativos no se rellenan: se declaran ausentes

**Contexto.** La semilla creaba el conjunto de reglas estatutarias con quince días de anticipación para la asamblea ordinaria, ocho para la extraordinaria, un treinta y tres por ciento de firmas para convocarla y la reelección permitida. Un comentario los atribuía a «los valores del PRD §9.3 y §9.4». El PRD no los contiene: dice «anticipación mínima de convocatoria **conforme a los estatutos vigentes**», «el **porcentaje estatutario** de agremiados» y «posibilidad de reelección **conforme a los estatutos vigentes**». Los cuatro estaban inventados, y citados como si tuvieran fuente. Además la versión se declaraba `IN_FORCE` desde el 1 de enero de 2026, una fecha de entrada en vigor que tampoco aportó nadie (defecto `D-F1-013`).

**Decisión.** El conjunto se siembra en **borrador**, sin fecha de vigencia —que pasa a ser opcional en el modelo, porque un borrador no la tiene—, y contiene solo los valores que el PRD enuncia de forma expresa. Los que remite a los estatutos se enumeran en `_pendientesDeEstatutos`, con el motivo de cada ausencia.

**Por qué enumerar y no omitir.** Un valor ausente en silencio se lee como un hueco y se rellena. Un valor ausente **declarado** dice qué falta y por qué, y obliga a que alguien con facultades cargue los estatutos antes de poner la versión en vigor.

**Principio que queda, y es el más importante de esta fase.** Un número inventado en un sistema sindical no es un dato de relleno: es la regla con la que se convoca una asamblea y con la que se impugna. Cuando la fuente no dice un valor, el sistema no lo elige. Y una cita a una fuente es una afirmación comprobable: si se escribe «§9.4», ahí tiene que estar.

---

## ADR-0041 · Una redirección sobrevive a la página que la originó

**Contexto.** Una dirección publicada es una promesa: alguien la escribió en un volante, la mandó por mensaje o la citó en un oficio. Cuando un contenido se muda o se archiva, esa dirección tiene que seguir llevando a alguna parte y con el código de estado correcto, para que los buscadores trasladen lo que ya tenían. La forma barata de resolverlo es un campo `slugAnterior` en la página.

**Decisión.** Tabla propia `ContentRedirect`, con la dirección de origen única en toda la instalación y destino que puede ser una página del gestor o una ruta fija. La redirección **no** se borra cuando desaparece la página que la originó.

**Por qué.** Un campo en la página solo admite una dirección anterior, y una página que ha cambiado tres veces de sitio tiene tres. Además, la dirección vieja tiene que seguir funcionando aunque la página se archive: si la redirección colgara de la página, archivarla rompería los enlaces justo cuando más circulan.

**Lo que no hace.** No sigue cadenas: si el destino de una redirección es a su vez el origen de otra, se devuelve el primer salto. Seguirlas invitaría a un ciclo y a una petición que no termina; el precio es un salto extra en el navegador, que es barato y visible. Y un destino que no está publicado no es destino: se responde 404 directo en vez de mandar a la persona a un 404 detrás de una redirección.

---

## ADR-0042 · El actor raíz no tiene voz editorial

**Contexto.** El PRD §16.1 dice que «el Superadmin y los roles de comunicación autorizados» gestionan los contenidos. La arquitectura del actor raíz lo impide: no tiene fila en `User`, y toda versión editorial exige autoría identificada.

**Decisión.** El actor raíz no recibe ningún permiso del módulo `content`. Ni escritura, ni publicación, ni lectura.

**Por qué la escritura no.** Firmar un comunicado del sindicato con un actor sin persona detrás deja sin respuesta la pregunta de quién lo publicó, que es exactamente la que se hace cuando un comunicado se discute.

**Por qué tampoco la lectura.** Un borrador sobre un conflicto laboral es deliberación interna del sindicato. Diagnosticar por qué una página no aparece necesita su **estado** —publicada, programada, con versión vigente—, no su cuerpo, y eso lo da el panel de salud sin leer una sola línea de texto.

**Principio que queda.** Cuando el PRD concede una facultad a un actor cuya arquitectura la vuelve imposible de ejercer con responsabilidad, la respuesta no es forzar la arquitectura ni conceder a medias: es no conceder, y decir por qué.

---

## ADR-0043 · Un solo cargador para los archivos de entorno

**Contexto.** El repositorio leía `.env.local` con dos cargadores distintos: el de Next en la aplicación y el nativo de Node en las pruebas de integración. No coinciden. El de Next expande variables, de modo que `$argon2id` dentro de un valor se sustituye por el contenido de una variable inexistente y el hash del Superadmin llega mutilado; el nativo no expande nada y devuelve las contrabarras del escape tal cual. El valor más sensible del archivo es justo el que los dos estropean, cada uno de una forma distinta y ninguno con un error visible.

**Decisión.** Todo lo que lee `.env.local` fuera del servidor —migraciones, semillas, pruebas— pasa por `loadLocalEnv()`, que usa el cargador de la aplicación. La línea del archivo la compone `envFileLine()`, con el único escape que ese analizador desescapa, y se niega a escribir un valor que el formato no represente sin pérdida en vez de escribirlo mal. Una prueba escribe cada caso, lo carga en un proceso nuevo con el cargador real y compara con el original.

**Principio que queda.** Dos lectores del mismo archivo con reglas distintas no son redundancia: son dos verdades. Y cuando la discrepancia no produce un error sino un valor plausible pero equivocado, el fallo aparece lejos de su causa.

---

## ADR-0044 · La entrada pública amplía `SupportRequest`; no crea una tabla paralela

**Contexto.** La Fase 2 contrata «formularios de contacto y entrada inicial». La primera versión de este trabajo creó una tabla `InboundInquiry` para lo que llega por la calle, razonando que un expediente de caso es otra cosa. Pero `docs/DATA_MODEL.md` §7 ya contrataba `SupportRequest` como entrada única de ayuda, con el mismo folio, los mismos datos de contacto y el mismo catálogo de doce tipos.

**Decisión.** Se implementa el subconjunto de entrada de `SupportRequest`. Las columnas de clasificación, canalización y conversión a caso las escribe la Fase 6, sobre la misma tabla.

**Por qué importa.** Dos tablas con el mismo propósito y distinto nombre no se quedan iguales: una recibe una corrección y la otra no, y al llegar la Fase 6 habría que decidir cuál es la buena, con datos reales en las dos. Un modelo de datos contratado es un compromiso, y apartarse de él sin decirlo es cómo se parte en dos.

**Las desviaciones se declaran.** `consentId` pasa a ser nulo porque `Consent` cuelga de `Person` y la entrada puede iniciarse sin cuenta; se añaden `GENERAL_CONTACT` al catálogo y `HANDLED` a la máquina de estados. Las tres constan en `docs/DATA_MODEL.md` §7 con su motivo, no en un comentario del código.

---

## ADR-0045 · Sin aviso de privacidad publicado no se recaba ningún dato

**Contexto.** El formulario público pide nombre, correo o teléfono y el relato de una situación que puede ser un conflicto laboral o una violencia. La Ley Federal de Protección de Datos Personales en Posesión de los Particulares exige un aviso de privacidad que identifique al responsable y señale su domicilio. El domicilio de las dos entidades consta «por definir» en la propia semilla: el registro sindical y el acta constitutiva todavía no lo aportan.

**Decisión.** La semilla crea el aviso en **borrador**, con las partes que sí son hechos comprobables del programa —qué campos se guardan, para qué, quién los ve, cuánto duran, cómo se ejercen los derechos—, y enumera lo que solo la organización puede aportar. El caso de uso se niega a guardar nada mientras no haya un aviso **publicado** para la entidad, y la pantalla lo dice sin rodeos y ofrece el correo directo.

**Por qué no redactarlo entero.** Un aviso de privacidad inventado no es un texto de relleno: es una declaración jurídica falsa firmada por la organización. Es el mismo error que inventar un valor estatutario (ADR-0040), con la diferencia de que este además la pone a incumplir.

**Por qué el sistema lo impide y no solo lo advierte.** Una advertencia se ignora. Un sistema que permite recabar datos sin aviso vigente pone a la organización a incumplir sin que nadie se dé cuenta, que es la peor forma de incumplir.

---

## ADR-0046 · Los privilegios de las pruebas se leen de las migraciones

**Contexto.** Cada archivo de prueba de integración clona una base plantilla, y el ayudante volvía a conceder privilegios al rol de la aplicación con una lista escrita a mano que repetía la de las migraciones. Al añadir una migración que retira `UPDATE` sobre una columna, las pruebas seguían corriendo con el privilegio puesto: daban por buena una inmutabilidad que solo existía en producción.

**Decisión.** El ayudante lee los archivos de migración, extrae sus sentencias `GRANT` y `REVOKE` en orden y las aplica.

**Comprobado quitándolo.** Con el replay desactivado, la prueba que verifica que el relato original no se puede alterar falla. Con él, pasa.

**Principio que queda.** Una prueba que comprueba menos que la realidad es peor que ninguna, porque además tranquiliza. Y una lista copiada a mano de otra lista es una promesa que nadie renueva.

---

## ADR-0047 · Las páginas legales se distinguen por dirección, no por columna nueva

**Contexto.** Fuerza Índigo y Alianza Índigo son personas morales distintas y cada una responde por su propio aviso de privacidad, sus términos y su vía para ejercer derechos de datos. La dirección de una página es única en toda la instalación, así que `legales/privacidad` solo puede pertenecer a una.

**Decisión.** Convención sobre la dirección: `legales/<documento>` es el texto común y `legales/<documento>/<entidad>` el propio de cada una. La ruta pública muestra las versiones que existan con un selector.

**Por qué no una columna.** Una columna paralela a la dirección obligaría a mantener dos fuentes de la misma verdad, y es cuestión de tiempo que discrepen. La dirección ya es única, ya se administra desde el panel editorial y ya la ve quien escribe el contenido.

**Por qué un selector y no elegir por quien lee.** Alguien que trata con las dos entidades necesita saber qué dice cada una. Elegir en su lugar sería decidir por él sobre un texto que le obliga.

---

## ADR-0048 · Un permiso sin pantalla desde la que ejercerlo no se concede

**Contexto.** ADR-0042 dejó al actor raíz `content.redirect.manage`, con el argumento de que una redirección es encaminamiento técnico y no voz institucional. Al construir la pantalla de redirecciones se vio que el área de gestión exige cuenta y el actor raíz no la tiene: no había forma de ejercerlo. Y sin lectura del gestor tampoco podría saber qué páginas existen ni comprobar que un destino sea el correcto.

**Decisión.** Se retira de la lista cerrada. Las redirecciones las mantienen `COMMUNICATIONS` y `EXECUTIVE_SECRETARY`, que ven el gestor y publican el contenido cuya dirección se muda.

**La alternativa que se descartó.** Duplicar la pantalla bajo `/superadmin`. Habría dado una segunda implementación del mismo caso de uso, y un actor que administra direcciones sin poder ver a qué apuntan.

**Principio que queda.** Un permiso que nadie puede ejercer no es inofensivo por no usarse: figura en la lista de lo que el actor más poderoso del sistema puede hacer, y esa lista es lo que alguien lee para saber qué está en juego si esa credencial se pierde. Concederlo «por si acaso» ensucia justo el documento que tiene que estar limpio.
