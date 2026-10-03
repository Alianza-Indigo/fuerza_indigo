Warning: truncated output (original token count: 70223)
Total output lines: 2268

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

**Decisión.** Módulo de autenticación **propio**: sesión opaca cuyo hash se guarda en `Session`, cookie endurecida, y hash de contraseña **Argon2id** mediante `@node-rs/argon2` (binarios precompilados compatibles con el runtime de Node.js en Vercel). Parámetros iniciales documentados y almacenados junto al hash: memoria 19 MiB, iteraciones 2, paralelismo 1, con revisión al inicio de la Fase 10.

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

**Decisión.** Todo objeto se escribe con acceso privado y ruta lógica opaca. Las descargas pasan por una ruta de la aplicación que **reevalúa la política** y emite una URL temporal cuya vigencia depende de la clasificación del archivo (tabla en `INTEGRATIONS.md` §4). El material sensible exige motivo y no admite vista previa en el navegador.

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

**Contexto.** Un pago confirmado debe activar una membresía o un registro en un evento. El PRD §11.4 exige que el webhook actualice pagos y derechos de acceso mediante transacciones. Pero el mapa de módulos sitúa `billing` **por debajo** de esos módulos y prohíbe dependencias circulares: si `billing` los invocara, rompería el grafo. La primera redacción de la arquitectura mencionaba "un evento de dominio o un módulo de coordinación superior" sin decidir cuál ni definirlo (defecto `D-F0-006`).

**Decisión.** Bandeja de salida transaccional en `platform/events`, del que dependen tanto el publicador como los consumidores:

1. El webhook escribe, **en una sola transacción**, el `Payment`, el `LedgerEntry`, el `AuditEvent` y un `OutboxMessage` con el evento de dominio.
2. Tras confirmar, el mismo proceso intenta la entrega **en memoria**; en operación normal el derecho se otorga en el mismo instante.
3. Si esa entrega falla o el proceso termina antes, el despachador de trabajos reintenta desde el mensaje persistido.
4. Cada manejador es idempotente por `(outboxMessageId, handlerCode)`, de modo que la entrega al menos una vez produce efecto exactamente una vez.
5. `billing` publica un nombre de evento; no conoce a sus consumidores. `membership` y `events` registran manejadores; no conocen a `billing`.

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

**Contexto.** `QR_SIGNING_SECRET` era una clave única sin versión. Rotarla invalidaba de golpe todas las credenciales sindicales vigentes, lo que convertía una medida rutinaria de higiene criptográfica en un incidente institucional (defecto `D-F0-012`).

**Decisión.** La variable pasa a ser un **llavero**: una lista de entradas `identificador:clave`, donde la primera es la activa. `MemberCredential` guarda en `signingKeyId` la clave con la que se firmó. Rotar consiste en anteponer una clave nueva; lo emitido antes sigue verificando con la anterior mientras permanezca en el llavero.

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

**La asimetría con las organizaciones es deliberada.** Las dos entidades son personas morales distintas y ningún nombramiento debe cruzarlas por descuido. Las organizaciones viven **dentro** de una entidad, y hay cargos cuya función es verlas todas. Ahí `null` sí significa «todas las de su entidad», porque la comprobación de entidad ya acotó antes. Lo que evita el descuido es que un rol de alcance `ORGANIZATION` no pueda nombrarse sin ella.

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

**Contexto.** El esquema tiene compartimentos (`UNION`, `SOCIAL`, `DISCIPLINARY`) y el motor de permisos los comprueba. Era tentador marcar los padrones como `UNION` y el registro de personas beneficiarias como `SOCIAL`.

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

**Contexto.** `ApplicationReview` guarda cada actuación de quien revisa, es inmutable por privilegios de columna y tiene un campo `d…20223 tokens truncated… el conteo de llamadas, la fila en la base— hay que preguntar por el efecto.

---

## ADR-0132 · El mismo dato no manda desde dos sitios: `GEMINI_DEFAULT_MODEL` siembra, `AiProviderConfiguration` gobierna

**Contexto.** El PRD §21 contrata la variable de entorno `GEMINI_DEFAULT_MODEL`, y el §15.1 dice que claves, modelos y límites se configuran «mediante variables de entorno **y** configuración administrativa segura». El modelo de datos, además, contrata desde la Fase 0 una fila `AiProviderConfiguration` con `defaultModel` y `allowedModels`.

**El problema.** Leídos juntos, dos sitios guardan el mismo hecho. Ese es exactamente el patrón que este proyecto lleva encontrado cuatro veces —`D-F4-002`, `D-F6-005`, el número de fase de estas mismas claves y la tabla del §11 de `docs/ENVIRONMENT.md`—: una regla escrita dos veces se corrige una vez.

**Decisión.** Se reparten sin solaparse.

- **La clave va solo al entorno.** `GEMINI_API_KEY` nunca toca la base. La fila guarda el **nombre de la variable** que la contiene, y una restricción de la base lo comprueba: `apiKeyEnvVarName` tiene que parecerse a un nombre de variable y no a una clave. Un secreto en la base es un secreto en cada copia de seguridad y en cada volcado de depuración.
- **El modelo y los límites van solo a la fila.** Es lo administrable: quien paga la factura tiene que poder bajar el costo máximo un martes sin esperar un despliegue.
- **`GEMINI_DEFAULT_MODEL` es el valor con el que la semilla crea esa fila en una instalación nueva.** Se lee una vez, ahí. En marcha no lo lee nadie, y cambiarlo en una instalación ya sembrada no cambia nada. Queda escrito en `.env.example`, en `docs/ENVIRONMENT.md` y en `docs/INTEGRATIONS.md`, porque una variable que no hace lo que su nombre sugiere es peor que ninguna si no se dice.

**Por qué sigue siendo obligatoria desde la Fase 8.** No porque el arranque la use, sino porque una instalación no está completa sin ella: la semilla se niega a escribir la configuración del proveedor sin modelo, y el arranque avisa antes y más barato que un despliegue a medio sembrar.

**Y la fila nace apagada.** `isEnabled` en falso. El PRD §24 Fase 8 exige que la aplicación siga operando con Gemini caído; una instalación nueva es el caso extremo de eso. Encenderla es un acto de alguien con `ai.provider.configure`, no el estado por omisión.

---

## ADR-0133 · Redactar un prompt y publicarlo son dos permisos porque si no, la revisión depende de la buena costumbre

**Contexto.** El PRD §15.3 exige que la publicación de un prompt crítico pase por revisión humana. La base lo sostiene con una restricción: `reviewerId` no puede ser `authorId`.

**El problema.** Una restricción así se cumple sola cuando dos personas distintas hacen las dos cosas, y se convierte en un estorbo cuando una sola persona tiene ambas facultades: escribe, le pide a alguien que firme, y la firma es un trámite. La restricción sigue verde y la revisión no existe.

**Decisión.** `ai.prompt.edit` y `ai.prompt.publish` son permisos distintos, en manos distintas: redacta y prueba `COMMUNICATIONS`, publica `EXECUTIVE_SECRETARY`. La separación deja de depender de que la organización reparta el trabajo con cuidado y pasa a ser la forma del sistema.

**Probar cae del lado de redactar.** El laboratorio ejecuta una versión en borrador con datos que escribe quien prueba. Un permiso propio para el laboratorio solo serviría para dárselo a quien no puede corregir lo que probó, que es alguien mirando un problema que no puede arreglar.

**`ai.provider.configure` y `ai.prompt.publish` no van al Superadmin raíz**, aunque el catálogo de la Fase 0 los tenía apuntados ahí. Por el motivo de ADR-0048 —no tiene cuenta ni pantalla desde la que ejercerlos— y por uno propio de esta fase: el actor raíz no tiene fila en `User`, de modo que no puede figurar como revisor de nadie, y fijar el costo máximo mensual es decidir cuánto gasta la organización, que es un acto institucional. Que la IA se apague cuando el proveedor falle no depende de ninguno de los dos: la degradación es automática.

---

## ADR-0134 · Vigilar el gasto de la IA no da acceso a lo que la gente le contó

**Contexto.** El PRD §24 Fase 8 pide que los costos y errores puedan consultarse por módulo **sin exponer contenido sensible**. El catálogo de permisos de la Fase 0 nombraba `generation.read`, que es lectura de la salida —contenido incluido—.

**Decisión.** Se añade `ai.usage.read`, que da consumo, costo, latencia y errores agregados por módulo y ninguna línea de texto. La Comisión de Vigilancia lo tiene y no tiene `ai.generation.read`: fiscalizar cuánto cuesta el modelo no exige leer lo que alguien escribió en una orientación.

**Con un solo permiso, la única forma de vigilar el gasto habría sido conceder la lectura del contenido**, y ese es el camino por el que un permiso de auditoría se convierte en una puerta.

**`AUDITOR` va al revés y por eso la pareja no sobra.** Lee la instrucción (`ai.prompt.read`), lee la salida (`ai.generation.read`) y **no** decide sobre ella (`ai.generation.review`). Auditar una salida sin el prompt que la produjo es auditar la mitad; decidir si vale es del área que responde por ella, no de quien la audita después.

---

## ADR-0135 · Una conversación no cambia de persona ni de consentimiento

**Contexto.** La orientación inicial se puede dar sin identificar a nadie: `AiConversation` admite `personId` nulo. Cuando sí hay persona, una restricción exige consentimiento: `personId IS NULL OR consentId IS NOT NULL`.

**El problema.** Esa restricción se comprueba al insertar y también al actualizar, pero no impide el movimiento que de verdad preocupa: tomar una conversación anónima, ponerle una persona **y** un consentimiento firmado después, y quedarse con un hilo «consentido» cuyo texto se produjo cuando nadie había consentido nada. Con la restricción sola, eso pasa.

**Decisión.** Los privilegios por columna retiran `UPDATE` sobre `personId`, `legalEntityId`, `consentId`, `module` y `purpose`. Lo que se puede mover es lo que cambia mientras la conversación transcurre: cerrarla, contar sus mensajes, atarla a una política de retención.

**Cuando alguien se identifica a mitad de camino, empieza una conversación nueva.** Es más trabajo y es lo correcto: lo dicho antes se dijo en otro marco.

**El mismo razonamiento retira `UPDATE` de `ai_prompt_version_source`.** Sus dos columnas son la clave: un vínculo se crea o se quita, no se edita.

---

## ADR-0136 · La clave del proveedor se resuelve por el nombre que guarda la fila, en un solo sitio

**Contexto.** ADR-0132 dejó la clave fuera de la base: la fila `AiProviderConfiguration` guarda `apiKeyEnvVarName` —el **nombre** de la variable de entorno que la contiene— y no el secreto. Faltaba quién convierte ese nombre en la clave, y dónde.

**Decisión.** Una sola función, `resolveAiApiKey(varName)`, en `src/platform/config/`. Es el único punto del sistema que hace `process.env[nombre]` para la IA, y vive en el único árbol donde el linter admite leer `process.env` (PRD §21). Que la resolución esté en un solo lugar tiene una consecuencia que se paga sola el día de una auditoría: para saber quién puede leer una clave basta mirar quién importa esta función.

**La cadena vacía es la señal de degradación, no un error.** Una variable ausente devuelve `''`, y el servicio cae al camino humano. Lanzar por una clave ausente confundiría un estado de operación legítimo —una instalación que todavía no configuró el proveedor— con una avería.

**Y rechaza un nombre que no parece un nombre.** La función comprueba la misma forma que la restricción de la base (`^[A-Z][A-Z0-9_]{2,79}$`). No es redundante: la base defiende su fila, y esto defiende el `process.env` de que alguien pase, por otro camino —una prueba que fija el entorno, un valor pegado a mano—, una clave donde va un nombre. `process.env['AIza…']` devuelve indefinido en silencio y haría parecer «sin clave» a un proveedor que sí la tiene.

---

## ADR-0137 · Un solo servicio llama al proveedor, y ahí viven los límites, la degradación y la bitácora

**Contexto.** La Fase 8 pide ejecutar el modelo con tres defensas —límites antes de llamar, degradación al camino humano y una bitácora inmutable— y hacerlo solo en servidor.

**Decisión.** `runGeneration`, en `src/platform/ai/ai-service.ts`, es el **único** que invoca el puerto del proveedor. El puerto (`provider-port.ts`) solo habla con Gemini; toda la política vive en el servicio. Un puerto que además decidiera la política sería un segundo camino por el que saltársela, y el control `C-F8-01` lo impide desde fuera: el host del proveedor solo puede aparecer en el puerto.

**Qué deja fila y qué no.** Una llamada al proveedor —con éxito, con error o agotada— es una ejecución y deja fila en `ai_generation`, porque el criterio de la fase pide poder consultar los costos y los errores por módulo. La degradación (apagada o sin clave) y el corte por límite **no** dejan fila: no hubo ejecución que registrar, y una fila sin llamada ensuciaría los contadores por persona y por mes que esas mismas filas alimentan.

**La forma de la salida se valida contra el esquema de la versión.** Un validador propio cubre el subconjunto de JSON Schema que los prompts usan de verdad —`type`, `required`, `properties`, `items`, `enum`— y sobre él valida por completo; lo que no cubre lo dice en voz alta (`unsupportedKeywords`) en vez de aprobarlo. Una salida que no encaja se registra como `SCHEMA_REJECTED` y **no se enseña ni se guarda** como si fuera un resultado. Se prefirió un validador acotado y honesto a una dependencia de validación completa: el subconjunto es el que existe, y ampliarlo es añadir un caso y su prueba.

**Lo que no vive aquí.** La minimización y la redacción de lo que se envía (bloque E), la resolución del prompt vigente y los casos de uso (bloques C y F). El servicio recibe el texto ya preparado y la versión ya elegida; este bloque construye la máquina de ejecutar, no lo que se ejecuta.

---

## ADR-0138 · El precio por token vive en el código; el techo de gasto, en la base

**Contexto.** Para registrar el costo de cada ejecución y sostener el techo mensual hace falta un precio por token. `AiProviderConfiguration` guarda el techo mensual y la moneda, pero no un precio: no tiene columna para ello, y añadirla fue una decisión, no un olvido.

**Decisión.** Son dos cosas distintas y se guardan en dos sitios distintos.

- **El techo mensual es política de la organización** —cuánto está dispuesta a gastar— y por eso se administra en la base, para bajarlo un martes sin desplegar.
- **El precio por token es un hecho del proveedor** —lo pone Google y cambia cuando Google lo cambia, igual que la dirección de su API—. Vive en `pricing.ts`, atado a un commit revisable. Ponerlo en la base invitaría a que alguien «ajuste el precio» y descuadre la factura.

**Ante lo desconocido, se sobrestima.** Un modelo sin tarifa se cobra a la más cara conocida: para un techo de gasto, subestimar no es seguro y sobrestimar sí. Y si la moneda del techo no coincide con la de la tabla, el costo se registra como cero y se dice en voz alta —sin tipo de cambio, cualquier cifra sería inventada, y una cifra inventada en una factura es peor que un cero explicable—.

---

## ADR-0139 · La degradación y los límites se prueban contando llamadas, no simulando una caída

**Contexto.** El PRD §24 Fase 8 exige que la aplicación siga operando con Gemini caído. La forma obvia de probarlo es apuntar el puerto a un dominio inexistente y comprobar que el flujo no se cuelga.

**Por qué esa forma no prueba nada.** Es exactamente la trampa de ADR-0130 en otro módulo: un dominio inexistente falla al instante, y la prueba pasa igual esté o no llamando. Mide el entorno, no la regla.

**Decisión.** Se prueba con un puerto falso que **cuenta llamadas**. Con la IA apagada, sin clave o por encima de cualquiera de los tres límites, el contador queda en cero: la garantía no es «responde rápido» sino «no llama», que es más fuerte y no depende de cuánto tarde en fallar un dominio. La caída real del proveedor se prueba haciendo que el falso lance —error y tiempo agotado— y comprobando que queda fila y que el resultado manda al camino humano.

**La lección, la de siempre aquí.** Cuando se puede afirmar la ausencia de algo —una llamada que no se hizo, una fila que no se escribió— es preferible a medir un tiempo: la ausencia se cuenta, y contar no depende de la máquina.

---

## ADR-0140 · El laboratorio comparte la máquina de ejecución, y es la única puerta que ejecuta sin publicar

**Contexto.** El PRD §15.3 pide un laboratorio para probar un borrador contra el modelo antes de publicarlo. El servicio de ejecución del bloque B (`runGeneration`) solo ejecuta versiones **publicadas**, con razón: en producción, nada sin revisar debe llegar al modelo sobre asuntos de gente real.

**El problema.** Si el laboratorio abriera su propio camino al proveedor, tendría que reimplementar los límites, la degradación y la bitácora —o, peor, saltárselos—. Una prueba de laboratorio también cuesta dinero y también manda algo al proveedor: no puede ser un atajo que no cuente.

**Decisión.** El servicio se parte en dos entradas sobre una **máquina común**. `runGeneration` (producción) exige una versión publicada; `runLabGeneration` (laboratorio) exige una en borrador o en prueba. Una vez elegida la versión, las dos pasan por exactamente el mismo código: los mismos tres límites, la misma degradación al camino humano, la misma fila inmutable en `ai_generation`. Lo único que cambia es qué versiones se dejan ejecutar.

**Y la puerta la abre un solo caso de uso.** `runLabGeneration` no lo llama nadie salvo el caso de uso del laboratorio, que exige `ai.prompt.edit`. Ejecutar algo sin publicar es una facultad, no un descuido: probar cae del lado de redactar (ADR-0133), porque quien prueba un texto es quien puede corregirlo.

**Por qué no un adaptador ni una bandera suelta.** Una bandera `allowUnpublished` en `runGeneration` sería una casilla que algún día se marca «temporalmente» desde un flujo de producción. Dos funciones con nombres distintos hacen que ejecutar sin publicar tenga que escribirse a propósito.

---

## ADR-0141 · Corregir un prompt es una versión nueva, no una edición

**Contexto.** El CMS sobrescribe el borrador vivo al editar, para no llenar el historial de una versión por pulsación de teclado (ADR del bloque de contenidos). Para los prompts se tomó la decisión contraria.

**Decisión.** Cada corrección de una versión de prompt **crea una versión nueva**; nunca se pisa la anterior. Lo sostiene la base con privilegios de columna: el `UPDATE` sobre el texto de sistema, el modelo, los parámetros y el esquema está retirado, y solo se puede mover el estado y las fechas. El caso de uso `saveDraftVersion` no tiene, por tanto, un camino de sobrescritura: siempre inserta.

**Por qué aquí sí y en el CMS no.** Un borrador de comunicado es trabajo en curso de una persona; un prompt es lo que la máquina repetirá sin que nadie lo lea otra vez, sobre expedientes de gente real. La pregunta «¿por qué el sistema dijo eso sobre mí?» se responde con la versión exacta que se ejecutó, y una edición silenciosa la borraría. El historial completo es el precio, y es barato: una versión pesa un texto.

**Consecuencia visible.** Iterar sobre un prompt deja varias versiones en borrador. Es correcto: cada una es un intento con su autoría y su fecha, y publicar elige una, no la última por defecto.

---

## ADR-0142 · Revertir crea un borrador; retirar deja el prompt sin nada que ejecutar

**Contexto.** El §15.3 pide reversión, y el modelo permite retirar una versión. Faltaba decidir qué producen exactamente esos dos actos.

**Decisión.**

- **Revertir** copia el contenido de una versión antigua en una **versión nueva en borrador**, con el rastro de cuál fue el origen (`revertedFromVersionId`). No restaura sobrescribiendo, y no se publica sola: revertir crea el borrador, y publicarlo es otro acto, de otra persona. Cae del lado de redactar (`ai.prompt.edit`), porque lo que produce es un borrador.
- **Retirar** pone la versión vigente en `RETIRED` y deja el prompt **sin versión vigente**. Es lo que hace que la degradación del bloque B tenga sentido desde la administración: un prompt retirado no se ejecuta, y sus flujos asistidos caen al camino humano, exactamente como con la IA apagada. Cae del lado de publicar (`ai.prompt.publish`), porque decide qué se ejecuta.

**La simetría importa.** Publicar apunta el prompt a una versión; retirar lo deja sin ninguna. Las dos son decisiones de quien responde por lo que la máquina dice en nombre de la organización, y por eso comparten la facultad que exige un motivo escrito.

---

## ADR-0143 · Los vectores vienen del puerto, con un modelo y una dimensión fijados en código

**Contexto.** La base documental de la Fase 8 guarda un vector de 768 dimensiones por fragmento y busca por el más próximo (esquema del bloque A). Hacía falta decidir de dónde salen esos vectores y quién fija su modelo y su dimensión.

**Decisión.** Se añade `embed()` al mismo puerto del proveedor que ya hace `generate()`: una prueba de vectorización se sustituye entera por el adaptador falso, igual que la generación, y por eso las pruebas de recuperación no dependen de la red (ni de la cuenta). El **modelo de embeddings** (`text-embedding-004`) y la **dimensión** (768) son constantes junto al puerto, no filas administrables, por la misma razón que el precio (ADR-0138): son hechos del proveedor, y además la dimensión está atada al `vector(768)` del esquema —cambiarla exige una migración y reindexar todo—, así que no puede ser algo que alguien ajuste desde una pantalla.

**Vectorizar comparte la degradación de generar.** Sin proveedor encendido o sin clave, no se vectoriza: la indexación se queda como estaba y la recuperación devuelve vacío, y el flujo asistido cae al camino humano. Es la misma regla del bloque B, aplicada a la otra mitad del puerto.

---

## ADR-0144 · La recuperación filtra por permiso en la misma consulta, no después

**Contexto.** El PRD §15.2 exige que las fuentes y los fragmentos respeten los permisos de quien pregunta. El modelo de datos copia `requiredPermissionCode` de la fuente a cada fragmento —una duplicación deliberada del bloque A— justo para esto.

**El problema, y por qué el orden importa.** Lo natural sería recuperar los fragmentos más próximos y después descartar los que la persona no puede leer. Pero «después» es demasiado tarde de dos maneras: el fragmento restringido ya se leyó de la base, y —peor— si el resultado alimenta al modelo, el modelo ya lo vio. Un dato que no se puede desver no se protege quitándolo del resultado final.

**Decisión.** El filtro va **dentro** de la consulta del vecino más próximo, junto al orden por distancia:

- `requiredPermissionCode` del fragmento tiene que ser nulo (público) o estar entre los permisos de quien pregunta, que salen de `effectiveGrantedPermissions` —la misma función que decide todo lo demás, de modo que un permiso obtenido por cualquier vía cuenta aquí también—.
- La fuente tiene que estar entre las que la versión del prompt autoriza. Un prompt no lee cualquier cosa indexada: lee lo que se le autorizó, y esa lista es parte de lo que se revisó al publicar (por eso solo se edita en borrador).

Los dos filtros no se pueden separar sin abrir un hueco, y por eso viven en el mismo `WHERE`. Se probó rompiéndolo: quitar el filtro de permiso hace que un fragmento restringido alcance a quien no puede leer su origen, y la prueba se pone en rojo.

**Deshabilitar una fuente borra sus fragmentos.** No basta con marcarla: dejar los vectores de una fuente deshabilitada sería dejar abierta una puerta que la consulta cree cerrada. Reindexar hace lo mismo —borra y vuelve a insertar—, porque un fragmento no se edita: reescribir su texto dejaría el vector apuntando a algo que ya no dice eso.

---

## ADR-0145 · Lo que se envía al modelo se redacta en el servicio, no aguas arriba

**Contexto.** El PRD §15.5 pide minimizar y redactar o seudonimizar lo que se manda al modelo. En el bloque B, `redactionApplied` lo declaraba quien llamaba: una promesa, no un hecho.

**Decisión.** El servicio de ejecución **redacta él mismo** el texto antes de enviarlo: sustituye la PII que reconoce —correo, CURP, RFC, teléfono, tiras largas de dígitos— por un marcador, y la huella se calcula sobre el texto ya redactado, que es lo que de verdad sale. `redactionApplied` de la fila queda en verdadero si la redacción del servicio **o** la de quien llama tocó algo. Que la haga el servicio y no el llamador es lo que la vuelve una garantía y no una cortesía: ningún camino que pase por aquí manda PII reconocible por descuido.

**No es cifrado ni exhaustividad.** Es la primera línea, la que quita lo evidente. El segundo muro es el del bloque B —la bitácora guarda la huella y nunca el texto—, de modo que lo que se escapara al redactor tampoco queda en una tabla de telemetría. Un texto sin PII reconocida sale igual que entró, y por eso la huella de una petición sin datos personales no cambia respecto del bloque B.

---

## ADR-0146 · La inyección se marca, no se bloquea

**Contexto.** El PRD §15.5 pide filtros contra instrucciones incrustadas en documentos. La base documental (bloque D) trae material que puede contener «ignora las instrucciones anteriores».

**Decisión.** El servicio revisa la entrada y el material consultado en busca de patrones de inyección y, si los halla, **marca** la fila (`injectionSuspected`) en lugar de bloquear. Bloquear castigaría a quien pregunta por lo que dice un documento que no escribió; marcar le dice a la revisión humana —que en esta fase revisa cada salida (bloque F)— que el material intentaba secuestrar al modelo. El rechazo, cuando toca, es de la persona que revisa, no de una expresión regular.

**Por qué una marca y no un umbral.** Un detector de inyección nunca es completo; tratarlo como una puerta daría una falsa sensación de barrera. Como señal para la revisión, en cambio, un falso positivo cuesta una mirada y un falso negativo no desactiva ninguna otra defensa.

---

## ADR-0147 · La IA no decide: el servicio rechaza los efectos del §15.4 antes de llamar

**Contexto.** Es la garantía que gobierna la fase entera. El PRD §15.4 enumera diez decisiones que la IA no puede tomar. El `AiGenerationStatus` reserva `BLOCKED_BY_POLICY` para esto desde el bloque A.

**Decisión.** El servicio de ejecución lleva un registro de los diez efectos (`PROHIBITED_EFFECTS`), y cuando la petición **declara** que su salida produciría uno de ellos, rechaza la ejecución **antes de llamar al modelo** y deja fila `BLOCKED_BY_POLICY`. No es una recomendación para quien escribe los prompts: es una comprobación del servicio, en el único sitio por el que se llama al proveedor.

**Por qué un efecto declarado y no una inferencia.** El servicio no adivina si una salida «decide» una admisión: lo declara quien conecta la IA a un flujo (bloque F). Es defensa en profundidad, no la única defensa —la otra es que **toda** salida la confirma una persona (bloque F), de modo que la IA nunca produce por sí sola un efecto vinculante—. Este guardián añade que ni siquiera se le pida al modelo producir una de las diez decisiones cuando el flujo lo declara.

**El registro se coteja con el contrato.** El texto de cada efecto es, palabra por palabra, el del §15.4, y el control `C-F8-02` falla si alguna vez divergen: una entrada que se pierda aquí es una decisión que la IA podría volver a tomar sin que nadie lo note. Probado quitando una entrada y viendo el control ponerse en rojo.

---

## ADR-0148 · Un caso de uso asistido pasa por un núcleo, no llama al servicio a solas

**Contexto.** El bloque F contrata cinco flujos asistidos —orientación, explicación de trámite, clasificación sugerida, resúmenes y documentos asistidos— y cada uno tiene que armar su petición con el prompt vigente, la recuperación con permisos (bloque D) y el efecto que declara (bloque E). Repetir esos tres pasos en cada caso de uso los dejaría separarse con el tiempo.

**Decisión.** Los casos de uso asistidos pasan por `assist()` (`@/modules/ai`), un núcleo que resuelve la versión **publicada** del prompt por su *código* —un identificador, no el texto—, recupera el contexto con `retrieveForVersion` y llama a `runGeneration` con el propósito y el efecto declarado. Sin versión publicada, el núcleo degrada al camino humano, igual que con la IA apagada: un flujo asistido sin prompt publicado no es un error del programa, es un estado de operación. El prompt no vive en el código: el código solo nombra qué prompt gobierna cada flujo, como las plantillas de notificación se nombran por su clave.

**La consulta a la base documental también se redacta.** La búsqueda semántica llega al proveedor por los embeddings, así que `assist` redacta el texto de la consulta antes de recuperar, por la misma razón que el servicio redacta lo que genera (ADR-0145): la minimización del §15.5 alcanza a todo lo que sale del servidor, no solo a la generación.

## ADR-0149 · La revisión humana de una salida es una decisión terminal y de solo inserción

**Contexto.** El criterio 4 de la fase exige que las acciones sensibles las confirme una persona, y el criterio 3 que la salida se pueda corregir. `AiReview` guarda la decisión —aceptada, corregida o rechazada— desde el bloque A, con la tabla ya sin `UPDATE` ni `DELETE`.

**Decisión.** `reviewGeneration` escribe una revisión por generación, y esa unicidad la impone la base (`@@unique([generationId])`, migración correctiva del bloque F). Una salida se revisa una vez: aceptar la deja tal cual, corregir la sustituye por el texto de la persona —que es lo que «permite corregirla» significa de verdad—, rechazar la detiene y se explica. Solo se revisa una salida que el modelo **produjo** (`SUCCEEDED`): un rechazo de esquema o un corte por política no dejaron texto que revisar.

**Por qué terminal y no un historial.** La puerta que decide si una salida surte efecto pregunta «¿está aceptada esta generación?», y esa pregunta necesita una sola respuesta. Con la tabla de solo inserción y la unicidad, nadie puede decir después «yo lo rechacé» sobre algo que se aceptó, ni dejar coexistir dos decisiones que se contradigan.

## ADR-0150 · La IA asiste a quien ya puede leer; no reparte el primer acceso

**Contexto.** La Fase 6 decidió que la canalización automática de una solicitud la calcula una **tabla explícita y sin IA** (`domain/routing.ts`, ADR-0106), porque esa propuesta decide quién lee por primera vez un relato que puede contener una agresión o un diagnóstico, y una tabla se audita mientras un modelo no. El PRD §15.2 y el §24 Fase 8 contratan, a la vez, una «clasificación sugerida de solicitudes» con IA, y la columna `SupportRequest.suggestedByAiGenerationId` la espera desde la Fase 0.

**Decisión.** Las dos cosas conviven porque son distintas. La canalización automática al recibir el mensaje sigue siendo la de la tabla, sin IA: reparte el primer acceso. La clasificación asistida la pide una persona que **ya puede leer** la solicitud —tiene `support.request.triage`, y el asiento de su lectura ya quedó escrito—, y produce una propuesta que no ejecuta nada (ADR-0106) hasta que se revisa y confirma. La IA no decide quién lee un relato sensible: ayuda a quien ya lo tiene delante. Esa frontera es la que hace que asista sin decidir.

**Qué escribe.** La sugerencia guarda `suggestedRouting` y apunta `suggestedByAiGenerationId` a la generación que la produjo —lo que distingue una propuesta de un modelo de la que calculó la regla, y cambia cuánto hay que revisarla—. La columna `suggestedByAiGenerationId` no estaba en la lista blanca de columnas actualizables de `support_request` (el bloque A la añadió sin volver a otorgarla); una migración correctiva del bloque F la otorga, el mismo desfase silencioso que ya avisó la Fase 6.

## ADR-0151 · Una canalización sugerida por IA no se confirma sin revisión aceptada

**Contexto.** «Una salida asistida no surte efecto sin que una persona la haya aceptado» es la garantía del bloque F. Para la clasificación, «surtir efecto» es convertirse en la canalización confirmada de la solicitud, que es el acto que abre expediente y fija prioridad.

**Decisión.** `confirmRouting` comprueba, cuando la propuesta vigente la sugirió la IA (`suggestedByAiGenerationId` no nulo) y se va a confirmar **esa misma** canalización, que su generación tenga una revisión aceptada o corregida; si no, se niega. Apartarse de la sugerencia —confirmar otra entidad— no se bloquea: ahí la sugerencia no surte efecto, la sustituye la decisión de quien confirma, y bloquearlo dejaría a una persona rehén de una sugerencia con la que no está de acuerdo. La puerta actúa exactamente en el punto donde la salida asistida se vuelve vinculante, y ni antes ni de más.

**Probado rompiéndolo.** Se forzó la comprobación a «aceptada» siempre y se vio la prueba de la puerta ponerse en rojo: sin ella, una canalización sugerida por IA se confirma sin que nadie la haya mirado.

## ADR-0152 · El consumo se consulta con un permiso que no abre las conversaciones

**Contexto.** El criterio 6 de la fase pide consultar «los costos y errores por módulo **sin exponer contenido sensible**». El catálogo separa desde la Fase 0 dos permisos: `ai.generation.read` (el contenido y su trazabilidad) y `ai.usage.read` (el consumo).

**Decisión.** La consulta de consumo (`usageByModule`, `@/modules/ai`) vive detrás de `ai.usage.read` y **no selecciona ninguna columna de contenido**: agrega peticiones, tokens, costo y estados, agrupados por el módulo del prompt que produjo cada ejecución, con un `SELECT` cuya lista son todos números y estados. Que no exponga contenido no es una promesa de la pantalla: es una propiedad de la consulta. La contraloría (`OVERSIGHT_COMMISSION`), que tiene `ai.usage.read` y no `ai.generation.read`, ve el gasto y no las conversaciones —y eso se prueba en positivo y en negativo—.

**El control que lo sostiene.** `C-F8-04` recorre el archivo de la consulta y falla si nombra una columna de contenido —el resumen de la salida o la huella de lo enviado—, ni siquiera en un comentario. La prohibición es del archivo entero, no solo del `SELECT`, para que la garantía no dependa de dónde se escriba el nombre. Probado nombrándola y viéndolo fallar.

## ADR-0153 · Los límites y el encendido del proveedor se gobiernan desde una pantalla, no la clave

**Contexto.** Los límites y el encendido viven en la fila del proveedor desde el bloque A, «porque quien paga la factura tiene que poder bajarlos un martes sin esperar un despliegue». Faltaba la pantalla desde la que se bajan.

**Decisión.** `configureProvider` (`ai.provider.configure`, permiso crítico con motivo) escribe los modelos permitidos, los tres límites, el techo de gasto, la moneda, el opt-out de entrenamiento y el encendido. La clave **no** se toca: la fila guarda el nombre de su variable de entorno, y apuntar a otra es una decisión de despliegue, no de una pantalla —`apiKeyEnvVarName` no está entre las columnas actualizables—. El modelo por omisión tiene que estar entre los permitidos, y el techo de gasto tiene que ser positivo: las dos las exige también la base con sendos `CHECK`, y el caso de uso las comprueba antes para dar un mensaje claro en vez de un error de restricción.

**Apagar no es una avería.** Con el proveedor apagado la aplicación sigue en pie y todo cae al camino humano (criterio 5). La salud lo dice tal cual —`DEGRADED`, no `failed`—, y la pantalla del proveedor la enseña para que el estado de operación se lea sin adivinarlo. Que configurar surte efecto se prueba bajando el máximo de tokens por petición y viendo la siguiente ejecución cortarse antes de llamar.

---

## ADR-0154 · La lista de espera es un estado de la inscripción, no una tabla aparte

**Contexto.** Un evento con aforo (PRD §16.3) necesita lista de espera: quien llega cuando ya no hay lugar espera un hueco. Se podría modelar como una tabla `EventWaitlist` separada.

**Decisión.** No hay tabla de lista de espera: `WAITLISTED` es uno de los estados de `EventRegistration`. Una inscripción en espera es la misma fila que una confirmada, en otro estado, y el ascenso al liberarse un lugar es una transición de estado, no un movimiento entre tablas. El único `(eventId, personId)` vale igual para la lista y para la inscripción, de modo que nadie está a la vez inscrito y en espera. Modelarlo aparte duplicaría la unicidad y abriría la puerta a las dos filas contradictorias.

## ADR-0155 · Una constancia es verificable y revocable, y la base impide revocar la que no se emitió

**Contexto.** El criterio 5 de la Fase 9 pide que las constancias sean verificables y revocables. Verificable ya lo da el patrón de `GeneratedDocument` (huella y código, como la credencial de la Fase 3). Revocable es lo nuevo.

**Decisión.** La constancia de una inscripción es un `GeneratedDocument` (`constancyDocumentId`) y su revocación es una **marca** (`constancyRevokedAt`), no un borrado: la fila permanece como evidencia de que existió y de que se revocó. La base impone que no se pueda revocar una constancia que nunca se emitió —`constancyRevokedAt` exige `constancyDocumentId`—, porque «revocada» sin haber existido no dice nada y ensuciaría cualquier verificación. Y un evento que declara emitir constancias tiene que nombrar su plantilla (`issuesConstancy` exige `constancyTemplateId`): «emite constancia» sin plantilla es una promesa que no se puede cumplir.

## ADR-0156 · Un aviso obligatorio no es una preferencia: la base lo impone

**Contexto.** Es la garantía que gobierna la Fase 9 del lado de las comunicaciones (PRD §16.2, criterio 1). El catálogo de categorías ya distingue `GOVERNANCE_MANDATORY` de `PROMOTIONAL` desde la Fase 1, y `DeliveryStatus.SUPPRESSED` ya advertía que «nunca aplica a un aviso obligatorio». Faltaba dónde vive la preferencia y quién impide suprimir lo obligatorio.

**Decisión.** `NotificationPreference` guarda, por persona, categoría y canal, si la persona pidió no recibir esa categoría por ese canal. La garantía no se deja al caso de uso: la base rechaza con un `CHECK` una preferencia sobre `GOVERNANCE_MANDATORY` que quede suprimida. Ninguna pantalla, ningún guion de datos y ninguna migración futura pueden apagar un aviso que la persona no puede rechazar. Lo promocional sí se silencia, y por eso las dos cosas son categorías distintas y no un mismo canal con una bandera.

## ADR-0157 · El centro de notificaciones y las preferencias son un derecho de la cuenta, no un permiso

**Contexto.** El bloque B de la Fase 9 construye el centro de notificaciones dentro de la plataforma y la administración de preferencias (PRD §16.2). Había que decidir cómo se autoriza: como las fichas de directorio o los consentimientos, con un permiso `*_own` que un rol concede, o como las sesiones propias, que cualquier cuenta gobierna sin que nadie se lo otorgue.

**Decisión.** Sin permiso: leer el propio buzón y decidir qué se recibe es un derecho de la cuenta, igual que ver y cerrar las sesiones propias (`permiso: null` en las secciones del portal). La razón es que los avisos llegan a **toda** cuenta —seguridad, cobros, gobierno—, no solo a quien tiene una ficha o una afiliación; exigir un permiso otorgable dejaría a cuentas sin forma de leer o silenciar su propio correo. Todo se ancla a `actor.personId`; un aviso ajeno responde «no encontrado», nunca «prohibido», como en el portal de sesiones. Leer y las labores de mantenimiento (marcar leído, archivar) no se auditan —son gestos personales de alto volumen y sin valor de gobierno—; cambiar una preferencia sí se registra, porque altera lo que la organización puede o no puede enviarte.

## ADR-0158 · Solo la clase obligatoria de gobierno es no silenciable; el resto lo decide la persona

**Contexto.** El catálogo tiene ocho categorías. La base solo bloquea la supresión de `GOVERNANCE_MANDATORY`. Cabía endurecer el caso de uso para volver también innegociable `SECURITY`.

**Decisión.** El caso de uso bloquea exactamente lo que la base bloquea: solo `GOVERNANCE_MANDATORY`. Que el dominio prohíba más que el `CHECK` rompería el relato de que «la garantía vive en el dato»: habría una supresión que el caso de uso niega y la base permite, y la única prueba de la regla sería el código. Silenciar `SECURITY` en el propio centro es una decisión legítima de la persona sobre su vista; su entrega por canal, cuando exista, decidirá aparte qué avisos de seguridad no admiten silencio. Mantener el dominio y la base diciendo lo mismo hace que la prueba de la garantía sea una sola y que romperla se vea.

## ADR-0159 · En el bloque B las preferencias gobiernan el centro; el correo y la web llegan con su entrega

**Contexto.** Una preferencia es por categoría **y canal**. Los canales son `IN_APP`, `EMAIL` y `WEB_PUSH`. La entrega por correo y por web —y las campañas— son de los bloques C y D. Ofrecer ya un interruptor de correo que nadie consulta sería un botón sin acción (PRD §0.3).

**Decisión.** El bloque B ofrece las preferencias del único canal que este bloque entrega de verdad: el centro dentro de la plataforma (`IN_APP`). Cada casilla tiene efecto inmediato —una clase silenciada desaparece del centro—, y ninguna promete algo que todavía no ocurre. El modelo y el caso de uso admiten cualquier canal, de modo que el bloque C leerá estas mismas filas para el correo y el D para la web; pero la pantalla no dibuja un interruptor hasta que su canal entrega. Así no hay preferencia muerta y la regla de lo obligatorio ya queda probada sobre el canal que existe.

## ADR-0160 · Las plantillas de aviso se versionan como las de documento: una publicada no se edita, se publica otra

**Contexto.** El criterio 2 de la Fase 9 pide que las plantillas estén versionadas, y hasta el bloque C las plantillas de aviso solo existían en la semilla, sin forma de redactarlas ni versionarlas. Ya había un patrón probado para lo mismo en `DocumentTemplate` (F5-DOC).

**Decisión.** `NotificationTemplate` se administra igual que `DocumentTemplate`: una versión se redacta como borrador, se publica —y publicar retira la versión publicada anterior del mismo código, canal e idioma, para que enviar nunca tenga que elegir entre dos—, y una publicada no se edita: se publica otra. El consecutivo se calcula bajo cerrojo por código, canal e idioma. Redactar y publicar son permisos distintos (`notifications.template.author` y `notifications.template.publish`), por la misma razón que en los prompts (ADR de la Fase 8) y el CMS: quien pone un texto en boca de la organización para muchas personas no es por eso quien lo revisa. Publicar y retirar exigen motivo. Al publicar se comprueba que las variables usadas en el asunto y el cuerpo y las declaradas coincidan: ni un aviso con huecos ni un dato que se cree enviado y se descarta. No se añade inmutabilidad por columna en la base porque un borrador sí se edita; la garantía es la disciplina de versión, la misma que en los documentos.

## ADR-0161 · La administración de plantillas es del canal que hoy las consume: el correo

**Contexto.** Una plantilla tiene canal (`IN_APP`, `EMAIL`, `WEB_PUSH`). Hoy solo el correo consume plantillas: el centro dentro de la plataforma crea sus avisos directamente y la web no existe hasta el bloque D. Ofrecer redactar plantillas de un canal que nada envía sería texto muerto.

**Decisión.** La pantalla de redacción fija el canal en correo y el idioma en `es-MX` —los que hoy envían— y lo dice a la vista, no lo esconde. El caso de uso sigue siendo general: acepta cualquier canal e idioma, de modo que cuando la web llegue (bloque D) solo hay que abrir la opción en la pantalla. Así la administración de plantillas es completa para lo que existe y no promete lo que todavía no entrega.

## ADR-0162 · Una campaña no es una entidad: es un envío autorizado, registrado en la bitácora

**Contexto.** El bloque C·2 pide «campañas operativas autorizadas» (PRD §16.2). La tentación es modelar una entidad `Campaign`. Pero el contrato de fases no admite una entidad nueva en la Fase 9 más allá de las cuatro del bloque A (`entityMigrationPhase`, control `C-COH-16`), y `Campaign` no está entre las entidades contratadas del PRD §18.

**Decisión.** No hay entidad de campaña. Una campaña es un **acto**: `sendCampaign` toma una plantilla ya publicada y, para cada miembro activo de la entidad, crea la `Notification` que le corresponde y encola —o no— su correo. Lo que queda de la campaña es lo que un acto deja: una entrada en la bitácora (`notifications.campaign.sent`, con quién, qué plantilla, a cuántos, cuántos en cola y cuántos silenciados) y las notificaciones creadas. Enviar es crítico y exige motivo, como exportar un padrón: alcanzar a muchas personas a la vez es un acto que se explica. Modelar una entidad habría chocado con el contrato de fases sin dar nada que la bitácora no dé ya.

## ADR-0163 · El correo de una campaña respeta la preferencia y va por la cola, con su entrega registrada

**Contexto.** El PRD §16.2 pide que cada mensaje «registre entrega, fallo, reintento y preferencia del usuario», y el criterio 1 que lo obligatorio y lo promocional se gestionen por separado. El envío por correo de la Fase 1 no consultaba ninguna preferencia.

**Decisión.** Una campaña no envía una clase obligatoria —se rechaza antes de tocar a nadie— y respeta la preferencia de cada persona: a quien silenció esa clase por correo se le crea la notificación pero **no se le envía**, y queda un `DeliveryAttempt` con estado `SUPPRESSED`, no un envío. A los demás se les encola un trabajo `notification-email`, que al correr entrega y registra el intento como `SENT` o, si falla, `FAILED`, dejando que la cola reintente con su propia espera. Va por la cola y no en línea porque una campaña alcanza a muchas personas: hacerlo en la petición la agotaría, y un proveedor de correo lento o caído no debe perder el envío. Los correos transaccionales de la Fase 1 —la invitación, el restablecimiento de contraseña— siguen saliendo directos y sin consultar preferencia: no son difusión que la organización empuja, son la respuesta a un acto que la propia persona pidió, y silenciarlos le cerraría la puerta de su propia cuenta.

## ADR-0164 · Un evento se administra por estados; inscribirse es un acto de la persona

**Contexto.** El bloque E construye el calendario, la inscripción, el aforo, la elegibilidad y la lista de espera (PRD §16.3) sobre el esquema del bloque A. Había que decidir cómo se autoriza cada cosa y cómo se protege el aforo de dos inscripciones a la vez.

**Decisión.** Un evento lo administra quien organiza (`events.event.manage`): nace borrador, se publica, abre inscripción y se cancela, por una máquina de estados que no admite saltos. **Inscribirse, en cambio, es un acto de la propia persona**, no una facultad institucional (así lo dice el catálogo de permisos): se ancla a `actor.personId` y no exige ningún cargo. El aforo se protege con un cerrojo de aviso sobre el evento (`pg_advisory_xact_lock`): dos inscripciones simultáneas no pueden contar el mismo hueco y rebasarlo. Cuando el cupo está lleno, la siguiente entra en **lista de espera** —un estado de la inscripción, no otra tabla (ADR-0154)—; al cancelar alguien que ocupaba lugar, sube la primera de la espera, por orden de llegada. La elegibilidad vive en `Event.eligibilityRules` (JSON) y la evalúa una función pura: hoy, si el evento es solo para agremiados con membresía activa y de qué calidades. Los eventos por invitación no aparecen en ningún calendario: solo los ve quien ya tiene inscripción, y el caso de uso responde «no existe» a quien no puede verlos.

## ADR-0165 · El cobro de un evento confirma la inscripción cuando el pago se confirma, no antes

**Contexto.** El bloque F conecta el cobro de eventos con el catálogo financiero de la Fase 3 (PRD §16.3, §11). Un evento con costo tiene un concepto del catálogo (`Event.catalogProductId`) y la inscripción guarda su cobro (`EventRegistration.paymentId`). Había que decidir cuándo una inscripción de pago cuenta como confirmada.

**Decisión.** Inscribirse a un evento con costo reserva el lugar, pero **no lo confirma hasta que el pago se confirma**. El cobro va por la misma pasarela y el mismo `startCheckout` de la Fase 3; al iniciarlo, la inscripción guarda el `paymentId`. Cuando el pago se confirma —por su webhook, que publica `billing.payment.succeeded` en el buzón de eventos de dominio—, un manejador nuevo (`event-registration-confirmation`) encuentra la inscripción por ese `paymentId` y la pasa a `CONFIRMED`. Volver del navegador no confirma nada: solo el webhook lo hace, como en toda la Fase 3. El manejador convive con el de activación de membresía sobre el mismo evento de dominio: cada uno toca solo lo suyo y no hace nada con un pago que no le corresponde, y es idempotente —un pago que no está en `SUCCEEDED`, o una inscripción ya confirmada, no cambian nada—. No hizo falta ninguna tabla nueva: el enlace ya lo daba `EventRegistration.paymentId` del bloque A.

## ADR-0166 · La constancia de participación es un documento emitido, verificable y revocable, no una consulta

**Contexto.** El bloque G construye la constancia de participación de un evento (PRD §16.3, Fase 9 criterio 5). Había que decidir qué es una constancia: un cálculo que se compone al abrirla, o un documento emitido y archivado. Y cómo se verifica y se revoca.

**Decisión.** La constancia es un `GeneratedDocument`, emitido por el mismo motor que un acta (ADR-0100): folio de serie bajo cerrojo, huella `sha256`, archivo HTML autocontenido e inmutable, y `variablesSnapshot` con los valores exactos con los que se compuso. **No se compone al abrirla** —eso cambiaría cuando cambiaran los datos del evento—; se emite una vez, a quien asistió, y se archiva. Para no clonar la emisión en el módulo de eventos, `issueDocument` se partió en dos: `emitirDocumento`, el núcleo que compone y guarda sin comprobar `documents.document.issue`, y `issueDocument`, que pone ese permiso antes de llamarlo. La constancia va con su propia facultad —`events.constancy.issue`— sobre el mismo núcleo, y la emisión —folio, huella, inmutabilidad— es una sola y no diverge. El código de la plantilla se resuelve a su versión publicada al emitir, no a la fila que el evento fijó al configurarse: si desde entonces se publicó otra versión, la constancia sale con la vigente. Las variables de la plantilla se llenan con los datos del evento y de la persona; si la plantilla pide un dato que el evento no provee, no se emite —una constancia con un hueco no prueba nada—.

La constancia es **verificable** por una ruta pública (`/constancias/:codigo`) que la reconoce por su `publicId` de 22 caracteres impreso en ella —la llave es el código, que quien la presenta comparte a propósito— y responde qué evento certifica, a nombre de quién y si sigue vigente, y nada más. Y es **revocable**: revocar exige motivo (`events.constancy.revoke`, crítico), deja la marca `constancyRevokedAt` en la inscripción —no borra la fila (ADR-0155)— y cancela el documento emitido. La verificación lee la revocación **en vivo** de la inscripción, no de una copia: una constancia revocada hace un minuto aparece revocada ahora. El `CHECK` del bloque A impide revocar una que nunca se emitió. El control `C-F9-02` vigila que la verificación derive su estado de la revocación en vivo: una constancia revocada que verificara como válida sería el peor fallo, porque parece funcionar.

## ADR-0167 · El material reservado de un evento se sirve por la inscripción, con su propio contexto de archivo

**Contexto.** El bloque G añade materiales a los eventos (PRD §16.3): una lectura, una presentación, una guía. El PRD exige que un material reservado **no se sirva a quien no está inscrito**. La política general de archivos (Fase 1) decide el acceso por el catálogo de permisos, y no sabe expresar «inscrito a este evento»: un agremiado inscrito a un curso no tiene `files.file.download`, y dárselo le abriría todos los archivos de su entidad.

**Decisión.** El material de un evento cuelga de un contexto de archivo propio, `EVENT` —un valor nuevo del enumerado `FileContextKind`, no una tabla nueva—, y su descarga tiene su propia puerta dentro del servicio de archivos: para un archivo con contexto `EVENT`, la autorización no mira el catálogo de permisos, sino el material y la inscripción. Un material abierto lo alcanza cualquiera; uno reservado, solo quien tiene una inscripción viva —o quien gestiona el evento o lee sus inscripciones—. La puerta reevalúa la política al canjear el pase, igual que el resto de las descargas, así que un enlace copiado deja de servir en cuanto la inscripción se cancela. Como en todo el servicio, un archivo fuera de alcance responde lo mismo que uno inexistente. La clasificación la dicta el material: reservado es interno y su pase dura poco; abierto es público. El listado de la vista filtra además lo reservado a quien no está inscrito, para no ofrecer lo que no se va a servir; pero la garantía vive en la descarga, no en la vista. Se probó rompiendo la puerta —permitiendo el material reservado a cualquiera— y viendo la prueba caer en rojo.

## ADR-0168 · El tablero de gestión es una cola de decisiones, no un panel de métricas, y es el mismo para todos los roles

**Contexto.** El bloque H construye los tableros por rol (PRD §5.5, §6.3, §6.4). El criterio 6 de la fase es explícito: «los paneles muestran decisiones accionables, no métricas decorativas». Había que decidir qué muestra el tablero de gestión y cómo se acota a cada rol sin mantener una lista por rol que se desincronice.

**Decisión.** El tablero de gestión (`/gestion`) abre con **colas de trabajo**, no con contadores. Cada fila es algo que espera una decisión —solicitudes de afiliación por revisar, mensajes sin atender, pagos manuales por confirmar, devoluciones por resolver, cortes de conciliación por cerrar— con su cuenta y un enlace a donde se atiende. Una cola vacía no aparece; si no hay ninguna, la pantalla lo dice, como ya hace la agenda personal de la persona (`personal-agenda.ts`, criterio 6 del lado del portal). No hay contadores sueltos: una tarjeta con un número y sin enlace es la métrica decorativa que el criterio prohíbe.

**El tablero es uno solo, y se adapta por permiso, no por rol.** No hay un panel de la Secretaría y otro de la delegación territorial. Cada cola pregunta a su módulo por su interfaz pública (`applicationQueue`, `requestList`, `pendingManualPayments`, `refundQueue`, `reconciliationList`), y cada uno de esos casos de uso evalúa el permiso y acota al alcance de quien mira. A quien no alcanza una cola, esa cola ni se le cuenta: el caso de uso de origen responde «prohibido» y el tablero la omite en silencio. Así la delegación ve lo de su entidad y la Secretaría lo de toda la organización, con el mismo código y sin una lista por rol que mantener. El tablero vive en su propio módulo, `dashboards`, porque compone lo de varios y no pertenece a ninguno.

**Se probó rompiendo la garantía:** se le quitó a una cola el guardián que la omite cuando está vacía y se vio salir una tarjeta con un cero; la prueba de integración cayó en rojo. El control `C-F9-03` la vigila estáticamente: toda tarea lleva enlace y ninguna cola vacía aparece.

## ADR-0169 · El umbral de privacidad de los indicadores es uno solo, en la capa compartida, y las cuentas territoriales de personas pasan por él

**Contexto.** El bloque I construye los indicadores territoriales de formación (PRD §6.3, §24 Fase 9 criterio 3: «los indicadores sensibles usan agregación y umbrales de privacidad»). La Fase 6 ya había resuelto esto para los casos, con un umbral de privacidad y la supresión de las celdas por debajo, pero esa disciplina vivía dentro del módulo de casos (`cases/domain/indicators.ts`). Había que decidir si el indicador territorial copiaba la disciplina o la compartía.

**Decisión.** El umbral de privacidad —`UMBRAL_DE_PRIVACIDAD`, `aplicarUmbral`, `Celda`— sube a la capa compartida, `@/platform/privacy/threshold`, y el módulo de casos lo re-exporta para no romper a quien ya lo importaba. **La disciplina es una sola:** los indicadores de casos y los territoriales publican con el mismo umbral, y tener dos definiciones sería tener dos privacidades, una de las cuales alguien bajaría sin querer. El control `C-F9-04` lo vigila: el umbral se define **exactamente una vez** en todo el código.

El indicador territorial de formación cuenta, por unidad y su subárbol (por prefijo de ruta materializada, ADR-0027) y en un periodo: los eventos realizados, las personas que asistieron y las constancias vigentes. **Las cuentas de personas pasan por el umbral y, por debajo de él, se suprimen enteras:** en una sección pequeña, tres asistentes a un taller señalan a quiénes con más precisión que una lista. El número de eventos, en cambio, no señala a nadie —un evento es un acto público, no una persona— y se publica en crudo. Se probó rompiendo la garantía: se le quitó el umbral a la cuenta de asistentes y se vio salir un tres que debía estar suprimido, en rojo. Vive en el módulo `dashboards`, junto al tablero, y se muestra en el panel territorial.

## ADR-0170 · La transparencia pública publica agregados con el umbral de privacidad, y las exportaciones quedan auditadas

**Contexto.** El bloque J cierra «reportes institucionales, exportaciones auditadas y transparencia publicada» (PRD §6.1, §6.4, §24 Fase 9 criterio 4). Las exportaciones que respetan permisos y quedan auditadas ya existían de fases anteriores —padrón (`ROSTER_EXPORTED`), directorio (`DIRECTORY_EXPORTED`), libro financiero (`FINANCIAL_REPORT_EXPORTED`)—; lo que faltaba era la página de transparencia pública que el §6.1 nombra y que ninguna pantalla servía.

**Decisión.** La transparencia pública (`/transparencia`, sin sesión) publica **cifras de la organización, no de las personas**: cuántas la integran, cuánta vida institucional tiene, cuánta formación imparte. Los hechos institucionales —agremiados activos, unidades territoriales, asambleas con quórum, eventos realizados— se publican en crudo: un número de agremiados no señala a nadie. Pero las cuentas de **participación** de personas —quiénes se formaron, cuántas constancias vigentes— pasan por el mismo umbral de privacidad compartido (ADR-0169) y, por debajo de él, se suprimen: si en la organización entera solo dos personas asistieron a formación, publicar el dos empieza a señalar a quiénes. De la transparencia **no sale ningún identificador**: ni nombres, ni folios, ni identificadores públicos; solo cuentas. No hizo falta una entidad nueva —el contrato de fases no la admite—: la transparencia se calcula en vivo de los agregados que ya existen.

El control nuevo `C-F9-05` vigila que la transparencia solo cuente (nada de `select` de nombres, folios ni identificadores) y pase sus cuentas de personas por el umbral; se probó rompiéndolo —quitándole el umbral a la cuenta de personas formadas— y viéndolo caer en rojo. El control `C-F9-06` mantiene el criterio 4: las tres exportaciones que ya existían siguen registrándose en la bitácora, porque una exportación sin rastro no cumple el criterio.

## ADR-0171 · Las alertas de vencimiento entran al centro de notificaciones, una sola vez, sin registro aparte

**Contexto.** El bloque K construye las «alertas de vencimientos y obligaciones» (PRD §24 Fase 9). Ya existían los trabajos que **dan de baja** al vencer (`membership-expiry`, `role-expiry`); faltaba **avisar antes**. Había que decidir cómo se avisa, cómo no se repite y a quién.

**Decisión.** Un trabajo programado nuevo (`expiry-alerts`, diario) busca lo que se acerca a vencer —membresías activas con `expiresAt` dentro de treinta días, nombramientos con `endsOn` dentro de treinta días— y crea un aviso en el **centro de notificaciones** de cada persona (bloque B), con su categoría —`MEMBERSHIP`, `APPOINTMENT`— y su enlace a donde se renueva. Entra al centro, no al correo: el correo de difusión es de las campañas, y un vencimiento propio no es difusión. La preferencia se respeta sola: el centro ya filtra por la preferencia de la persona, así que quien silenció esa categoría no lo ve; y no es una clase obligatoria de gobierno, así que se puede silenciar.

**No se repite, y sin llevar registro aparte.** Correr el trabajo cada día no debe llenar el buzón con el mismo aviso. La idempotencia se sostiene en el **propio aviso**: lleva `relatedKind` y `relatedId` —qué vence y cuál—, y antes de crear uno se comprueba que no exista ya. La segunda pasada no crea nada. No hizo falta una tabla que recuerde qué se avisó —que además el contrato de fases no admitiría—: el aviso es su propia marca. El control `C-F9-07` lo vigila; se probó rompiéndolo —quitando la comprobación— y viendo la segunda pasada duplicar, en rojo.

**Las obligaciones ante autoridad, en el tablero.** Una `ComplianceObligation` es de la entidad, no de una persona, así que no cabe como aviso personal. Se suma en cambio como una cola del tablero de gestión (ADR-0168): las obligaciones sin entregar, vencidas o por vencer, con su enlace a `/institucional/cumplimiento`. Quien puede leerlas las ve; quien no, no.

## ADR-0172 · La notificación web se entrega con el estándar (VAPID/RFC 8291), como un puerto, y solo a quien la autorizó explícitamente

**Contexto.** El bloque D construye «notificaciones web con autorización explícita» (PRD §16.2, §24 Fase 9). El centro (bloque B) es un derecho de la cuenta y el correo (bloque C) lo dio la persona al registrarse; la web es distinta: el navegador solo entrega avisos si la persona **se suscribe explícitamente**, en el dispositivo, con un permiso que solo ella concede. Había que decidir cómo se envía, dónde se guarda la suscripción sin abrir una entidad nueva —el contrato de fases (C-COH-03) no admite otro modelo—, y cómo se garantiza que la web no llegue a quien no la pidió.

**Decisión: el estándar, no un SDK.** El envío web es el del estándar abierto: un mensaje cifrado extremo a extremo hacia el endpoint que el propio navegador entregó al suscribirse (RFC 8291, codificación `aes128gcm`), firmado ante el servicio de push con VAPID (RFC 8292, JWT ES256). No entra ningún tercero: el servidor cifra con `node:crypto` (ECDH P-256, HKDF-SHA256, AES-128-GCM) y hace `POST` al endpoint. Se envuelve en un **puerto** con adaptadores intercambiables —igual que el correo y el cobro (ADR-0137)—: `vapid` cuando hay claves, `console` en desarrollo sin claves, `unavailable` en producción sin claves, y un puerto falso para las pruebas. La clave privada VAPID **firma cada envío y vive en el entorno, nunca en la base** (regla del repositorio); la pública y el asunto son configuración. Como el correo, el canal se **degrada con claridad**: sin claves, la pantalla lo dice en vez de ofrecer un botón muerto, y la salud reporta la capacidad del adaptador vigente.

**La suscripción, en la persona, no en una tabla nueva.** El material que el navegador entrega —endpoint y claves públicas— se guarda en una columna `webPushSubscriptions` (Json) de la propia `Person`: es material público del navegador, una autorización por dispositivo, y volver a suscribir el mismo endpoint reemplaza en vez de duplicar. Una tabla `PushSubscription` habría sido un modelo nuevo que el contrato de fases prohíbe; una columna escalar sobre una entidad existente sí se admite.

**La puerta de la autorización explícita.** La garantía que distingue este canal: `deliverWebPushForNotification` **nunca llama al servicio de push sin una suscripción guardada**. Si la persona no tiene ninguna, registra un intento `SUPPRESSED` y sale antes de tomar el puerto; si la tiene, respeta además su preferencia por el canal web —una clase silenciada no sale, salvo la obligatoria de gobierno, que no se puede apagar—; y un endpoint que el navegador ya retiró (404/410) se olvida. El control `C-F9-08` vigila la puerta —que el puerto no se tome antes de comprobar la suscripción— y exige la prueba con puerto falso; se probó rompiéndolo —quitando el corte de «sin suscripción»— y viendo caer en rojo tanto el control como la prueba, que comprueba que sin suscripción el puerto no se llama ni una vez. El aviso de vencimiento (ADR-0171) ya sale por los dos canales: entra al centro y, si la persona lo autorizó, se encola su entrega web.

## ADR-0173 · La suite completa es puerta de cierre, no de cada cambio

**Contexto.** La norma pedía, literalmente, «todo verde» antes de cerrar cualquier cosa, y en la práctica se estaba leyendo como correr la suite entera —controles de fase, lint, tipos, Vitest, build, Playwright, `db:check`— tras cada cambio intermedio. Con el proyecto ya en Fase 10 y la suite crecida, eso alarga cada iteración sin aportar señal nueva: la integración continua ya corre la puerta entera sobre cada commit.

**Decisión.** Se distingue el trabajo iterativo del cierre. Mientras se construye, se corren **solo las pruebas que ejercen lo que se toca** —el archivo, el módulo o el control afectado—. La **puerta completa** (PRD §23.2) se reserva para **cerrar** un bloque o una fase, y la integración continua es quien la corre entera y la da por buena sobre el commit de cierre. No cambia qué exige la puerta de cierre ni que la CI tenga que estar en verde para dar algo por cerrado: cambia que no se reejecuta todo tras cada guardado intermedio. La norma queda en `AGENTS.md` («El método» y «Antes de cerrar un bloque o una fase») y en `docs/HANDOFF.md` §4. A petición de la persona usuaria.

## ADR-0174 · El Superadmin raíz tiene acceso total (revierte ADR-0026)

**Contexto.** El diseño original (ADR-0026, PRD §4.4, docs/PERMISSIONS.md §5.1) acotaba deliberadamente al Superadmin raíz: una lista cerrada de concesión (`SUPERADMIN_GRANTED`), el conjunto de compartimentos vacío, y una negación de lectura masiva de datos personales. La intención era que la cuenta de arranque y soporte no alcanzara la información social ni disciplinaria de las personas. La persona usuaria, dueña de la plataforma, pidió de forma expresa y reiterada lo contrario: que el superadmin **tenga acceso a todo, incluidas todas las pantallas**.

**Decisión.** El actor raíz recibe **acceso total**. En el motor de decisión (`src/platform/authz/policy.ts`) su concesión pasa de `SUPERADMIN_GRANTED` a `ALL_PERMISSION_CODES` —todos los códigos del catálogo—, con alcance de todas las entidades, territorios y organizaciones; al resolver su contexto (`actor-resolver.ts`) se le conceden los tres compartimentos (`UNION`, `SOCIAL`, `DISCIPLINARY`); las comprobaciones 4 (asignación viva) y 7 (motivo escrito) lo eximen explícitamente; y se retira la negación de lectura masiva. La máscara de campos deja de aplicársele: ve la persona completa. Se conserva la **regla estructural** que protege el control C-COH-04: no hay vía rápida —la raíz recorre las siete comprobaciones y las pasa, con una sola concesión al final—. Los guardias de pantalla de las áreas de administración (`/gestion`, `/institucional`, `/casos`, `/territorio/[unidad]`), que exigían `userId` y por tanto excluían a la raíz (que no tiene cuenta), ahora la admiten.

**Consecuencias.** Es una **reducción deliberada de una salvaguarda de privacidad**: una sola credencial de entorno puede leer y actuar sobre todo, incluidos los datos disciplinarios y sociales de todas las personas. Se acepta por decisión de la persona usuaria. Se mitiga con lo que se conserva: sesión raíz firmada, de duración limitada y revocable (rotando `SUPERADMIN_SESSION_VERSION`), límite de intentos, y auditoría de cada acción. Las pruebas negativas 9 y 11 de docs/PERMISSIONS.md §9 (superadmin acotado / sin lectura masiva) se retiran del control C-F1-05 por dejar de formar parte del contrato; la negativa 10 (compartimentos) se conserva para los actores PERSONA. Las pruebas `tests/unit/authz/superadmin.test.ts` y la sección correspondiente de `tests/integration/superadmin.test.ts` se reescriben para afirmar el acceso total, con el método de romper: caen en rojo si se revierte.

## ADR-0175 · La contraseña del Superadmin raíz es texto plano en el entorno (revierte el hash de ADR-0026)

**Contexto.** El acceso raíz se autenticaba con un hash Argon2id en `SUPERADMIN_PASSWORD_HASH`: la contraseña original nunca se almacenaba y se generaba el hash con `npm run auth:hash-password`. La fricción de generar el hash, escaparlo en el archivo (`$argon2id` se expandía y llegaba mutilado) y pegarlo en el panel dejó a la persona usuaria sin poder entrar. Pidió de forma expresa cambiarlo por una contraseña en texto plano por variable de entorno.

**Decisión.** La variable pasa a llamarse `SUPERADMIN_PASSWORD` y guarda la contraseña **en texto plano**, en el entorno. `verifyRootCredentials` la compara directamente en tiempo constante (`safeEquals`), sin hash; deja de ser asíncrona. Se retira el uso de `verifyPassword` para la raíz. La variable se renombra en su fuente de contrato (`scripts/phase/prd-contract.json`), el esquema (`env.ts`), `.env.example`, `docs/ENVIRONMENT.md`, la CI (que ya no calcula un hash de prueba) y las pruebas (unidad e integración). `scripts/auth/hash-password.ts` deja de usarse para la raíz.

**Consecuencias.** Es una **reducción deliberada de seguridad**: una contraseña en texto plano es menos defensa en profundidad que un hash —aunque, como el resto de los secretos, vive solo en el entorno y nunca en la base ni el repositorio—. Se acepta por decisión de la persona usuaria y por su beneficio operativo directo: poder entrar sin la fricción del hash. Se conserva lo que protegía el acceso: sesión raíz firmada, de duración limitada y revocable subiendo `SUPERADMIN_SESSION_VERSION`, límite de intentos, comparación en tiempo constante y auditoría de cada inicio de sesión. La rotación de la credencial ahora es cambiar `SUPERADMIN_PASSWORD` y subir `SUPERADMIN_SESSION_VERSION`.

## ADR-0176 · La sesión del Superadmin raíz es de larga duración (revierte la sesión corta de PRD §4.4)

**Contexto.** La sesión raíz duraba una hora (`SUPERADMIN_SESSION_TTL_MS = 60*60*1000`), corta a propósito como defensa. La persona usuaria, dueña de la plataforma, pidió que su acceso no caduque solo.

**Decisión.** `SUPERADMIN_SESSION_TTL_MS` pasa a diez años: prácticamente sin límite. La sesión deja de caducar por tiempo; su corte inmediato sigue siendo la revocación subiendo `SUPERADMIN_SESSION_VERSION` (que invalida al instante toda sesión raíz abierta) y el cierre de sesión explícito. Se actualiza la prueba de `tests/integration/superadmin.test.ts` y el PRD §4.4.

**Consecuencias.** Es una reducción deliberada de seguridad: una cookie de sesión raíz robada sirve por mucho más tiempo. Se acepta por decisión de la persona usuaria. Se conserva lo que la contiene: cookie `HttpOnly`, `Secure` y `SameSite=strict`, revocación inmediata por versión, y auditoría de cada acceso.

## ADR-0177 · Se retira la integración continua (`.github/workflows/calidad.yml`)

**Contexto.** El flujo `Calidad` corría la puerta completa (fase, lint, tipos, unidad, integración, build, extremo a extremo) en cada push. Era andamiaje del **desarrollo** de la plataforma. Terminado ese desarrollo, la persona usuaria pidió retirarlo.

**Decisión.** Se elimina `.github/workflows/calidad.yml`. Los controles de `scripts/phase/verify.mjs` que cotejaban ese flujo (C-F1-06, el de perfiles de Playwright y C-COH-14) dejan de exigir su existencia: tratan su ausencia como una decisión legítima, no como un defecto. La puerta local (`npm run phase:verify`, `lint`, `typecheck`, pruebas, `build`) sigue disponible para quien quiera correrla a mano.

**Consecuencias.** Ya no hay verificación automática en cada push: la calidad de un cambio depende de correr la puerta local antes de subir. Se acepta por decisión de la persona usuaria, con el desarrollo de la plataforma dado por concluido.

## ADR-0178 · La activación por correo se suspende temporalmente y el enlace de contraseña se entrega en el panel

**Contexto.** Durante la puesta en marcha, la dependencia del correo impedía utilizar las cuentas ya creadas y bloqueaba la integración de los primeros órganos del sindicato. Marcar una cuenta como activa no basta si nunca pudo establecer una contraseña; inventarle una contraseña desde administración revelaría una credencial que solo debe conocer su titular.

**Decisión.** Las cuentas nuevas nacen en estado `ACTIVE`, sin afirmar falsamente que el buzón haya sido verificado (`emailVerifiedAt` permanece vacío), pero siguen sin poder iniciar sesión mientras no tengan una credencial `PASSWORD`. El testigo de un solo uso para establecerla se muestra a quien administra las cuentas y puede regenerarse desde `/gestion/personas`; al regenerarlo se invalidan todos los anteriores. La migración `20260912170000_activar_cuentas_sin_correo` habilita las cuentas `INVITED` existentes, limpia bloqueos accidentales y conserva la misma exigencia: sin contraseña no hay sesión. `ACCOUNT_ACTIVATION_DELIVERY=panel` gobierna este periodo transitorio; cambiarla a `email` restablece el envío sin modificar el código.

**Consecuencias.** Se elimina temporalmente la comprobación de posesión del buzón de correo. Se conserva la contraseña Argon2id, el testigo opaco de un solo uso, su vigencia de siete días, la invalidación de enlaces anteriores, el límite de intentos y la auditoría. El enlace mostrado en el panel debe entregarse únicamente a su titular.

## ADR-0179 · Cada delegación y sección tiene autoridad propia y el territorio del cargo no se elige al nombrar

**Contexto.** La estructura ya podía guardar unidades, órganos y periodos, pero el despliegue territorial quedaba repartido entre tres pantallas genéricas. Además, al nombrar se podía elegir manualmente una unidad distinta de la del órgano territorial, lo que habría concedido acceso fuera de la delegación o sección que justificaba el cargo.

**Decisión.** La puesta en marcha enlaza un flujo explícito de cuatro actos: constituir y activar la unidad mediante resolución aprobada; instalar en ella un órgano `SECTION_DELEGATION`; definir su cargo `SECTION_DELEGATE`, que concede `TERRITORIAL_DELEGATE`; y nombrar a una persona agremiada activa. El caso de uso, no el formulario, deriva el alcance desde la unidad a la que pertenece el órgano. Si el cliente envía otra unidad, el acto se rechaza; si la omite, se aplica obligatoriamente la correcta. Una unidad territorial inactiva, disuelta o de otro tipo no puede recibir ese órgano, y no puede tener dos autoridades territoriales vivas.

**Consecuencias.** Las delegaciones y secciones pueden implementarse desde la plataforma sin asignaciones manuales de roles. El periodo, el acceso territorial y la bitácora nacen juntos; el acceso incluye las unidades descendientes y termina con el cargo. Las entidades federativas de la semilla siguen siendo solo referencias: no se publican como presencia real mientras no exista una unidad constituida por acuerdo.

## ADR-0180 · El formulario público abre el expediente formal de afiliación

**Contexto.** El formulario público recababa CURP, ocupación, categoría y promotor, pero convertía todo en un mensaje `GENERAL_CONTACT`. El folio aparecía en Mensajes y luego exigía volver a capturar la información para crear la solicitud formal. Eso rompía la expectativa de la pantalla y duplicaba el trabajo administrativo.

**Decisión.** Las vías de agremiado y agremiado honorario crean directamente una `MembershipApplication` en estado `SUBMITTED`, con folio institucional y resumen inmutable. La persona se identifica por CURP única; si ya tiene cuenta con el mismo correo se reutiliza su registro maestro, y si los identificadores contradicen otro expediente se detiene el alta. Se conserva como dato estructurado la ocupación libre, el territorio declarado y la referencia del promotor. El formulario pregunta la pertenencia a otro sindicato y registra la versión de estatutos y del aviso de privacidad aceptadas mediante un consentimiento `MEMBERSHIP`. El origen queda seudonimizado y limitado por hora. La categoría de beneficiario protegido no se fuerza dentro de `MembershipApplication`: se registra en `ProtectedBeneficiary`, porque no es membresía, no concede voz ni voto y nunca genera cuota.

**Consecuencias.** Una solicitud pública aparece inmediatamente en `/gestion/afiliacion/solicitudes` y puede recorrer la revisión y resolución existentes; no vuelve a entrar en Mensajes. Los registros protegidos aparecen en `/gestion/afiliacion/beneficiarios`. La solicitud histórica que ya se recibió como mensaje conserva su folio y su trazabilidad; los envíos posteriores usan el flujo corregido.

## ADR-0179 · Cada delegación y sección tiene autoridad propia y el territorio del cargo no se elige al nombrar

**Contexto.** La estructura ya podía guardar unidades, órganos y periodos, pero el despliegue territorial quedaba repartido entre tres pantallas genéricas. Además, al nombrar se podía elegir manualmente una unidad distinta de la del órgano territorial, lo que habría concedido acceso fuera de la delegación o sección que justificaba el cargo.

**Decisión.** La puesta en marcha enlaza un flujo explícito de cuatro actos: constituir y activar la unidad mediante resolución aprobada; instalar en ella un órgano `SECTION_DELEGATION`; definir su cargo `SECTION_DELEGATE`, que concede `TERRITORIAL_DELEGATE`; y nombrar a una persona agremiada activa. El caso de uso, no el formulario, deriva el alcance desde la unidad a la que pertenece el órgano. Si el cliente envía otra unidad, el acto se rechaza; si la omite, se aplica obligatoriamente la correcta. Una unidad territorial inactiva, disuelta o de otro tipo no puede recibir ese órgano, y no puede tener dos autoridades territoriales vivas.

**Consecuencias.** Las delegaciones y secciones pueden implementarse desde la plataforma sin asignaciones manuales de roles. El periodo, el acceso territorial y la bitácora nacen juntos; el acceso incluye las unidades descendientes y termina con el cargo. Las entidades federativas de la semilla siguen siendo solo referencias: no se publican como presencia real mientras no exista una unidad constituida por acuerdo.

---

## ADR-0181 · El contrato del PRD se cierra: la plataforma está en producción y el documento deja de ser aplicable

**Contexto.** El PRD encargó una plataforma y la repartió en once fases con un protocolo estricto (§23): construir solo la fase activa, terminarla al cien por ciento, cerrarla con informe y **detenerse** a esperar autorización expresa antes de seguir. Ese protocolo cumplió su función —llevó el proyecto de un repositorio vacío a un producto operando— y las once fases se completaron y aprobaron. La plataforma está desplegada y en producción.

**Decisión.** El contrato queda **cerrado** el 17 de septiembre de 2026, con punto de control `26359f8`. **El PRD deja de ser aplicable y no impone nada.**

Lo que deja de regir, por decisión expresa de la persona usuaria:

- el protocolo de fases del §23 —no hay fase activa, ni informe de cierre, ni autorización que esperar—;
- el alcance del §24 como límite de lo que puede construirse;
- las prohibiciones y reglas transversales de los §0 y §25 como obligaciones.

A partir de aquí, el trabajo se decide por las necesidades de la organización. **Las garantías del producto se modifican cuando haga falta modificarlas**, y la conversación sobre cada una es técnica, no contractual: si conviene cambiar una regla de permisos, un límite o una restricción de la base, se cambia y se razona aquí.

**Nada se borra.** El PRD, `docs/PHASE_STATUS.md` con su archivo fase por fase, `docs/BACKLOG.md` y `docs/HANDOFF.md` se conservan **íntegros, como registro**. Cada uno lleva ahora un aviso de cierre al principio que dice que describe un régimen terminado. El motivo de conservarlos es práctico y no ceremonial: son la respuesta a «¿por qué esto es así?», y esa pregunta se hace más después de producción que antes. Recortar el historial para que cuente una versión más cómoda del pasado habría sido el error contrario.

**Qué sobrevive, y por qué no es una excepción al cierre.** Tres cosas siguen en el repositorio y ninguna depende del PRD:

- **`docs/DECISIONS.md` sigue vivo.** Es el único de los documentos de gobierno que no cierra: toda decisión que a alguien vaya a sorprenderle dentro de un año se escribe aquí, con su contexto y su consecuencia. Lo que antes lo exigía el PRD §0.1 ahora lo justifica solo su utilidad.
- **`npm run phase:verify` se conserva tal cual.** Sus controles dejan de ser una puerta de fase; lo que vigilan sigue importando, porque casi todos comprueban garantías del producto que hoy está en producción —el secreto del voto, la inmutabilidad de la bitácora, la separación entre entidades jurídicas, las catorce amenazas del plan de seguridad, los trece flujos de extremo a extremo—. Cuando uno estorbe porque la garantía que vigila ya no se quiere, se cambia el control y se razona el cambio; apagarlo en bloque habría sido tirar la red junto con el andamio, y más ahora que tampoco hay integración continua (ADR-0177).
- **La constante `ACTIVE_PHASE` de `src/platform/config/env.ts` no se toca.** Parece burocracia del contrato y no lo es: de ella depende **qué variables de entorno son obligatorias al arrancar**. Bajarla o quitarla dejaría de exigir las claves que producción necesita, que es exactamente el defecto `D-F4-002` y su reincidencia. Por eso `docs/PHASE_STATUS.md` conserva el número de fase declarado, aunque la fase esté cerrada.

**Consecuencia.** Se pierde el marco que obligaba a terminar una cosa antes de empezar otra y a no dejar nada a medias. Era útil mientras se construía y ya no lo es: un producto en producción se mantiene, no se construye por etapas contratadas. Lo que queda en su lugar es el criterio de quien trabaja, con el historial completo a mano para no repetir lo ya razonado.

---

## ADR-0182 · El Superadmin raíz tiene cuenta institucional, para poder responder por lo que resuelve

**Contexto.** ADR-0174 le dio al actor raíz acceso total, incluidas todas las pantallas. Pero seguía sin cuenta: `actor.userId` era nulo por diseño. Al intentar dar de alta y aceptar una solicitud de afiliación, la pantalla se pintaba entera y el botón fallaba con «Para tomar una solicitud necesitas haber iniciado sesión».

**No eran los permisos.** La raíz los tiene todos. El obstáculo es el modelo de datos: `ApplicationReview.reviewerId` y `MembershipApplication.resolvedById` apuntan a `User` y no admiten vacío. Y lo hacen con razón: un expediente que no puede decir **quién admitió a una persona** no sirve de expediente. Seis puntos de `application-review.ts` rechazaban a un actor sin cuenta, y ese actor era exactamente la raíz.

**Decisión.** La semilla crea una **cuenta institucional** para el correo de `SUPERADMIN_EMAIL` —persona «Administración Fuerza Índigo», editable desde `/gestion/personas`— y el resolvedor de actores ata la sesión raíz a ella. A partir de ahí, la raíz actúa con una identidad allí donde el sistema exige una persona y no un actor.

**No abre un segundo camino de acceso.** La cuenta nace **sin credencial**: no se puede iniciar sesión con ella por la puerta ordinaria. La raíz sigue entrando con la contraseña del entorno, por su propia ruta, con su propia cookie y su propia revocación. Una prueba lo sostiene y cae si algún día alguien le crea una credencial —debe caer: sería una contraseña más con acceso total, fuera del entorno y fuera de rotación—.

**Lo que se ganó sin buscarlo.** El nombramiento de la primera Secretaría Ejecutiva anotaba como otorgante a la **propia persona designada**, porque la columna es obligatoria y no había otra cuenta: se nombraba a sí misma. Ahora anota a la cuenta institucional, que es quien nombró de verdad.

**Lo que estuvo a punto de romperse, y cómo se evitó.** La rama de arranque de `assignRole` se reconocía por `grantedById === null`, es decir, **por que la raíz no tuviera cuenta**. Con cuenta, esa rama dejaba de entrar en silencio, y dentro de ella vive la restricción que impide nombrar una **segunda** Secretaría Ejecutiva viva. La raíz habría pasado a nombrar sin ese límite sin que nada avisara. Se corrigió reconociéndola por lo que es —`actorKind === 'ROOT_SUPERADMIN'`— y no por lo que le falta. La lección: **una condición que identifica a alguien por una carencia se rompe el día que esa carencia desaparece**, y no se rompe con un error, se rompe con silencio.

**Consecuencias.** El Superadmin aparece como una persona más en el registro, y su nombre queda en cada afiliación que resuelva. Es lo que se quería: la pregunta «¿quién admitió a esta persona?» se responde en el propio expediente. Conviene que ese nombre diga algo cierto; se edita desde `/gestion/personas`. Una instalación cuya semilla sea anterior a esto no tiene la fila: el contexto queda como estaba —acceso total, sin cuenta— y `npm run db:seed` la crea.

---

## ADR-0183 · Reenviar el acceso: una sola puerta, y la entrega que dice la configuración

**Contexto.** Una persona que se registra recibe su enlace para crear contraseña **una sola vez**, en la pantalla, porque `ACCOUNT_ACTIVATION_DELIVERY=panel` retiró la dependencia del correo durante la puesta en marcha (ADR-0178). Si cierra la pestaña, si el enlace vence a los siete días, o si nunca lo vio porque la alta la capturó la administración, se queda fuera.

**Lo que ya existía y no se veía.** La recuperación de acceso sirve para ese caso desde siempre: `completePasswordReset` crea la credencial **exista o no una previa**. Quien nunca tuvo contraseña puede usarla. El problema era de palabras: la pantalla de acceso ofrecía «Olvidé mi contraseña», y nadie que nunca haya tenido una se reconoce ahí. Se queda fuera creyendo que no hay nada para él.

**Decisión: una sola puerta.** El enlace pasa a decir «No puedo entrar» y la pantalla de recuperación explica que sirve igual para quien olvidó su contraseña que para quien nunca llegó a crearla. **No se construye un flujo aparte de reenvío.** Sería la misma tabla de testigos, el mismo límite por dirección y la misma garantía de no revelar quién tiene cuenta, duplicadas; y de dos puertas al mismo cuarto, una es siempre la que nadie mantiene.

**Y un defecto real, de paso.** `createAccountSetupLink` —regenerar el enlace desde el panel— **no consultaba `ACCOUNT_ACTIVATION_DELIVERY`**: devolvía el enlace a quien administra incluso con la entrega por correo configurada, y dejaba escrito en la bitácora `delivery: 'panel'` pasara lo que pasara. Ahora, con `email`, lo manda al buzón de la persona y **no** lo devuelve: entregar una llave por dos caminos a la vez la convierte en dos llaves, y una queda en manos de quien no es su dueña. Si el envío falla, sí lo devuelve al panel, porque el testigo anterior ya quedó invalidado y negarlo entonces dejaría a la persona sin el viejo y sin el nuevo.

**La lección, que ya es vieja aquí.** Una configuración que el código no consulta es una configuración que miente. `ACCOUNT_ACTIVATION_DELIVERY` decía «email» y este camino seguía siendo el panel, sin que nada avisara.

**Lo que esto no arregla.** Todo lo anterior entrega por correo, y **el correo todavía no se ha comprobado que salga** en producción. Mientras el adaptador activo no entregue de verdad, la puerta de autoservicio manda enlaces al vacío y el único camino sigue siendo que alguien regenere y entregue a mano. El orden es: primero que el correo salga, después `ACCOUNT_ACTIVATION_DELIVERY=email`.

## ADR-0184 · La cuenta institucional del Superadmin se autocura al resolver su sesión

**Contexto.** ADR-0182 añadió una cuenta institucional al Superadmin raíz para que los actos que exigen un `User` —revisar y resolver afiliaciones, asignar expedientes, aceptar canalizaciones, cerrar tareas y otros actos atribuidos a una persona— no fallaran con `actor.userId = null`. Sin embargo, ADR-0182 dependía de que `db:seed` hubiera creado previamente esa fila. Una instalación antigua o una base restaurada sin esa semilla seguía resolviendo una sesión raíz válida con acceso total pero sin identidad institucional, de modo que podía entrar a la pantalla y volver a fallar al ejecutar el acto.

**Decisión.** La cuenta institucional deja de ser una precondición de despliegue y pasa a ser una **garantía de tiempo de ejecución**. Cada vez que `resolveActor()` valida una sesión `ROOT_SUPERADMIN`, llama a `rootInstitutionalUserId()`. Si la cuenta existe, reutiliza su identificador. Si falta, la crea dentro de una transacción serializada con un advisory lock de PostgreSQL; reutiliza una `Person` institucional existente con el mismo correo si la hay y, si tampoco existe, crea la persona «Administración Fuerza Índigo». La cuenta nace `ACTIVE` y sin credenciales.

**No cambia la autenticación.** Esta autocuración no crea `Credential`, no permite inicio de sesión ordinario y no vincula el `Actor` raíz a la cuenta. La raíz sigue autenticándose exclusivamente con `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD`, usando su sesión y cookie propias. La cuenta institucional existe solo para satisfacer relaciones de atribución que apuntan a `User`.

**Concurrencia.** Dos peticiones raíz simultáneas sobre una instalación sin la cuenta no pueden crear dos personas o competir por el correo único: la creación queda serializada dentro de la transacción. Después del cerrojo se vuelve a consultar la cuenta antes de crear nada.

**Consecuencias.** La limitación final de ADR-0182 —«una instalación cuya semilla sea anterior queda sin cuenta hasta ejecutar `db:seed`»— deja de aplicar. La semilla sigue creando la cuenta de forma idempotente, pero ya no es necesaria para que el Superadmin pueda operar. Las pruebas de integración eliminan la cuenta institucional y comprueban que `resolveActor()` la recrea, devuelve su `userId`, conserva la misma persona cuando existe y mantiene cero credenciales ordinarias.

## ADR-0185 · El Superadmin usa un Centro de Control que compone las rutas reales de la plataforma

**Contexto.** El Superadmin ya tenía acceso total, pero su navegación seguía siendo una barra horizontal con unas cuantas entradas generales. Eso obligaba a entrar primero a Gestión, Institucional o Casos para localizar una función concreta y permitía que el panel raíz quedara incompleto aunque las facultades existieran.

**Decisión.** `/superadmin` pasa a ser el Centro de Control de toda la plataforma. Su navegación se agrupa por función —Centro de control, Personas, Afiliación, Organización, Institucional, Casos y acompañamiento, Comunicaciones, Contenidos, Finanzas, Inteligencia artificial y Control— y enlaza las superficies reales de Gestión, Institucional y Casos. No se clonan esas rutas: `app/superadmin/navigation.ts` las compone desde `secciones.ts` de cada área y añade únicamente las pantallas propias del Superadmin.

**Búsqueda.** El Centro de Control incorpora una búsqueda rápida “Ir a…” sobre el mismo índice. No consulta la base ni inventa otra fuente de navegación: filtra en cliente las rutas ya declaradas.

**Responsive.** En escritorio la navegación vive en un sidebar desplazable y persistente; en pantallas pequeñas se presenta mediante un bloque expandible accesible. La portada conserva el estado técnico, métricas y salud del sistema, pero añade accesos rápidos y el mapa completo de la plataforma.

**Garantía de cobertura.** Una prueba unitaria compara el índice del Superadmin con todas las rutas declaradas por Gestión, Institucional y Casos. Si en el futuro se añade una sección operativa y se olvida incorporarla al Centro de Control, la prueba falla.

**Consecuencias.** La raíz deja de tener un “panel paralelo” reducido: el Centro de Control es la puerta de entrada a las mismas áreas operativas de la aplicación. El acceso sigue protegido por los casos de uso y por la política; la navegación solo hace visible y alcanzable lo que ADR-0174 ya concedía.

## ADR-0186 · Persona 360 y Ver como preservan al Superadmin como actor real

**Contexto.** Con las Fases 1 a 4, la raíz ya tenía acceso total, casos globales, identidad institucional garantizada y un Centro de Control completo. Faltaba una forma de revisar la experiencia y el expediente integral de una persona sin saltar manualmente entre Registro, Afiliación, Credenciales, Pagos, Casos y Auditoría.

**Decisión.** Se crea `Persona 360` como una consulta administrativa propia del módulo `admin`. La ruta `/superadmin/personas/[persona]` utiliza el identificador público opaco de la persona y reúne, en una sola vista, identidad y contacto, cuenta y sesiones, roles, solicitudes, membresías, beneficiarios, credenciales, preferencias de directorio, consentimientos, pagos, notificaciones, casos, documentos, firmas y auditoría relacionada.

**Índice universal.** `/superadmin/personas` deja de limitarse a cuentas de usuario: lista el registro maestro completo, incluidas personas sin cuenta digital. De esta forma, Persona 360 es accesible para cualquier persona registrada y no solo para quienes pueden iniciar sesión.

**Ver como.** El botón “Ver como esta persona” activa una vista administrativa de solo lectura mediante `?modo=ver-como`. No crea una sesión de la persona, no cambia `actorKind`, no sustituye `userId` ni `personId` del root y no ejecuta acciones en nombre de la persona. Solo recompone, desde datos ya autorizados para la raíz, una vista semejante a la experiencia personal para comprobar qué información encontraría.

**Auditoría.** Tanto la apertura 360 como “Ver como” dejan un asiento `system.superadmin.action` con `onBehalfOfPersonId` y un metadato que distingue `person_360_read` de `person_view_as_readonly`. La atribución del acto sigue siendo el actor raíz.

**Consecuencias.** El Superadmin puede revisar de extremo a extremo la situación de cualquier persona sin perder trazabilidad ni adoptar derechos personales, sindicales o electorales de esa persona. Si en el futuro se construye un verdadero “Actuar como”, deberá ser una capacidad separada, explícita y auditada; esta decisión no la implementa.


## ADR-0187 · Activación de cobros y catálogo con importe cero

**Contexto.** Stripe ya está configurado. Faltaban la periodicidad al crear precios recurrentes inline, la lectura de eventos Basil/Clover y la activación inmediata de afiliaciones pagadas. La primera factura de una suscripción creaba un movimiento separado de la intención vinculada a la solicitud.

**Decisión.** El puerto HTTP envía la periodicidad del precio del catálogo, también cuando una beca o descuento obliga a usar `price_data`. Los webhooks admiten referencias históricas y actuales de facturas y periodos de suscripción. La primera factura confirma la intención original cuando coincide su importe y moneda; su identificador se conserva en `InvoiceReference`, sin alterar columnas financieras inmutables. La factura se procesa bajo un cerrojo transaccional para evitar ingresos duplicados.

**Activación.** Después de confirmar un pago se entregan sus propios eventos de la bandeja de salida, con el cron existente como recuperación. Checkout reintenta los eventos adelantados de su misma cuenta y suscripción. Vincular un pago ya confirmado, incluido un precio de catálogo `0.00`, activa la solicitud aprobada sin esperar al despacho diario. La vinculación y la activación verifican persona, entidad y concepto; la activación concurrente se serializa. La acción de cuota obtiene el producto de la solicitud, no del campo enviado por el navegador.

**Configuración comercial.** Los importes, becas, descuentos y excepciones siguen administrándose en la aplicación. No se codifican cuotas ni exenciones por categoría de persona. Un precio `0.00` usa el recorrido de exención existente, sin tarjeta, sesión de Stripe ni suscripción bancaria. No se modifican secretos, precios de producción, semillas ni migraciones existentes.

**Validación.** Pruebas del formulario HTTP de Stripe, de webhooks actuales, de primer cobro sin duplicados, de activación con `0.00` y de rechazo de conceptos ajenos; se ejercen además las suites existentes de cobros, eventos, membresías y bandeja de salida.


## ADR-0188 · Mapa nacional derivado de los directorios públicos

**Contexto.** La portada mostraba una ilustración territorial y las delegaciones y agremiados honorarios vivían en directorios separados. Hacía falta localizarlos en un mapa común, con contacto público, sin convertir la ubicación en una vía paralela para publicar personas o unidades que ya no fueran elegibles.

**Decisión.** El mapa usa MapLibre con teselas de OpenStreetMap y cuatro vistas: delegaciones estatales, municipales, seccionales y agremiados honorarios. `NetworkMapLocation` conserva únicamente la ubicación y el contacto adicional autorizado. Cada lectura vuelve a cruzar esa configuración con `publicDelegations()` y `publicHonoraryDirectory()`: si una delegación deja de estar activa o una membresía honoraria vence o retira su autorización, su ubicación guardada deja de publicarse automáticamente. El Superadmin administra los puntos desde `/superadmin/mapa`; la captura exige ambas coordenadas, registra autoría y deja evidencia en la bitácora.

**Presentación.** La portada y `/mapa` comparten el mismo explorador, con selector de categoría, estado, búsqueda, agrupación de puntos y fichas de contacto. Los registros públicos todavía sin coordenadas permanecen consultables en la lista y nunca heredan ni inventan una ubicación. La política de contenido admite exclusivamente el origen cartográfico configurado y trabajadores `blob:` de MapLibre.

**Validación.** Pruebas del cruce con las fuentes públicas, retiro al perder elegibilidad, autoridad del Superadmin, restricciones de coordenadas y enlaces, filtrado y auditoría. La migración se ejerció en PostgreSQL temporal con casos válidos, coordenadas incompletas, fuera de rango, categorías inválidas y autoría inexistente. Se revisaron las vistas de mapa y lista en escritorio y móvil.


## ADR-0189 · La ubicación propuesta por el honorario exige autorización previa

**Contexto.** El mapa nacional nació con captura exclusiva del Superadmin. Los agremiados honorarios conocen mejor su sede y sus medios públicos de atención, pero permitirles escribir directamente en `NetworkMapLocation` eliminaría la revisión institucional y podría sustituir de inmediato una ubicación ya validada.

**Decisión.** La persona titular o representante de una membresía honoraria vigente puede proponer su ubicación desde `Mi ficha pública`. La titularidad se deriva en servidor de la membresía activa, la ficha pública vigente y, en su caso, la organización representada; el identificador enviado por el navegador nunca basta. Cada propuesta se conserva en `NetworkMapRequest` con estado `PENDING`. Una nueva propuesta sustituye únicamente otra solicitud pendiente, no la ubicación publicada.

**Aprobación.** Solo el Superadmin puede aprobar o rechazar. Aprobar copia la instantánea propuesta a `NetworkMapLocation` y la habilita; rechazar deja intacta cualquier ubicación anterior y exige una observación visible para que el honorario pueda corregirla. La lectura pública continúa cruzándose con los directorios vigentes, de modo que aprobar coordenadas no sustituye la membresía ni el consentimiento de publicación.

**Concurrencia y evidencia.** Un índice parcial admite como máximo una solicitud pendiente por ficha. La resolución reclama el estado `PENDING` dentro de la transacción antes de publicar, y tanto solicitud como decisión quedan auditadas con actor y fecha. Las pruebas comprueban titularidad personal e institucional, ausencia de autopublicación, exclusividad del Superadmin y preservación de la ubicación anterior al rechazar.

## ADR-0190 · Una delegación puede constituirse por nombramiento directo

**Contexto.** La estructura territorial exigía siempre una resolución aprobada de asamblea. Eso hacía depender el despliegue inicial de delegaciones y seccionales de todo el ciclo de convocatoria, padrón, quórum, votación y escrutinio, aunque el acto institucional aplicable fuera un nombramiento directo.

**Decisión.** Se conservan dos vías constitutivas independientes: resolución de asamblea o nombramiento directo. El nombramiento inicial lo emite el Superadmin; después la vía ordinaria corresponde a una persona con un periodo vigente de Secretaría General en la misma entidad jurídica. El Superadmin conserva su acceso excepcional total. El permiso genérico de crear territorio no basta para atribuirse esa autoridad.

**Un solo acto.** El nombramiento crea dentro de una misma transacción la unidad activa, su órgano territorial, el cargo responsable, el periodo de la persona nombrada, su asignación territorial y el asiento `TerritorialCreationAppointment`. Si alguna pieza falla, no queda una delegación a medias. La persona nombrada debe ser agremiada activa, pertenecer a la misma entidad y conservar derechos políticos.

**Documento.** El mismo acto expide un acuerdo inmutable con folio y conserva su texto exacto. La copia firmada se adjunta después al mismo expediente privado; incorporarla no vuelve a ejecutar el nombramiento ni reemplaza el acuerdo generado.

**Jerarquía.** Una delegación estatal depende de su entidad federativa de referencia; una municipal depende de una delegación estatal; una seccional depende de una delegación estatal o municipal. Las delegaciones se guardan como `DELEGATION`; la presencia de clave municipal distingue el nivel municipal, y `SECTION` identifica la seccional.

**Publicación.** El directorio y el mapa consideran elegible una unidad activa cuando tiene resolución habilitante o nombramiento constitutivo. El mapa deriva automáticamente estatal, municipal o seccional y continúa exigiendo que el Superadmin capture y habilite las coordenadas públicas.
