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

---

## ADR-0049 · Un precio no se edita: se cierra y nace otro

**Contexto.** El PRD §11.1 exige que los conceptos y sus precios se administren desde el sistema y no estén codificados en el frontend. Eso resuelve dónde vive un importe, pero no qué pasa cuando cambia. La forma obvia —una columna `amountMinor` que se actualiza— deja el sistema sin poder responder la única pregunta que se hace en una asamblea: cuánto se cobraba cuando se cobró.

**Decisión.** `CatalogPrice` es una serie versionada por concepto. Añadir un precio incrementa `version`, y la versión anterior se cierra poniéndole `effectiveTo` en el mismo instante en que empieza la nueva. Nunca hay dos vigencias solapadas. `currentPrice()` resuelve por vigencia —`effectiveFrom <= t < effectiveTo`— y no por la marca `isDefault`, porque un precio puede estar marcado por omisión y todavía no haber entrado en vigor.

**Por qué el importe se pide en unidades menores.** `amountMinor` es entero y `BigInt` en la base. La conversión de pesos a centavos ocurre en un solo sitio, al capturar. Si se aceptara un decimal, existiría un punto del sistema donde un importe es coma flotante, y ahí es donde aparecen los centavos que no cuadran en la conciliación.

**La alternativa que se descartó.** Guardar el historial en la bitácora y editar la fila. La bitácora prueba quién cambió qué; no sirve para calcular. Reconstruir el precio de marzo leyendo asientos de auditoría convertiría cada corte semestral en una investigación.

**Consecuencia para los pagos.** Un pago apunta a un `CatalogPrice`, no a un producto. El importe cobrado queda anclado a la versión con la que se cobró aunque el catálogo cambie al día siguiente.

---

## ADR-0050 · Archivar es reversible; borrar no existe

**Contexto.** Retirar un concepto del catálogo es frecuente y a veces equivocado. Borrarlo dejaría pagos apuntando a precios de un producto inexistente.

**Decisión.** `archiveProduct` marca `archivedAt` y baja `isActive`; el concepto sale del listado ordinario y conserva todos sus precios. `reactivateProduct` lo devuelve, con su historial intacto y sin reabrir ningún importe: cambiar una cantidad sigue exigiendo una versión nueva de precio. Ambos actos exigen motivo escrito y quedan en la bitácora.

**Por qué existe la reactivación y no solo el archivado.** El mensaje que ve quien intenta ponerle precio a un concepto archivado dice «reactívalo antes». Sin la operación, esa frase sería una instrucción imposible, y la única salida sería crear otro concepto con código distinto: el histórico de lo que es la misma cuota quedaría partido en dos.

**Una cuota extraordinaria no se crea sin acuerdo.** `UNION_DUE_EXTRAORDINARY` exige `authorizingResolutionNote`. La tabla `Resolution` llega en la Fase 5; hasta entonces el acuerdo se declara por escrito, y sin esa declaración el concepto no se crea. Cobrar una cuota extraordinaria que nadie acordó es el abuso que el PRD §9.4 previene.

---

## ADR-0051 · Un día del calendario se convierte en instante con la zona de quien lo captura

**Contexto.** Un campo de fecha entrega «2026-01-01», que es un día del calendario, no un instante. La conversión evidente, `new Date('2026-01-01T00:00:00Z')`, lo fija a la medianoche de Londres. En México eso son las seis de la tarde del 31 de diciembre: un precio acordado para enero empezaba a regir en diciembre, y la tabla que debía explicarlo lo presentaba con la fecha del día anterior.

**Decisión.** `startOfDayInZone(fecha, zona)` resuelve el desfase consultando la zona en ese mismo instante y repitiendo el cálculo una vez, que es lo que hace falta el día en que entra o sale el horario de verano. La zona sale del contexto de la persona, no del servidor. `todayInZone` da el día que se está viviendo donde está quien mira, y es lo que rellena por omisión un campo de fecha.

**Por qué no se guarda la cadena tal cual.** Una columna de texto con «2026-01-01» no se puede comparar con `effectiveFrom <= ahora` sin volver a decidir la zona en cada consulta, y esa decisión acabaría tomándose distinta en dos sitios.

**Alcance.** Vale para toda fecha que una persona captura como día —vigencias, cortes, periodos de conciliación— y no para las marcas de tiempo que pone el sistema, que ya son instantes.

---

## ADR-0052 · Pagar lo propio es un permiso, no una comprobación de identidad

**Contexto.** Iniciar un cobro a nombre propio parece no necesitar permiso: basta comprobar que quien paga es quien dice ser. Con esa lógica, cualquiera con cuenta vería un botón de pago.

**Decisión.** Existe `billing.checkout.start`, con titularidad exigida. Lo tienen los roles de afiliación y de solicitud; **no** lo tiene `PROTECTED_BENEFICIARY`.

**Por qué.** Un beneficiario protegido recibe apoyo sin pagar ni afiliarse (PRD §14). Ponerle delante un botón de cobro es lo contrario de lo que ese estatuto significa, y con una comprobación de identidad suelta esa exclusión no existiría en ninguna parte: sería una condición escrita en una pantalla, invisible en la matriz de permisos y fácil de perder en el siguiente rediseño. Como permiso, se ve, se audita y se hereda a quien nombre.

**Consecuencia que no se anticipó.** La regla de no elevación impide otorgar un rol con permisos que quien nombra no tiene, así que la Secretaría Ejecutiva necesitó el permiso para poder seguir nombrando agremiados. Lo detectó la prueba de esa regla antes de llegar a ninguna parte, y le corresponde igual por derecho propio: quien ocupa la cartera también paga su cuota.

---

## ADR-0053 · Volver del navegador no prueba ningún pago

**Contexto.** Al terminar en la pasarela, la persona vuelve a una dirección nuestra. Es tentador marcar el cobro como pagado ahí: es el momento en que se puede felicitar a alguien.

**Decisión.** El pago nace en `REQUIRES_PAYMENT` y ahí se queda hasta que llega el webhook firmado. La página de regreso dice que se está confirmando, que es la verdad. El PRD §11.4 lo contrata con todas sus letras.

**Por qué importa tanto.** Esa dirección la puede abrir cualquiera, las veces que quiera, sin haber pagado. Y aunque nadie la falsifique, un cargo autorizado todavía puede rechazarse después. Dar por bueno el regreso del navegador es como se acaban dando por cobrados pagos que el banco devolvió.

**Lo que sí se guarda al volver.** El identificador de la sesión de cobro, que es lo que permite casar el webhook con la intención cuando llegue.

---

## ADR-0054 · La idempotencia del cobro se apoya en la intención abierta, no en una clave eterna

**Contexto.** Pulsar dos veces «pagar» no puede abrir dos cobros. La solución evidente —una clave de idempotencia derivada de quién paga y qué paga— tiene un defecto que solo se ve más tarde: sería la misma cada mes, y quien vuelve a pagar su cuota en marzo recibiría la sesión de enero.

**Decisión.** Cada intención de cobro nace con su propia clave aleatoria. Un segundo intento sobre el mismo concepto, dentro de dos horas y todavía sin pagar, **reutiliza esa intención y su clave**: la pasarela devuelve la misma sesión en lugar de crear otra. Pasado ese rato, un intento nuevo es un cobro nuevo.

**Por qué dos horas.** Cubre de sobra a quien pulsa dos veces, vuelve atrás en el navegador o cierra la pestaña sin querer, y se queda muy por debajo de las veinticuatro horas que la pasarela conserva una clave, para que reutilizarla siga devolviendo la sesión y no un error por clave caducada.

---

## ADR-0055 · El portal de cliente no se reconstruye

**Contexto.** Cambiar la tarjeta, descargar recibos y cancelar una suscripción son pantallas que la pasarela ya ofrece y que se podrían rehacer aquí.

**Decisión.** Se abre el portal de la pasarela. Lo que la persona haga ahí vuelve por webhook, que es la fuente de verdad del estado financiero (PRD §11.4).

**Por qué.** Rehacer esas pantallas significaría rehacer también sus errores, y sobre todo obligaría a que los datos de una tarjeta pasaran por esta plataforma. No pasan, y no deben: cada sistema por el que pasa un número de tarjeta es un sistema más que puede filtrarlo.

**Lo que esto implica para la cancelación.** La política de cancelación —al final del periodo o inmediata— se configura en la cuenta de la pasarela, y su efecto llega aquí por webhook. La plataforma no ofrece un segundo camino para cancelar: dos formas de hacer lo mismo acaban divergiendo, y la que se use menos es la que se queda rota sin que nadie lo note.

---

## ADR-0056 · Un evento adelantado no es un error: queda sin conciliar y se reintenta

**Contexto.** La pasarela no garantiza el orden de entrega. El cambio de estado de una suscripción puede llegar antes que la sesión de cobro que ata esa suscripción a un concepto del catálogo, y entonces no hay forma de resolverlo todavía.

**Decisión.** Un evento cuya referencia no existe se marca `UNRECONCILED`, no `FAILED`. Una tarea programada lo reintenta cada cinco minutos hasta doce veces, y **avisa una sola vez** de lo que sigue sin resolverse pasada una hora.

**Por qué esa distinción importa.** Tratarlo como fallo llenaría la bitácora de alarmas por algo que se arregla solo en el siguiente intento, y una bitácora que grita por rutina es una que nadie lee cuando grita de verdad. Y al revés: no avisar nunca dejaría que un evento sin conciliar —que es dinero que entró o salió y que el sistema no supo dónde poner— viviera callado hasta el corte semestral.

**Por qué doce intentos y no infinitos.** Una hora cubre de sobra un desorden de entrega. Lo que falta después no es tiempo sino una intervención, y seguir reintentando solo escondería el problema detrás de un registro que se repite. La ruta responde 503 mientras quede algo agotado, para que la supervisión externa lo vea sin leer el cuerpo.

---

## ADR-0057 · La idempotencia del ingreso se ancla en el documento de la pasarela

**Contexto.** El PRD §11.4 prohíbe duplicar ingresos. Marcar el evento como procesado no basta: dos entregas simultáneas pueden pasar esa comprobación a la vez, y la pasarela envía eventos distintos —con identificadores distintos— por el mismo hecho.

**Decisión.** Cada ingreso de renovación lleva `idempotencyKey = stripe:invoice:<id de la factura>`, único en toda la instalación. Y cada transición de estado es **condicional**: un cobro pasa a pagado solo si no lo estaba, y no vuelve a pagado desde un estado más avanzado como devuelto o en disputa.

**Por qué la condición, además de la clave.** El índice único impide crear dos ingresos por la misma factura. La condición impide algo distinto: que un reenvío tardío de un evento viejo borre un estado posterior. Las dos cosas hacen falta, y ninguna sustituye a la otra.

**Consecuencia probada.** Dos eventos distintos con la misma factura dejan un solo ingreso, y un `payment_intent.succeeded` que llega tarde no revierte una devolución ya asentada.

---

## ADR-0058 · El doble control se comprueba por persona, no solo por permiso

**Contexto.** Registrar un pago manual y aprobarlo son dos permisos que en la semilla tienen dos carteras distintas. Parecería suficiente: quien registra no tiene el permiso de aprobar.

**Decisión.** Además de los dos permisos, el caso de uso comprueba que **quien aprueba no sea quien registró**. Lo mismo con las devoluciones: quien pide no aprueba.

**Por qué no basta con los permisos.** Un nombramiento puede acumularse. Alguien con las dos carteras —en una organización pequeña, o durante una suplencia— tendría los dos permisos y el control desaparecería sin que nadie cambiara una sola línea. La comprobación por persona es lo único que hace que la separación siga existiendo el día que los papeles se juntan. Hay una prueba que otorga los dos roles a la misma persona y comprueba que sigue sin poder aprobarse a sí misma.

**Consecuencia en la pantalla.** A quien registró un pago se le dice por qué no puede aprobarlo, en vez de esconderle el botón. Un botón que desaparece parece un permiso que falta; la frase explica el control.

---

## ADR-0059 · Una beca gana al descuento y no se acumulan

**Contexto.** Una persona puede tener a la vez una beca y un descuento aplicable. Sumarlos es aritméticamente posible y puede dejar el importe en negativo.

**Decisión.** Si hay beca vigente para el programa del concepto, decide la beca y el descuento no interviene. Entre varios descuentos se elige **el más favorable a la persona**, no el primero que devuelva la consulta. El importe nunca baja de cero.

**Por qué.** Una beca responde a que alguien no puede pagar; un descuento, a una condición comercial. Acumularlos haría que el motivo por el que alguien pagó menos dejara de ser una sola cosa explicable, y explicar cada cobro es precisamente lo que esta fase tiene que garantizar. Que el orden de las filas decidiera cuánto paga alguien sería, además, arbitrario.

**Una exención total no manda a nadie a pagar cero.** Cuando el importe final es cero, el cobro se asienta como exento y no pasa por ninguna pasarela: no existe una página de pago de cero pesos, y sin el asiento el libro no cuadraría.

**La justificación de una beca no va a la bitácora.** Dice por qué alguien no puede pagar. La bitácora general la leen más personas que la beca, así que la justificación se queda en su propia fila, bajo un permiso sensible.

---

## ADR-0060 · Un corte con diferencias se puede cerrar; lo que no se puede es callarlas

**Contexto.** Un corte de conciliación puede terminar sin cuadrar. La regla obvia sería impedir cerrarlo hasta que cuadre.

**Decisión.** Un corte con diferencias **sí** se cierra, con dos condiciones: cada diferencia queda nombrada como una excepción con su referencia y su importe, y quien cierra escribe qué se encontró y qué se va a hacer.

**Por qué no se exige cuadrar.** Obligar a cuadrar antes de cerrar empuja a inventar un ajuste que cuadre. Un libro con un ajuste inventado es peor que un corte cerrado que dice la verdad: el primero miente y parece limpio, el segundo señala el problema y lo deja a la vista de quien tenga que resolverlo.

**Lo que sí se cierra de verdad.** Después de cerrar, un asiento de ese periodo ya no se revierte dentro de él. La corrección se asienta en el periodo abierto, que es como se corrige un libro que no se puede reescribir.

**La conciliación es idempotente por periodo.** Correrla dos veces sobre el mismo rango actualiza el corte abierto en vez de crear otro: dos cortes del mismo periodo harían imposible saber cuál vale. Las excepciones se recalculan enteras en cada corrida, porque conservarlas acumularía las de corridas anteriores y el corte hablaría de diferencias ya resueltas.

---

## ADR-0061 · Una exención no deja asiento en el libro

**Contexto.** Cuando una beca cubre el cien por ciento, se registra un cobro exento de importe cero. La tentación es asentar en el libro el importe perdonado, para que se vea.

**Decisión.** No se asienta. El libro auxiliar registra movimientos de dinero, y en una exención no se movió ninguno.

**Por qué.** Un asiento de cero no dice nada. Y uno por el importe perdonado inflaría los ingresos con dinero que nunca entró, que es exactamente el descuadre que este libro existe para evitar. Lo que la organización dejó de cobrar sí se informa, y se calcula comparando el precio vigente con lo efectivamente cobrado: es un dato de rendición de cuentas, no un movimiento de caja.

---

## ADR-0062 · Rendir cuentas es un derecho; exportar el libro es una facultad

**Contexto.** Las dos cosas informan sobre el mismo dinero. La tentación es tratarlas igual.

**Decisión.** El reporte de rendición de cuentas lo alcanza **cualquier persona afiliada** (`billing.accountability.read`, sensibilidad normal): totales por cuenta y por semestre, sin un solo dato de una persona identificable. La exportación del libro con el detalle de cada asiento exige `billing.report.export`, es crítica y pide motivo escrito.

**Por qué la asimetría.** Saber en qué se gasta el dinero de las cuotas es un derecho de quien las paga, y ponerle un permiso de administración delante lo convertiría en una concesión. El detalle es otra cosa: identifica movimientos concretos y sale del sistema en un archivo que ya nadie controla, así que tiene que constar quién se lo llevó y para qué.

**El asiento de auditoría se escribe antes de entregar el archivo.** Al revés, un fallo entre las dos cosas dejaría datos financieros fuera del sistema sin ninguna constancia de que salieron.

**No hay dirección de descarga reutilizable.** El archivo viaja en la respuesta de la acción. Una dirección con identificador se copia, se comparte y acaba entregando el libro a quien nadie autorizó, sin rastro de esa segunda entrega.

---

## ADR-0063 · Lo que se dejó de cobrar se informa, aunque no esté en el libro

**Contexto.** Las becas y las exenciones no dejan asiento (ADR-0061): no hubo movimiento de dinero. Un reporte que solo sume el libro no las menciona nunca.

**Decisión.** El reporte de rendición de cuentas informa aparte cuánto se dejó de cobrar, calculado comparando el precio vigente del concepto con lo que la persona pagó.

**Por qué.** El esfuerzo social de la organización —a cuánta gente atendió sin cobrarle— es parte de lo que hay que rendir, y es justo lo que un libro de movimientos de caja no puede mostrar. Callarlo daría una imagen de la organización más pobre y menos verdadera que la real. Y ponerlo dentro del libro sería peor: inflaría los ingresos con dinero que nunca entró.

**Presentado como lo que es.** No es un gasto ni un ingreso: es dinero que la organización decidió no cobrar, y la pantalla lo dice con esas palabras.

---

## ADR-0064 · La categoría se copia en la solicitud y en la membresía

**Contexto.** El PRD §8.1 exige campos distintos según se solicite la afiliación sindical o la honoraria, y el defecto `D-F0-004` fijó qué es obligatorio y qué debe ser nulo en cada caso. La categoría vive en `MembershipType`, no en la solicitud, y una comprobación de PostgreSQL no puede consultar otra tabla.

**Decisión.** `MembershipApplication` y `Membership` llevan su propia columna `category`, atada al catálogo por una clave foránea **compuesta** contra `MembershipType (id, category)`.

**Por qué la copia no miente.** Una copia suelta se desincroniza; ésta no puede: la clave foránea compuesta exige que el par `(membershipTypeId, category)` exista en el catálogo, de modo que la copia y el original son el mismo dato visto dos veces. Cambiar la categoría de un tipo con solicitudes vivas queda impedido por la propia clave.

**Qué habilita.** Dos cosas que sin la copia solo existirían en el código de la aplicación: la comprobación de campos condicionales, y el índice único parcial de una sola membresía activa por persona y categoría.

**Alternativa descartada.** Comprobarlo con un disparador que consulte `membership_type` en cada escritura. Funciona y cuesta una consulta por fila; peor aún, esconde una regla estructural dentro de código imperativo, donde nadie la lee al mirar la tabla.

---

## ADR-0065 · Un disparador para lo que los privilegios por columna no saben decir

**Contexto.** El PRD §8.1.9 exige que la revisión no altere la solicitud original. La instalación resuelve la inmutabilidad con privilegios por columna: se retira `UPDATE` sobre la tabla y se devuelve columna por columna. Aquí no sirve: la solicitud nace en borrador y su resumen se escribe **al enviarla**, así que quitar el privilegio impediría también el único momento en que debe escribirse.

**Decisión.** Un disparador `BEFORE UPDATE` sobre `membership_application` rechaza cualquier cambio de `originalSummary` cuando ya tiene valor. Es el primer disparador del repositorio.

**Por qué en el motor y no en el caso de uso.** La promesa es fuerte —quien revisa no puede tocar lo que la persona envió— y una promesa así no se apoya en que nadie escriba mañana un `update` distraído desde otro sitio.

**Detalle que costó una prueba.** La primera versión lanzaba la excepción con `ERRCODE = 'restrict_violation'` y el controlador la traducía a «clave foránea violada», que dice lo contrario de lo que ocurrió y manda a quien la lea a buscar una relación que está bien. Se dejó el código por omisión, `raise_exception`, que sí deja pasar el mensaje escrito.

**Regla general que queda.** Los privilegios por columna saben decir «nunca». Cuando lo que hace falta es «una sola vez», la herramienta es un disparador, y solo entonces.

---

## ADR-0066 · Una membresía nace activa, y por eso siempre tiene número

**Contexto.** `docs/DATA_MODEL.md` §5 declaraba `memberNumber` anulable, con la nota de que solo se asigna al activar. Con las dos tablas separadas —`MembershipApplication` para el trámite y `Membership` para la relación viva—, no existe ningún momento en que haya membresía sin activación: antes de activarse lo que hay es una solicitud.

**Decisión.** `memberNumber` es obligatorio y único. La columna anulable desaparece.

**Por qué importa.** Un número de miembro repartido a quien todavía no lo es acaba impreso en una credencial que alguien enseña. Y una columna anulable que en la práctica nunca es nula enseña a leer el esquema con desconfianza: obliga a comprobar en el código lo que la tabla ya podría estar afirmando.

**Consecuencia.** `docs/DATA_MODEL.md` §5 se corrige para decir lo mismo que la tabla.

---

## ADR-0067 · Los permisos de la Fase 4 no llevan compartimento

**Contexto.** El esquema tiene compartimentos (`UNION`, `SOCIAL`, `CLINICAL`, `DISCIPLINARY`) y el motor de permisos los comprueba. Era tentador marcar los padrones como `UNION` y el registro de personas beneficiarias como `SOCIAL`.

**Decisión.** Ningún permiso de esta fase declara compartimento.

**Por qué.** Contradiría la matriz contratada en `docs/PERMISSIONS.md` §4. El PRD §8.3 dice que un agremiado —cuyo rol solo alcanza el compartimento `UNION`— puede dar de alta a una persona beneficiaria, que es atención social; y da lectura de personas beneficiarias a la delegación territorial, que tampoco tiene `SOCIAL`. Un permiso que la matriz concede y el compartimento niega es un permiso que nadie puede ejercer, y de los peores: parece concedido.

**Dónde sí corresponde.** El compartimento separa **expedientes** entre el sindicato y la asociación civil (PRD §10.3), y los expedientes llegan con los casos, en la Fase 6. Allí es donde la separación tiene contenido.

**Qué protege entonces el padrón sindical.** No un compartimento sino el dato: la consulta filtra por `MembershipType.appearsInAuthorityRoster` y por el estado de la membresía, y la restricción del motor impide que una calidad honoraria ponga esa bandera en verdadero.

---

## ADR-0068 · Permisos `_own` como permisos distintos

**Contexto.** La matriz del §4 usa `O` —solo sobre lo propio— en casi todas las filas de afiliación: consultar la solicitud propia, la membresía propia, la credencial propia, decidir la aparición propia en el directorio.

**Decisión.** Cada `O` de la matriz es un permiso declarado aparte, con el sufijo `_own` y `needsAssignment` verdadero, en vez de una comprobación dentro del caso de uso sobre el permiso general.

**Por qué.** Sin ellos, la única forma de que alguien viera su propio expediente sería darle el permiso de ver los de todas. Ya ocurrió en la Fase 3 con `billing.payment.read_own` (ADR-0035) y la razón no ha cambiado. Además, consultar lo propio y consultar lo ajeno no dejan el mismo rastro en la bitácora, y con un solo permiso serían indistinguibles.

**Coste aceptado.** El catálogo crece: la Fase 4 declara veintiséis permisos, de los cuales nueve son `_own`. Es un catálogo más largo y una matriz más honesta.

---

## ADR-0069 · La medición del verificador se guarda por hora, y lo exige la tabla

**Contexto.** El PRD §7.4 pide registrar de forma agregada las consultas al verificador «sin crear perfiles invasivos de quien escanea». `CredentialVerification` guarda la hora truncada, sin dirección ni identificador.

**Decisión.** Una comprobación de la tabla exige `occurredAtHour = date_trunc('hour', occurredAtHour)`.

**Por qué no basta con truncar en el código.** Porque el día que alguien guarde el instante exacto «solo por ahora, para depurar», el registro agregado se convierte en un rastro de quién miró qué credencial y cuándo, y nadie lo notará hasta que ese rastro se pida en un juicio. La comprobación convierte el descuido en un error inmediato.

---

## ADR-0070 · La clave de comparación de nombres la escribe el motor

**Contexto.** «Guadalupe Muñoz» y «Guadalupe Munoz» son la misma persona escrita por dos personas distintas, y el padrón no puede tener dos filas por una diferencia de teclado. La detección de duplicidad necesita comparar sin acentos y sin mayúsculas.

**Decisión.** `Person.matchKey` guarda el nombre normalizado, y lo escribe un **disparador** `BEFORE INSERT OR UPDATE`, no la aplicación.

**Por qué no la aplicación.** Porque valdría solo para las filas que pasan por el caso de uso que se acordó de escribirla. La semilla, las pruebas, una importación futura y cualquier código que nadie revise dejarían la clave vacía justo en las filas que producen duplicados.

**Por qué no una columna generada.** `GENERATED ALWAYS AS (...) STORED` habría sido más directo y se probó. El comparador de esquemas de Prisma la lee como una columna con valor por omisión y propone quitárselo en cada ejecución. Un aviso de deriva que hay que ignorar cada vez es un aviso que se acaba ignorando siempre, incluido el día en que la deriva sea de verdad —que es exactamente lo que ya pasa con el índice de prefijo territorial, y no conviene tener dos—.

**Coste.** Hay dos implementaciones de la misma normalización, una en PL/pgSQL y otra en TypeScript, porque la búsqueda tiene que construir el prefijo que va a comparar. Una prueba de integración las enfrenta contra la misma lista de nombres: si se separan, falla ahí y no en producción.

---

## ADR-0071 · Fusionar traslada lo operativo y retira lo publicado

**Contexto.** Al resolver una duplicidad hay que decidir qué pasa con lo que cuelga del registro que se va.

**Decisión.** Las membresías, solicitudes, expedientes, archivos, consentimientos y cuentas de cobro **se trasladan** al registro que se conserva. Las publicaciones de directorio **se retiran** y las credenciales **se revocan**.

**Por qué la diferencia.** Lo operativo es del ser humano, y la premisa de la fusión es que se trata del mismo: su expediente tiene que quedar completo en un solo sitio. Lo publicado y lo acreditado, en cambio, dice algo **sobre un registro concreto**: una credencial lleva impreso un nombre y un código firmado, y reapuntarla a otro registro cambiaría lo que el QR afirma sin cambiar el QR. La preferencia de directorio, además, no se edita ni se traspasa: se otorga, y el motor lo impide por diseño. Quien queda vuelve a decidir su aparición pública, que es de quien es esa decisión.

**Lo que la fusión se niega a hacer.** Fusionar dos registros que tienen una membresía viva de la misma categoría. Eso no es un error de captura: es una situación que alguien tiene que resolver dando de baja una, con su motivo. El caso de uso lo dice con esas palabras en vez de elegir por su cuenta cuál sobrevive.

---

## ADR-0072 · Quien invita, cierra

**Contexto.** `identity.user.disable` estaba declarado desde la Fase 1 y no lo tenía ningún rol, no lo ejercía ningún caso de uso y no había pantalla desde la que usarlo (defecto `D-F4-003`). Lo destapó la fusión de duplicados, que necesita cerrar la cuenta del registro que se va.

**Decisión.** Lo recibe `EXECUTIVE_SECRETARY`, la misma cartera que invita, y se ejerce desde la misma pantalla.

**Por qué no el actor raíz.** Por la razón de ADR-0048: no tiene cuenta y no alcanza el área de gestión, de modo que tendría un permiso sin sitio desde el que ejercerlo. Y por la de fondo: separar invitar de cerrar dejaría a quien invita sin poder deshacer su propio error.

**Qué significa cerrar.** No borrar. La fila permanece con su historial y su auditoría; lo que se acaba es el acceso —estado `DISABLED`, sesiones revocadas y `sessionVersion` incrementado, que invalida cualquier testigo emitido— y los nombramientos vivos, porque un cargo que nadie puede ejercer no es un cargo. Reabrir **no** los devuelve: volver a nombrar es un acto institucional aparte, con su motivo y su fecha.

---

## ADR-0073 · Un formulario devuelve lo que la persona escribió

**Contexto.** React vacía los campos de un formulario no controlado cuando termina la acción que lo envía. En la pantalla de alta del registro maestro eso significaba que el aviso de posible duplicidad —que es un aviso **para leerlo y volver a enviar**— llegaba con el formulario en blanco: quince campos tecleados, perdidos, justo en el momento en que se pedía revisarlos (defecto `D-F4-005`).

**Decisión.** Las acciones de formulario devuelven en su estado los valores recibidos, y el formulario los repinta. Hace falta además una clave de remontaje: un `defaultValue` solo se aplica al montar, así que cambiarlo sin remontar no repinta nada.

**Por qué importa más de lo que parece.** El PRD §5.3 contrata recuperación de borrador por accesibilidad cognitiva. Un aviso que castiga leerlo es un aviso que la gente aprende a esquivar, y el que se esquiva aquí es precisamente el que impide duplicar a una persona.

**Regla que queda.** Cualquier formulario que pueda volver con un error debe devolver lo escrito. No es una mejora opcional del formulario: es parte de que el error sea corregible.

---

## ADR-0074 · El resultado no se pinta dentro de lo que el resultado hace desaparecer

**Contexto.** El aviso de «registros fusionados» vivía dentro de la lista de candidatas a fusión. Una fusión correcta deja esa lista vacía, así que el mensaje desaparecía en el mismo instante en que había algo que decir: la pantalla cambiaba sola y quien acababa de fusionar dos registros no sabía si lo había hecho (defecto `D-F4-006`).

**Decisión.** El aviso de resultado se pinta **fuera** de la rama condicional que la propia acción modifica.

**Cómo se encontró.** Conduciendo la pantalla en un navegador de verdad. Las pruebas de integración pasaban —la fusión funcionaba— y las de tipos también: el fallo solo existía para quien miraba la pantalla.

---

## ADR-0075 · La categoría de una calidad y sus derechos no se editan

**Contexto.** El catálogo de calidades permite corregir nombre, resumen de beneficios, vigencia, concepto de cobro y si exige revisión o pago. La categoría y los tres derechos —voto, quórum, padrón ante la autoridad— quedaron fuera del formulario de edición.

**Decisión.** Se fijan al crear y no se ofrecen después. Una calidad distinta es una calidad nueva.

**Por qué.** Cambiar la categoría de un tipo con membresías vivas daría o quitaría el voto a todas ellas a la vez y hacia atrás, sin acto institucional que lo respalde y sin que nadie tuviera que enterarse. El PRD §24 Fase 4 pide que un afiliado honorario no obtenga voto **por error**, y un formulario de edición que ofrezca esa casilla es exactamente la clase de error que pide impedir.

**Lo que sí queda abierto.** Archivar la calidad —`isActive` en falso— para que no admita solicitudes nuevas, sin tocar a quien ya la tiene. Es la vía honesta para dejar de usar una calidad: se cierra la puerta de entrada, no se cambia lo que ya se concedió.

---

## ADR-0076 · El almacén de archivos, por puerto con adaptadores

**Contexto.** El correo tiene puerto con adaptadores (ADR-0016) y la pasarela también (ADR-0014). El almacén de archivos, no: `uploadFile` llamaba a Vercel Blob directamente.

**El defecto que destapó.** Sin un token real, subir un archivo **se queda colgado** —en una máquina de desarrollo y en la integración continua por igual—. No se veía porque hasta la Fase 4 ninguna pantalla subía archivos, y porque las pruebas de la Fase 1 insertaban las filas a mano para esquivarlo: una prueba que no puede fallar acompañando a un código que nadie había ejecutado (defecto `D-F4-008`).

**Decisión.** `BlobStorePort` con dos adaptadores: Vercel Blob y uno de memoria. La verificación de salud lee la capacidad que declara el adaptador vigente, igual que hace con el correo.

**Cómo se elige, y por qué no con una variable nueva.** Por la forma del token. Un `BLOB_READ_WRITE_TOKEN` vacío o de relleno significa exactamente «aquí no hay almacén». Una variable aparte permitiría la combinación incoherente de siempre —token real con adaptador de memoria, o al revés— y habría que documentar cuál manda.

**Lo que el adaptador de memoria promete y lo que no.** Guarda y devuelve dentro del proceso, y lo pierde todo al reiniciar. Lo declara como `IN_MEMORY` y el panel de salud lo dice con esas palabras: un almacén que pierde lo guardado no es un fallo mientras se anuncie; lo que sería un fallo es que pareciera persistente.

---

## ADR-0077 · Consentir sobre lo propio es un permiso distinto de registrar el sí de otra persona

**Contexto.** El catálogo tenía `consent.grant` y `consent.revoke` desde la Fase 1. Al construir el bloque de consentimientos de la Fase 4 quedó a la vista lo que nadie había ejercido nunca: `consent.grant` solo lo tenía el personal de atención social, y `consent.revoke` **no lo tenía absolutamente nadie** —ni un rol, ni el actor raíz, ni un trabajo programado— (defecto `D-F4-009`).

Traducido a lo que le pasa a una persona: no podía aceptar la publicación de sus propios datos en el directorio, y una vez aceptada no había forma de retirarla. Un consentimiento que solo puede otorgar y retirar la organización no es un consentimiento; es el registro de lo que la organización decidió por ti, y el PRD §7.3 pide justo lo contrario.

**Decisión.** Se separan dos facultades donde antes había una:

- `consent.grant` · `consent.revoke` — **registrar el sí de cualquier persona.** La tienen la Secretaría Ejecutiva, que lleva el padrón y recoge consentimientos en papel, y el personal de atención social.
- `consent.grant_own` · `consent.revoke_own` — **decidir sobre lo propio**, y sobre quien se representa con una relación de cuidado viva. La tienen todos los roles que representan a una persona hablando por sí misma.

**Por qué separadas y no una sola repartida a todo el mundo.** Quien atiende un mostrador necesita anotar el sí de otra persona; esa es una potestad mucho mayor que la de decidir sobre lo propio, y una sola facultad repartida a todos los roles la habría concedido a cualquiera con cuenta.

**Consecuencia en el caso de uso.** `grantConsent` resuelve las dos y decide con cuál se sostiene el acto. De ahí salen tres caminos honestos donde antes había uno:

1. La propia persona consiente. `grantedById` es ella.
2. Alguien consiente **en representación**, invocando una relación de cuidado viva que encabeza. `grantedById` es la persona representante.
3. La organización **registra** el sí que dio la persona —en papel, por teléfono con testigo, en el mostrador—. `grantedById` sigue siendo la persona: la bitácora ya dice quién lo tecleó, y la columna dice de quién es el sí, que es la pregunta que se hace cuando alguien reclama.

Antes el tercer camino no existía: quien no fuera la titular tenía que invocar una relación de cuidado, lo que dejaba inservible el medio «papel firmado» para cualquier persona adulta capaz.

**El error que se conserva.** Quien tiene la facultad propia y no dice en qué relación se apoya no recibe una denegación, sino el dato que le falta. Una denegación ahí sería mentira: puede consentir, solo que no ha dicho por qué.

**El control que impide la recaída.** `C-F1-11` recorre los permisos que el código **exige de verdad** —los que aparecen en una llamada a `can`— y comprueba que cada uno tenga al menos un titular posible: un rol de la semilla, la lista cerrada del actor raíz o la concesión de un trabajo programado. No mira el catálogo entero a propósito: hay permisos declarados para fases que aún no se construyen, y exigirles titular hoy obligaría a repartir facultades antes de que exista la función que ejercen.

Es el control que habría cazado también `D-F4-003` —`identity.user.disable` sin ningún rol que lo tuviera—, y se comprobó quitando ambos permisos de la semilla para verlo fallar por los dos. Una puerta cerrada con una llave que no existe no la detecta nada más: los tipos pasan, la pantalla se pinta, y las pruebas positivas ni siquiera llegan ahí.

---

## ADR-0078 · Las constantes compartidas entre pantalla y servidor viven fuera del módulo de cliente

**Contexto.** La lista de los once propósitos de consentimiento estaba declarada dentro del formulario, un archivo marcado `'use client'`. La página —componente de servidor— la importaba de ahí para traducir códigos a etiquetas.

**Lo que pasa en ejecución.** Un módulo de cliente no exporta valores al servidor. Lo que llega ahí es una referencia al cliente, no el arreglo, así que `PROPOSITOS.map` lanza `map is not a function` y la página devuelve un 500 (defecto `D-F4-010`).

**Por qué no lo vio nada.** Del lado de los tipos el arreglo sigue siendo un arreglo: `tsc` pasa. El linter no modela la frontera. Las pruebas de integración prueban casos de uso, no pantallas. Solo aparece abriendo la página en un navegador, que es exactamente como apareció.

**Decisión.** Toda constante que necesiten las dos orillas vive en un módulo **sin directiva** —`etiquetas.ts` junto a la pantalla— y se importa desde ambas. El módulo de cliente exporta componentes; los datos, no.

**De regalo, una duplicación menos.** Los mismos once códigos estaban otra vez en la acción del servidor. Añadir un propósito obligaba a tocar dos sitios, y olvidar el segundo dejaba una casilla que se marca y no se guarda.

**El control que impide la recaída.** `C-F2-07` recorre los módulos `'use client'`, recoge lo que exportan que **no** sea componente ni hook, y comprueba que ningún módulo de servidor lo importe. La primera versión del control daba verde con el defecto delante: descartaba todo identificador que empezara por mayúscula, y `PROPOSITOS` empieza por mayúscula. Un componente es `NombreAsi`; una constante, `NOMBRE_ASI`. La distinción es la mayúscula seguida de minúscula, y el control se verificó viéndolo fallar con el código que causó el defecto.

---

## ADR-0079 · Ocultar en la lista y mostrar en el expediente son reglas distintas

**Contexto.** El padrón de atenciones protegidas oculta la necesidad inicial cuando la privacidad es reforzada: lo que alguien contó de su vida no es una columna de una tabla que se recorre buscando otra cosa. La pantalla de expediente leía su fila de ese mismo padrón.

**La consecuencia.** El expediente no podía enseñar la necesidad **nunca**, y en su lugar mostraba un aviso proponiendo bajar la privacidad a estándar para poder leerla. Es decir: la pantalla que existe para leer el caso invitaba a desproteger a la persona para leer lo que quien abre el expediente ya tenía derecho a ver (defecto `D-F4-011`). De paso, buscaba la fila entre las doscientas que devuelve el padrón, así que habría dejado de encontrar expedientes en cuanto hubiera más.

**Decisión.** `beneficiaryDetail` lee esa atención y solo esa, con la necesidad incluida. La regla de la lista sigue igual.

**Lo que se añade al leer.** Abrir un expediente con privacidad reforzada deja asiento en la bitácora. El PRD §3.4 promete «controles reforzados de privacidad» sin decir cuáles; registrar la lectura y no solo la escritura es la traducción concreta de esa frase: quien contó algo de su vida puede saber quién lo ha leído. Con privacidad estándar no se anota, porque entonces el asiento no distinguiría nada.

---

## ADR-0080 · Un plazo vencido no rechaza a nadie

**Contexto.** El PRD §8.1 paso 10 permite requerir una aclaración «con plazo y mensajería trazable». Un plazo admite dos lecturas: la fecha a partir de la cual la revisión puede seguir sin esperar, o la fecha a partir de la cual la solicitud se cae sola.

**Decisión.** La primera. Al vencer un plazo **no ocurre nada automático**: la solicitud sigue viva, en el mismo estado, y la persona puede contestar después. Lo único que cambia es que se hace visible —en la bandeja de quien revisa, con la etiqueta «plazo vencido», y en un recordatorio a la persona—. Para seguir adelante sin la aclaración hace falta que alguien la cierre a mano, escribiendo por qué.

**Por qué.** Tres razones, en orden de peso:

1. **Rechazar es un acto, no una consecuencia del calendario.** El PRD §3.2 exige revisión humana y resolución registrable. Un trabajo nocturno que rechazara solicitudes estaría resolviendo sin que nadie resuelva, y firmando con el reloj.
2. **Esta organización es de personas neurodivergentes.** No contestar a tiempo un correo administrativo no es desinterés: es, con frecuencia, exactamente la dificultad por la que alguien se acerca al sindicato. Convertirla en pérdida de derechos sería construir la barrera que la plataforma existe para quitar.
3. **La demora casi nunca es del lado que se castiga.** Quien no reunió un papel en diez días suele seguir queriendo afiliarse. Descartar su expediente obliga a empezar de cero un trámite que ya estaba casi hecho, y el coste institucional de mirarlo una semana más tarde es cero.

**Lo que sí hace el vencimiento.** Un recordatorio, **una sola vez** —`remindedAt` lo marca—, con un tono que no amenaza: dice que el plazo pasó, que todavía se puede contestar y que la solicitud sigue en pie. Un aviso que llega cada noche deja de leerse al tercero, y uno que suena a ultimátum hace que quien ya estaba angustiado deje de abrir los correos.

**Contestar fuera de plazo se recibe igual**, y consta que fue tarde. Guardar el dato sirve para medir si los plazos que damos son razonables; usarlo para descartar a alguien, no.

---

## ADR-0081 · La aclaración vive fuera de la bitácora de revisión

**Contexto.** `ApplicationReview` guarda cada actuación de quien revisa, es inmutable por privilegios de columna y tiene un campo `dueAt` que parecía destinado a alojar el requerimiento de aclaración.

**El problema.** Una actuación de revisión es un asiento de **una sola cara**: lo que hizo quien revisa, congelado para siempre. Una aclaración es un intercambio de **dos**: una pregunta con plazo, y una respuesta que llega después y la escribe la persona solicitante. Guardar la respuesta en el asiento habría obligado a mutar una fila que el motor no deja mutar; no guardarla habría dejado la resolución fundada en un texto que no existe en ninguna parte.

**Decisión.** `ApplicationClarification`, con su propia tabla, sus propias garantías y su propio ciclo. La bitácora de revisión conserva el asiento `INFORMATION_REQUESTED` —que quien revisa pidió algo, y cuándo— y la aclaración conserva el intercambio.

**Cuatro garantías en la base, no en la disciplina:**

- `dueAt > requestedAt`: pedir una aclaración «para ayer» convierte el requerimiento en un trámite para poder rechazar.
- Los tres campos de la respuesta van juntos: una respuesta sin fecha no se sitúa en el plazo, y una fecha sin respuesta dice que alguien contestó sin decir qué.
- Cerrar sin respuesta exige motivo de quince caracteres, y contestada y cerrada son excluyentes: marcar como «cerrada sin respuesta» una que sí se contestó borraría de la historia que la persona contestó.
- Una sola aclaración abierta por solicitud, con índice parcial. Dos plazos corriendo a la vez dejan sin respuesta la pregunta de cuál venció, y esa pregunta se hace cuando alguien reclama.

**El estado no se guarda: se deduce** de las fechas. Pendiente, vencida, contestada o cerrada salen de `dueAt`, `answeredAt` y `closedAt`. Una columna de estado junto a las fechas que la determinan es una columna que puede mentir, y miente el día que un proceso escribe una y olvida la otra.

**Cómo se comprobó que las garantías funcionan.** La prueba que necesita un plazo ya vencido tuvo que pelear con las tres capas: los privilegios por columna le negaron el `UPDATE`, el disparador se lo negó también desde la conexión de propietaria, y la restricción `dueAt > requestedAt` la obligó a mover además la fecha de la petición. Ninguna ruta del producto puede hacer eso.

**El contrato de fases se amplía, y se dice.** `ApplicationClarification` no figura en la enumeración de entidades del PRD §18.2: es una entidad que añade la implementación, dentro de lo que el PRD §0.1 deja al agente. Por eso se registra en `scripts/phase/prd-contract.json` —cuyo encabezado exige justamente una decisión escrita para tocarlo— en el apartado §18.2 y en las entidades que migra la Fase 4. Sin esa línea, el control de coherencia `C-COH-03` la vería como una tabla sin fase declarada y fallaría; y hacerla pasar sin registrarla habría sido esconder que el modelo creció.

---

## ADR-0082 · El cobro confirmado se anuncia; quien dependa de él, escucha

**Contexto.** Un cobro llega a `SUCCEEDED` desde cinco sitios: `checkout.session.completed`, `payment_intent.succeeded`, la factura de una renovación, la aprobación de un pago manual y la exención total. La activación de una membresía depende de que uno de ellos ocurra (PRD §8.1 paso 13).

**La solución que no se tomó.** Llamar a la activación desde los cinco. Funciona el primer día y falla el día que aparezca un sexto camino —una conciliación que repara un cobro perdido, por ejemplo—: alguien quedaría pagado y sin membresía, sin que nada fallara ni nadie se enterara. Ese es exactamente el modo de fallo de `D-F4-007` y `D-F4-008`, y aquí se puede evitar antes en vez de descubrirlo después.

**Decisión.** Cada sitio publica el hecho —`billing.payment.succeeded`— en la bandeja de salida, **dentro de la misma transacción** que lo produce. Quien tenga algo que hacer con él se suscribe. Es el mecanismo de la Fase 1 (ADR-0025), que hasta esta fase existía completo, con su despachador y su medición de salud, sin que nadie lo usara.

**La trampa que trae el mecanismo, y cómo se cierra.** El registro de manejadores vive en memoria del proceso, y aquí cada invocación arranca en frío. Si el registro ocurriera como efecto de importar un módulo, el despachador repartiría los mensajes **sin manejadores** en cualquier invocación donde ese módulo no se hubiera importado por otra razón —y los marcaría como entregados, con la nota «sin manejadores registrados»—. El hecho se perdería en silencio mientras la bandeja diría que todo fue bien.

Tres cosas lo impiden: las suscripciones viven en un solo archivo que se puede leer entero; el despachador lo llama antes de repartir; y un evento sin manejadores se registra ahora como **error** en la bitácora técnica, porque casi siempre significa un registro que no se hizo, no un evento que a nadie le importa.

**Dos controles de fase.** `C-F1-12` comprueba que quien reparte la bandeja registre primero a quien escucha. `C-F3-07` comprueba que todo sitio que deja un cobro en `SUCCEEDED` publique el hecho. La primera versión de `C-F3-07` señalaba `refunds.ts`, que pone en `SUCCEEDED` una **devolución** —no un cobro— y por separado toca la tabla de cobros: se acotó a buscar el estado dentro de la escritura, porque un control que acusa a un archivo correcto enseña a ignorar los controles. Los dos se verificaron viéndolos fallar con el código que causaría el defecto.

---

## ADR-0083 · Terminar una membresía dice siempre por qué, y vencer no es decidir

**Contexto.** El modelo de la Fase 4 exige que toda membresía que ya no está en curso diga cuándo terminó y por qué: `("endedAt" IS NULL) = ("endReason" IS NULL)`, y `EXPIRED` cae de ese lado. Al construir el vencimiento, esa garantía chocó de frente con la intención de dejar un vencimiento sin fecha ni motivo.

**Decisión.** Gana la garantía, y el vocabulario crece para poder decir la verdad: se añaden dos motivos.

- `EXPIRY` — se acabó la vigencia y nadie la renovó. Sin él, un vencimiento tendría que anotarse como `INACTIVITY` o `ADMIN_CORRECTION`, y las dos afirman que alguien decidió algo. Aquí no decidió nadie: pasó el tiempo.
- `CONVERSION` — la persona pasó a otra calidad (PRD §8.4). Sin él habría que llamarlo «corrección administrativa», que dice que alguien se equivocó, o «pérdida de calidad», que suena a castigo. Ninguna de las dos es verdad: la persona ganó una calidad.

**Por qué no se aflojó la restricción.** Habría sido más rápido eximir a `EXPIRED` de tener motivo. Pero la restricción dice algo cierto —una membresía que no está en curso terminó, y un final sin explicación no se puede consultar años después— y aflojarla para que encajara una frase escrita más tarde es cambiar el modelo para no cambiar la prosa.

**La fecha de fin de un vencimiento es la del vencimiento**, no la del día en que el trabajo nocturno se enteró. La membresía dejó de estar en vigor cuando se acabó su vigencia; anotar la fecha de la ejecución convertiría un retraso del cron en un dato del expediente.

**Suspender sigue sin fecha de fin**, y por eso está en la lista de estados en curso: es una pausa, no una salida. La distinción no es cosmética: quien consulte el padrón dentro de dos años tiene que poder separar a quien se fue de quien estuvo suspendido tres meses y volvió.

**Los siete motivos no comparten estado final.** Una baja voluntaria termina en `VOLUNTARY_WITHDRAWAL` y una expulsión en `STATUS_LOSS`. Decir que son lo mismo sería mentir en el único registro que va a quedar.

---

## ADR-0084 · Un padrón por consulta, y la calidad exacta en cada fila

**Contexto.** El PRD §7.1 enumera siete padrones y añade una frase que gobierna todo el módulo: «ningún padrón se construirá mediante una vista que mezcle categorías sin mostrar su calidad exacta».

**La solución que no se tomó.** Una función `roster(categoria)` y tres pantallas que la llaman con distinto argumento. Es menos código y funciona el primer día. Falla el día que alguien quiera «ver todo» y la invoque sin filtro —o con el filtro mal—, y ese día el padrón sindical contiene afiliados honorarios. No hace falta mala fe: basta un parámetro opcional.

**Decisión.** Una función por padrón, cada una con su categoría escrita en la consulta. `unionRoster` no admite otra cosa; `honoraryRoster` tampoco. No existe la manera de llamarlas y obtener lo que el PRD manda separar. Lo que sí se comparte es la **presentación**: una tabla, tres consultas.

**La columna de calidad exacta va siempre**, aunque en un padrón de una sola categoría parezca redundante, y también en el CSV exportado. Una tabla se copia, se recorta y se pega en otro documento; un archivo se renombra. La columna viaja con los datos; el título de la pantalla, no.

**El padrón que se remite a la autoridad es el más estrecho de los tres**: solo membresías activas de una calidad que declara `appearsInAuthorityRoster`. El criterio del PRD §24 —«solo agremiados elegibles aparecen en el padrón sindical correspondiente»— se cumple en la consulta y no en la pantalla, porque una pantalla se puede abrir con otros filtros y una función no. Una suspendida sí está en el padrón de agremiados y no en el que se remite: son dos preguntas distintas, y por eso son dos consultas.

**Exportar exige motivo escrito y deja asiento antes de entregar el archivo.** Un padrón exportado es una lista de personas que sale del sistema y deja de estar protegida por él; el asiento se escribe primero porque un fallo entre las dos cosas dejaría los datos fuera sin constancia de que salieron.

---

## ADR-0085 · La obligación ante la autoridad nace con el hecho, no en un repaso

**Contexto.** El PRD §8.1 paso 14 pide que cada alta «quede preparada para el informe o trámite ante la autoridad laboral», y el §9.7 que las altas y bajas tengan «expediente de cumplimiento y estado de notificación».

**Decisión.** Cada alta y cada baja de una calidad que aparece ante autoridades abre su expediente **dentro de la misma transacción que la produce**. No hay un trabajo nocturno que recorra las membresías buscando movimientos sin informar.

**Por qué.** Un repaso periódico deja un intervalo en el que la obligación ya existe y no consta en ninguna parte —entre el hecho y la siguiente pasada—, y ese intervalo es exactamente donde se pierden los trámites: si el repaso falla, o si alguien cambia el criterio de búsqueda, el movimiento no aparece nunca y nadie lo echa de menos. Naciendo con el hecho, la única forma de que falte el expediente es que no haya ocurrido el alta.

**Las bajas también, incluidas las que ocurren solas.** Un vencimiento saca a la persona del padrón que se remite igual que una baja voluntaria. Una organización que informa las altas y no las bajas acaba remitiendo un padrón que crece y nunca mengua, y eso se descubre en la peor conversación posible.

**Una afiliación honoraria no abre expediente**, porque no genera obligación (PRD §3.3). Abrírselo sería prepararse para informar algo que no hay que informar, y llenaría la bandeja de trámites falsos hasta que alguien dejara de mirarla.

**Lo que la plataforma no hace es declarar cumplida la obligación** (PRD §9.6). Registra que se preparó, que se presentó y que la autoridad acusó, con su número de trámite. El trámite no retrocede: deshacer un acuse borraría la prueba de que se presentó. Y descartar la obligación —`NOT_REQUIRED`— exige explicarlo por escrito: una obligación que se cierra sin motivo es la forma silenciosa de no cumplirla.
