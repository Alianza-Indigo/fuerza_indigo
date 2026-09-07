# Estado de fase

> Documento de seguimiento exigido por el PRD §23.1. Se actualiza durante toda la construcción. El verificador `npm run phase:verify` lee de aquí la fase activa y ejecuta los controles que le corresponden.

---
## Situación actual

- **Fase activa:** 8 — Inteligencia artificial Gemini
- **Estado:** `IN_PROGRESS`
- **Autorizada por la persona usuaria:** 6 de septiembre de 2026
- **Fecha de inicio:** 6 de septiembre de 2026
- **Fase anterior:** 7 — `APPROVED`, cerrada en `0101a2a`. Su registro íntegro se conserva en el **Archivo** al final de este documento.
- **Fase siguiente:** 9 — Eventos, formación e indicadores, **no autorizada** hasta que la persona usuaria lo indique expresamente (PRD §23.3)

---

## Alcance contratado

El PRD §24 Fase 8 contrata: servicio central de Gemini ejecutado solo en servidor; prompts administrables con versiones, estados y reversión; laboratorio de pruebas con publicación revisada; base documental con separación de fuentes por permisos; orientación, clasificación sugerida, resúmenes y documentos asistidos; costos, límites y auditoría; revisión humana; degradación cuando el proveedor no responda; y defensas ante inyección de prompt y exfiltración.

**Qué cierra esta fase.** El modelo de datos contrata desde la Fase 0 ocho entidades de IA que nunca se construyeron, y dos columnas las esperan: `SupportRequest.suggestedByAiGenerationId` —la propuesta de canalización que hoy no genera ninguna inteligencia artificial— y la búsqueda del gestor de contenidos, que es léxica porque la semántica vive aquí.

**La garantía que gobierna la fase.** **La IA no decide nada.** El PRD §15.4 enumera diez cosas que no puede decidir —admisiones, sanciones, elegibilidad, validez de un voto, conflictos, representación, diagnósticos, pagos, accesos y publicación de datos personales— y esa lista no es una recomendación para quien escriba los prompts: es una comprobación del servicio, que rechaza la ejecución antes de llamar al modelo. Y nada sale hacia el proveedor sin minimizar: lo que se envía se reduce, se redacta o se seudonimiza, y queda registrado qué se envió, con qué prompt, qué costó y quién revisó el resultado.

---

## Bloques de trabajo

| Bloque | Contenido | Estado |
|---|---|---|
| A | Esquema de IA y base documental, migración con `pgvector`, permisos y semilla | **Hecho** |
| B | Puerto del proveedor, ejecución solo en servidor, límites, costos y degradación | **Hecho** |
| C | Prompts administrables: versiones, laboratorio, publicación revisada y reversión | **Hecho** |
| D | Base documental: fuentes autorizadas, fragmentos y recuperación con permisos | **Hecho** |
| E | Minimización, redacción y seudonimización; defensas de inyección y efectos prohibidos | **Hecho** |
| F | Casos de uso asistidos y revisión humana de cada salida | **Hecho** |
| G | Pantallas de gobernanza, laboratorio y consulta de costos | **Hecho** |
| H | Pruebas, controles de fase, documentación y cierre | **Hecho** |

---

## Criterios de aceptación

Los seis del PRD §24 Fase 8, comprobados **ejecutando el sistema** y mirando después lo que quedó en la base con las credenciales de la aplicación, nunca leyendo el código (`tests/integration/fase8-criterios.test.ts`).

| # | Criterio | Estado | Cómo se comprobó |
|---|---|---|---|
| 1 | Ningún prompt crítico vive solamente en código | **Cumplido** | Sin un prompt administrado publicado, el flujo asistido degrada al camino humano —no hay texto en el código que lo supla—; publicado uno, ejecuta con la versión exacta que quedó en la base |
| 2 | Fuentes y fragmentos respetan permisos del usuario | **Cumplido** | Una fuente restringida a `membership.roster.read`: quien lo tiene recupera sus fragmentos, quien no, no —ni para que el modelo los vea y luego se descarten— |
| 3 | La salida identifica que fue generada con IA y permite corregirla | **Cumplido** | Una salida asistida deja fila con la huella (no el contenido), y la revisión `EDITED` sustituye su texto por el de la persona |
| 4 | Las acciones sensibles requieren confirmación humana | **Cumplido** | Una canalización sugerida por IA no se confirma sin una revisión aceptada; tras aceptarla, se confirma |
| 5 | La aplicación continúa operando si Gemini está caído | **Cumplido** | Con el proveedor apagado, la salud dice `DEGRADED` y el flujo asistido devuelve degradación sin lanzar ni dejar fila nueva |
| 6 | Los costos y errores pueden consultarse por módulo sin exponer contenido sensible | **Cumplido** | La contraloría (`ai.usage.read`, sin `ai.generation.read`) ve el consumo por módulo y en el reporte no aparece el contenido generado; y no puede configurar el proveedor |

---

## Lo que dejó el bloque A

Nueve tablas, una migración verificada por los dos caminos que exige `AGENTS.md` —sobre una base al día y sobre una instalación desde cero, y las dos producen una estructura idéntica salvo un comentario de esquema ajeno a las migraciones—, ocho permisos, la configuración del proveedor sembrada **apagada** y cuarenta pruebas de integración.

**Treinta roturas, y una prueba que pasaba por el motivo equivocado.** Cada garantía de esta tabla se probó quitando lo que la sostiene y viendo la prueba ponerse en rojo. Veintinueve se pusieron en rojo a la primera. Una no: la que decía comprobar que la clave del proveedor no cabe en la base seguía en verde con la restricción quitada, porque lo que fallaba era el **privilegio por columna** —`apiKeyEnvVarName` no es actualizable desde la aplicación—, no la restricción. La prueba comprobaba algo cierto y no lo que decía comprobar. Se partió en dos: una prueba el privilegio por el camino normal, y la otra ejerce la restricción con la conexión de propietaria, que es el camino por el que alguien pegaría una clave donde va un nombre: una migración futura, un guion de operación, la consola.

**Cuarta vez que un número de fase sobrevive a una renumeración.** La tabla del §11 de `docs/ENVIRONMENT.md` decía que las claves de Gemini son obligatorias «desde la Fase 10» mientras el código, ya corregido, decía 8, y la fila de arriba de ese mismo documento también decía 8. El control nuevo `C-COH-18` coteja esa tabla con `REQUIRED_BY_PHASE` y falló nombrando las dos variables antes de corregirlas.

**Y `GEMINI_DEFAULT_MODEL` dejó de competir con la base.** El modelo por omisión estaba contratado en dos sitios: la variable de entorno del PRD §21 y la fila `AiProviderConfiguration` del §18.8. Ahora la variable siembra la fila en una instalación nueva y en marcha no la lee nadie (ADR-0132).

---

## Lo que dejó el bloque B

El servicio central de la IA, con las tres defensas que gobiernan la ejecución, y sin construir todavía ni un caso de uso: el bloque B es la máquina de ejecutar, no lo que se ejecuta.

**Un solo camino al proveedor.** `runGeneration` (`src/platform/ai/ai-service.ts`) es el único que llama al puerto de Gemini (`provider-port.ts`), y el puerto es lo único que habla con el proveedor —por `fetch`, sin SDK, como el de Stripe y el de correo—. El control nuevo `C-F8-01` lo sostiene desde fuera: el host del proveedor solo puede aparecer en el puerto, y la clave jamás lleva prefijo `NEXT_PUBLIC_`. Un adaptador falso sustituye el puerto entero en las pruebas (ADR-0137).

**La clave se resuelve por el nombre que dice la fila, en un solo sitio.** `resolveAiApiKey` (`src/platform/config/ai-key.ts`) es el único punto que hace `process.env[nombre]` para la IA, y rechaza un valor que no parezca un nombre de variable: la defensa ante una clave pegada donde va un nombre, por el camino que la restricción de la base no cubre (ADR-0136).

**Los tres límites niegan antes de llamar.** Tokens por petición, peticiones por persona y día y costo mensual máximo, los tres desde la fila del proveedor. Ninguno se probó simulando una caída: se probó **contando llamadas** a un puerto falso —cero cuando el límite corta— porque «no llama» es más fuerte que «responde rápido» y no depende del entorno (ADR-0139, aplicación de ADR-0130).

**La degradación mantiene la aplicación en pie.** Apagada, sin clave o con el proveedor caído, `runGeneration` devuelve un resultado que cae al camino humano, sin lanzar. Apagada y sin clave no dejan fila —no hubo ejecución—; el error y el tiempo agotado sí, porque el criterio 6 pide poder consultar los errores por módulo. La salud gana su comprobación de IA, `degraded` y no `failed` cuando está apagada: es un estado de operación legítimo, no una avería.

**Cada ejecución deja huella y no texto.** La fila de `ai_generation` guarda el `sha256` de lo enviado —nunca el contenido—, el modelo, los tokens, el costo, la latencia y el estado. El costo sale de una tabla de precios en el código (un hecho del proveedor), mientras el techo de gasto vive en la fila (una política de la organización): el mismo dato no manda desde dos sitios (ADR-0138). La salida se valida contra el esquema de la versión con un validador acotado y honesto; lo que no encaja se registra como `SCHEMA_REJECTED` y no se enseña.

**Diecinueve pruebas nuevas, cada garantía vista fallar.** Once de integración —los tres límites, las dos degradaciones, el éxito con su huella, el error, el tiempo agotado y las dos formas de rechazo de esquema— y ocho unitarias del validador, del resolver de la clave, del precio y del guardia de solo-servidor. Cada una se rompió a propósito y se vio ponerse en rojo antes de restaurar.

---

## Lo que dejó el bloque H — y el cierre de la fase

Las pruebas de aceptación, el repaso de los seis criterios ejecutando el sistema, y este informe. **La fase está construida al 100 %.**

**Los seis criterios, comprobados ejecutando el sistema.** `tests/integration/fase8-criterios.test.ts` reúne los seis como los `faseN-criterios.test.ts` de las fases anteriores: no leen el código, ejecutan los casos de uso y miran después la base con las credenciales de la aplicación. La tabla de criterios de arriba dice cómo se comprobó cada uno. Los dos que el PRD nombra explícitamente —`F8-QA-001`, que ningún prompt crítico viva solo en el código, y `F8-QA-002`, que las fuentes respeten los permisos— tienen ahí su prueba.

**No se construyó nada de la fase siguiente.** Se repasó el alcance contratado del §24 Fase 8 contra lo construido en A–H: servicio central, prompts administrables, laboratorio, base documental por permisos, orientación, clasificación sugerida, resúmenes, documentos asistidos, costos, límites, auditoría, revisión humana, degradación y defensas —todo está—. La búsqueda del gestor de contenidos sigue siendo léxica, que es lo contratado; la semántica vive en la base documental de esta fase. La columna `SupportRequest.suggestedByAiGenerationId`, contratada desde la Fase 0 y sin destino hasta hoy, la escribe ya la clasificación asistida (bloque F).

### Pruebas y resultados

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | Sin errores |
| `npm run lint` | Sin errores ni avisos |
| `npm run phase:verify` | **75 aprobados, 0 fallidos**, 1 no aplicable; los cuatro controles nuevos de la fase (`C-F8-01`…`C-F8-04`) en verde |
| `npx vitest run` | Toda la suite en verde, con las pruebas nuevas de los bloques B–H |
| `npm run build` | Compila; las rutas de IA son dinámicas |
| `npx playwright test` | Extremo a extremo y accesibilidad en verde en móvil y escritorio, claro y oscuro |
| `npm run db:check` | La base configurada coincide con las migraciones del repositorio |
| Integración continua | Verde en cada bloque, comprobada en GitHub Actions antes de dar por cerrado ninguno |

### Defectos que aparecieron y se corrigieron dentro de la fase

- **La lista blanca de columnas no crece sola.** El bloque A añadió `SupportRequest.suggestedByAiGenerationId` como columna sin devolverla a la lista de columnas actualizables; la clasificación asistida habría fallado con «permiso denegado». Corregido con una migración correctiva en el bloque F. Es la reaparición del mismo desfase que ya avisó la Fase 6.
- **Un guardián de pantalla sin motivo.** La pantalla del proveedor comprobaba `ai.provider.configure` —un permiso que exige motivo— sin darlo, así que negaba el acceso a quien sí tiene la facultad. **Lo destapó la integración continua**, en el barrido de accesibilidad, que comprueba que una pantalla no sea una denegación disfrazada. Corregido dándole el motivo, como ya hacían la navegación y el caso de uso. La lección quedó: una pantalla que gobierna un permiso con motivo tiene que llevarlo también en su guardián de visibilidad.

### A la espera de autorización

Construida la fase al 100 % y con la integración continua en verde, **el proyecto se detiene aquí a esperar autorización expresa de la persona usuaria** (PRD §23). Hasta que llegue, la Fase 9 no se inicia. Cuando llegue, se registra el estado `APPROVED` y el SHA del punto de control en el historial de abajo.

---

## Lo que dejó el bloque G

La consulta de costos por módulo y la gobernanza del proveedor (criterios 5 y 6 de la fase).

**El consumo se consulta sin abrir las conversaciones.** `usageByModule` (`ai.usage.read`) agrega peticiones, tokens, costo y estados por módulo, y **no selecciona ninguna columna de contenido** (ADR-0152). El permiso está separado a propósito de `ai.generation.read`: la contraloría, que tiene el primero y no el segundo, ve el gasto y no lo que se escribió —probado en positivo y en negativo—. El control nuevo `C-F8-04` rechaza que el archivo de la consulta nombre una columna de contenido, ni en un comentario; probado nombrándola y viéndolo fallar.

**Los límites se bajan desde una pantalla, no la clave.** `configureProvider` (`ai.provider.configure`, con motivo) escribe modelos, los tres límites, el techo de gasto, la moneda, el opt-out y el encendido; la clave no se toca, porque su nombre de variable es de despliegue (ADR-0153). El techo de gasto positivo y el modelo por omisión entre los permitidos los exige la base y el caso de uso los comprueba antes para un mensaje claro. Que configurar surte efecto se probó bajando el máximo de tokens y viendo cortarse la siguiente ejecución.

**Apagar no es una avería (criterio 5).** La pantalla del proveedor enseña la salud —operativa, o degradada con su motivo— y, apagada, dice que la aplicación sigue en pie por el camino humano. Probado: apagar el proveedor deja `runGeneration` devolviendo `DEGRADED`, sin lanzar.

**Las pantallas están en `/gestion/ia/consumo`** (costo por módulo, marcado «sin contenido») **y `/gestion/ia/proveedor`** (configuración y salud), con sus entradas de navegación y sus permisos. Cinco pruebas de integración nuevas, cada garantía vista fallar.

---

## Lo que dejó el bloque F

Los casos de uso asistidos y la revisión humana de cada salida, sobre la solicitud de apoyo (criterios 3 y 4 de la fase).

**La IA asiste a quien ya puede leer; no reparte el primer acceso.** La canalización automática al recibir un mensaje sigue siendo la de la tabla escrita, sin IA (Fase 6, ADR-0106): decide quién lee por primera vez un relato sensible. La clasificación asistida la pide una persona que **ya** puede leer la solicitud y produce una propuesta que no ejecuta nada (ADR-0150). Esa frontera es la que hace que la IA sugiera sin decidir.

**La puerta que gobierna el bloque.** `confirmRouting` no confirma una canalización sugerida por IA —cuando se va a confirmar esa misma— sin que una persona la haya aceptado o corregido en su revisión (`AiReview`); apartarse de la sugerencia no se bloquea, porque ahí no surte efecto (ADR-0151). Probado rompiéndolo: forzada la comprobación a «aceptada» siempre, la salida asistida se confirma sin que nadie la mire, y la prueba se pone en rojo.

**Un núcleo, no cinco llamadas sueltas.** `assist()` (`@/modules/ai`) resuelve la versión publicada del prompt por su código, recupera con los permisos de quien pregunta (bloque D) y ejecuta con el efecto declarado (bloque E). Sin prompt publicado degrada al camino humano, igual que la IA apagada (ADR-0148). La consulta a la base documental también se redacta antes de salir: los embeddings llegan al proveedor.

**La revisión es terminal y de solo inserción.** Una salida se revisa una vez —la base lo impone con `@@unique([generationId])`, migración correctiva—, y solo se revisa lo que el modelo produjo (ADR-0149). Aceptar la deja tal cual, corregir la sustituye por el texto de la persona —el criterio 3—, rechazar la detiene y se explica.

**Las pantallas están en `/gestion/mensajes/[id]`:** un asistente que resume, redacta, explica u orienta, con la salida siempre marcada como generada con IA y una revisión (aceptar, corregir, rechazar) antes de usarla; y la clasificación sugerida junto a la canalización, que no se confirma sin revisarse.

**El control nuevo `C-F8-03`** comprueba estáticamente que ningún caso de uso asistido declare un efecto de los prohibidos por el §15.4: un flujo asistido no puede cablearse a una decisión que no le toca. Probado devolviéndole un efecto prohibido y viéndolo fallar.

**Diez pruebas de integración nuevas**, cada garantía vista fallar: la puerta de la revisión (la del bloque), que la sugerencia no ejecuta nada, que apartarse no se bloquea, la corrección que sustituye el texto, la revisión terminal, la degradación sin prompt publicado y la minimización de lo que llega al proveedor por un flujo asistido.

---

## Lo que dejó el bloque E

Las tres defensas del §15.4 y §15.5, todas en el servicio de ejecución, que es el único sitio por el que se llama al proveedor.

**La IA no decide.** Es la garantía que gobierna la fase. El servicio lleva el registro de los diez efectos del §15.4 (`PROHIBITED_EFFECTS`) y, cuando la petición declara que su salida produciría uno, **rechaza la ejecución antes de llamar al modelo** y deja fila `BLOCKED_BY_POLICY` (ADR-0147). El control nuevo `C-F8-02` coteja ese registro, palabra por palabra, con el §15.4 del PRD: una entrada que se pierda es una decisión que la IA podría volver a tomar. Probado rompiéndolo.

**Lo que se envía se redacta en el servicio.** La PII reconocida —correo, CURP, RFC, teléfono, tiras largas de dígitos— se sustituye por un marcador antes de salir, y la huella se calcula sobre el texto ya redactado. `redactionApplied` deja de ser una promesa de quien llama y pasa a ser un hecho del servicio (ADR-0145). Probado: el proveedor falso no recibe el correo ni la CURP.

**La inyección se marca, no se bloquea.** El material consultado y la entrada se revisan en busca de instrucciones incrustadas; si las hay, la fila queda con `injectionSuspected`, para que la revisión humana lo sepa (ADR-0146). Castigar a quien pregunta por lo que dice un documento ajeno sería el error contrario.

**Once pruebas nuevas** —seis unitarias del redactor, el detector de inyección y el registro; cinco de integración que comprueban que el servicio aplica las tres de verdad—, cada garantía vista fallar: enviar sin redactar, no marcar la inyección, y dejar pasar un efecto prohibido.

---

## Lo que dejó el bloque D

La base documental que la Fase 0 contrató y nunca se construyó: fuentes autorizadas, fragmentos con su vector, y una recuperación que **respeta los permisos de quien pregunta**. Es el criterio 2 de la fase.

**Un fragmento no alcanza a quien no puede leer su origen.** La garantía delicada del bloque. `retrieveChunks` (`src/platform/ai/knowledge.ts`) filtra por permiso **dentro** de la consulta del vecino más próximo: el `requiredPermissionCode` del fragmento tiene que ser nulo o estar entre los permisos de quien pregunta (`effectiveGrantedPermissions`), y la fuente tiene que estar entre las que la versión del prompt autoriza. Los dos filtros van en el mismo `WHERE` porque recuperar primero y filtrar después dejaría que el modelo ya lo hubiera visto (ADR-0144). Probado rompiéndolo: sin el filtro, el fragmento restringido alcanza a quien no debe, y la prueba se pone en rojo.

**Los vectores vienen del puerto.** `embed()` se añadió al mismo puerto que genera, con adaptador falso para las pruebas; el modelo de embeddings y la dimensión 768 son constantes en código, atadas al `vector(768)` del esquema (ADR-0143). Vectorizar comparte la degradación de generar: sin proveedor, no se indexa y la recuperación devuelve vacío.

**Indexar es fragmentar, vectorizar e insertar por SQL** —el vector no lo expresa Prisma—, copiando el permiso a cada fragmento. Reindexar borra y reinserta, y deshabilitar una fuente borra sus fragmentos: un fragmento no se edita, y un vector huérfano sería una puerta que la consulta cree cerrada. Una fuente cuyo contenido cambió queda `STALE`.

**Las pantallas están en `/gestion/ia/fuentes`** (registrar, indexar, deshabilitar) y en el editor de prompts (qué fuentes autoriza una versión, y un panel para **probar la recuperación con los propios permisos** de quien prueba). Accesibilidad en verde.

**Ocho pruebas de integración nuevas, la garantía crítica vista fallar** de dos maneras: quitar el filtro de permiso y quitar el de fuentes autorizadas. Más indexación, copia del permiso al fragmento, `STALE` por cambio y deshabilitar que borra.

---

## Lo que dejó el bloque C

Los prompts dejan de ser una promesa del modelo de datos y se administran de verdad: se crean, se versionan, se prueban contra el modelo y se publican, todo desde una pantalla y nada desde el código (criterio 1 de la fase).

**Corregir es una versión nueva.** El módulo `@/modules/ai` crea prompts y versiones, y `saveDraftVersion` **nunca** pisa una versión: inserta otra. Lo sostiene la base con privilegios de columna —el texto, el modelo y el esquema de una versión no son actualizables—, así que la pregunta «¿qué se le pidió al modelo?» siempre tiene la versión exacta por respuesta (ADR-0141).

**Quien redacta no publica.** `ai.prompt.edit` (COMMUNICATIONS) redacta y prueba; `ai.prompt.publish` (EXECUTIVE_SECRETARY) publica. La base exige que el revisor no sea el autor (ADR-0133), y el caso de uso lo comprueba antes para dar un mensaje claro en vez de un error de restricción. Publicar apunta el prompt a la versión y retira la anterior; retirar lo deja sin versión vigente, y sus flujos caen al camino humano igual que con la IA apagada (ADR-0142).

**El laboratorio no es un atajo.** `runLabGeneration` ejecuta una versión en borrador o en prueba compartiendo la máquina del bloque B: los mismos límites, la misma degradación, la misma fila en `ai_generation`. Es la única puerta que ejecuta algo sin publicar, y la abre solo el caso de uso que exige `ai.prompt.edit` (ADR-0140). Una prueba de laboratorio cuesta, se registra y respeta el techo de gasto.

**Reversión que no borra.** Revertir copia el contenido de una versión antigua en una nueva en borrador, con el rastro de su origen; no se publica sola.

**Las pantallas están en `/gestion/ia`.** Listado, creación, y un editor con el historial de versiones, el laboratorio, la publicación, la reversión y el retiro; cada acción aparece solo para quien tiene su facultad, y quien solo lee ve el prompt sin poder tocarlo. El barrido de accesibilidad cubre el listado y el formulario de creación con la cuenta de comunicación.

**Dieciséis pruebas de integración nuevas, cada garantía vista fallar.** Corregir sin pisar, quien redacta no publica, publicar retira la anterior, retirar deja sin vigente, revertir no borra, y el laboratorio que ejecuta un borrador y degrada con la IA apagada sin mover la versión. Se rompió cada una y se la vio en rojo antes de restaurar.

---

## Cómo se retoma

La fase está construida al 100 % (bloques A–H) y **espera autorización de cierre**. Quien continúe no necesita nada de esta sesión: `AGENTS.md` dice cómo se trabaja, `docs/HANDOFF.md` cómo se pone en marcha y se corre cada suite, y esta sección dice dónde se quedó.

**Estado comprobado.** `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run phase:verify` (75 aprobados, 0 fallidos), `npm run build`, `npm run db:check` y `npx playwright test`, todo en verde en local, y la integración continua en verde sobre el commit del cierre.

**Lo único que queda es una decisión, no trabajo.** El PRD §23 exige que la fase, terminada al 100 %, **se pare a esperar autorización expresa** antes de tocar la Fase 9. Eso es lo que está pasando. Si la persona usuaria autoriza, se registra `APPROVED` y el SHA del punto de control en el historial; si al revisar aparece algo, se abre como defecto y se corrige dentro de esta fase, no después.

**Si se reabre por un defecto**, el método es el de siempre: romper lo que sostiene la garantía y verla ponerse en rojo, y ejecutar el sistema para los criterios de aceptación, nunca leer el código.

**Base local.** El PostgreSQL de la máquina se para solo cada tanto. `docs/HANDOFF.md` trae el comando para levantarlo; si `npm run db:migrate` falla con «no server running», es eso. La extensión `pgvector` tiene que estar instalada: sin ella, la migración de la Fase 8 no aplica y las pruebas de integración no corren.

---


## Defectos abiertos

Ninguno registrado todavía.

> **Cómo se lee esta tabla.** La última celda cuenta **cómo se corrigió** el defecto. Un defecto todavía abierto la deja
> vacía o la empieza con `Abierto`. `npm run phase:verify` lo lee así: una celda en blanco es un defecto abierto, no un
> defecto sin documentar, y con uno abierto de severidad bloqueante la fase no puede declararse aprobada.

| Id | Severidad | Descripción | Estado y corrección |
|---|---|---|---|

---

## Historial de fases

| Fase | Inicio | Cierre | Estado | SHA del punto de control |
|---|---|---|---|---|
| 0 | 2026-09-03 | 2026-09-03 | `APPROVED` | `7fecd6f873c8068101478da2179d6d5a6bc17c29` |
| 1 | 2026-09-03 | 2026-09-04 | `APPROVED` | `e8daa0e` (el cierre previo `ac23003` fue revocado) |
| 2 | 2026-09-04 | 2026-09-04 | `APPROVED` | `0fedf6f` |
| 3 | 2026-09-04 | 2026-09-04 | `APPROVED` | `85cf196` |
| 4 | 2026-09-04 | 2026-09-05 | `APPROVED` | `cadebbd` (cerrada primero en `038297d`, reabierta el mismo día por la corrección de alcance de CIAN y CENI) |
| 5 | 2026-09-05 | 2026-09-06 | `APPROVED` | `6c5b18c` |
| 6 | 2026-09-06 | 2026-09-06 | `APPROVED` | `6f31d88` (cerrada primero en `a7e8031`, reabierta el mismo día por `D-F6-006`) |
| 7 | 2026-09-06 | 2026-09-06 | `APPROVED` | `0101a2a` |
| 8 | 2026-09-06 | — | `IN_PROGRESS` | — |
| 9 y 10 | — | — | No iniciadas | — |

---

# Archivo — registro completo de la Fase 7

> Herramientas tecnológicas y accesos externos. Cerrada el 6 de septiembre de 2026 en `0101a2a`.

---
## Situación actual

- **Fase activa:** 7 — Herramientas tecnológicas y accesos externos
- **Estado:** `APPROVED`
- **Autorizada por la persona usuaria:** 6 de septiembre de 2026, con la instrucción expresa de que **ninguna plataforma externa se toca**
- **Fecha de inicio:** 6 de septiembre de 2026
- **Fecha de cierre:** 6 de septiembre de 2026
- **SHA del punto de control:** `0101a2a`
- **Fase anterior:** 6 — `APPROVED`, cerrada en `6f31d88`. Su registro íntegro se conserva en el **Archivo** al final de este documento.
- **Fase siguiente:** 8 — Inteligencia artificial Gemini, **no autorizada** hasta que la persona usuaria lo indique expresamente (PRD §23.3)

---

## Alcance contratado

El PRD §24 Fase 7 contrata: catálogo único de plataformas y herramientas del ecosistema; ficha de cada una con nombre, imagen o logotipo, descripción breve, público al que se dirige y estado operativo; dirección externa configurable, administrada desde el catálogo o el CMS y **nunca escrita en un componente**; botón de acceso con indicación accesible de que se abrirá otra plataforma; página de catálogo en el sitio público y las mismas fichas en el portal personal; administración del catálogo desde el CMS, sin desplegar código para cambiar una dirección; y documentación para agregar una plataforma o una herramienta nueva sin tocar el núcleo.

**Qué cierra esta fase.** La navegación pública lleva desde la Fase 2 a `/cian`, `/ceni` y `/herramientas`, y hasta hoy esas rutas dependen de que alguien publique una página en el gestor de contenidos. Aquí dejan de ser páginas sueltas y pasan a ser **fichas de un catálogo**, con el mismo patrón para todas y una dirección que se cambia sin desplegar.

**La garantía que gobierna la fase.** **Ninguna plataforma externa se toca.** CIAN, CENI, NeuroPlan, ADIA y NEXO son plataformas y herramientas propias, independientes y ya desarrolladas. Este repositorio guarda su ficha y su dirección, y lleva a ellas por **redirección externa y nada más**: sin inicio de sesión único, sin token de lanzamiento, sin API, sin sincronización, sin iframe y sin un solo dato personal en la dirección. Cada una conserva su autenticación, su operación, sus cobros y sus datos.

---

## Bloques de trabajo

| Bloque | Contenido | Estado |
|---|---|---|
| A | Entidad `EcosystemLink`, migración, permiso `ecosystem.link.manage` y semilla del catálogo | Completo |
| B | Catálogo público y su repetición en el portal personal, con el botón que dice que se sale | Completo |
| C | Administración del catálogo en la superficie de contenidos | Completo |
| D | Pruebas, controles de fase, documentación y cierre | Completo |

---

## Criterios de aceptación

Los ocho criterios del PRD §24 Fase 7, comprobados **ejecutando el sistema** y mirando después lo que quedó en la base
con las credenciales de la aplicación, nunca leyendo el código (`tests/integration/fase7-criterios.test.ts`).

| # | Criterio | Estado | Cómo se comprobó |
|---|---|---|---|
| 1 | Cada plataforma se agrega sin cambiar el núcleo de membresías (`F7-QA-001`) | **Cumplido** | Se crea una ficha nueva y se cuentan antes y después las membresías, solicitudes, calidades, productos y pagos: ninguna cambia |
| 2 | Ninguna ficha tiene un botón sin dirección real configurable (`F7-QA-002`) | **Cumplido** | Sin dirección, la ficha llega con acceso nulo y la pantalla no pinta botón —ni uno deshabilitado, que se lee como algo roto—. Con dirección llega la que se configuró, y cambiarla se ve enseguida |
| 3 | CIAN y CENI aparecen exclusivamente como accesos externos (`F7-QA-003`) | **Cumplido** | Sobre la base en crudo: no existe ninguna tabla de expediente, agenda, evaluación, derecho o lanzamiento de esas plataformas; la ficha no tiene columna de derecho ni de identificador ajeno; y ningún enumerado del sistema vuelve a nombrar una operación suya |
| 4 | Quien pulsa sabe, antes de pulsarlo, que sale de Fuerza Índigo (`F7-QA-004`) | **Cumplido** | El aviso va en el **texto del enlace** y no en un icono, y se comprueba en el navegador. Aquí se comprueba lo que ese aviso necesita: que la ficha llegue con nombre propio y no con un identificador |
| 5 | El acceso es únicamente redirección externa (`F7-QA-005`) | **Cumplido** | Ninguna dirección lleva parámetro, fragmento ni credencial; el catálogo serializado no contiene el identificador de la persona ni del actor; y la consulta pública **no recibe actor**, de modo que no hay forma de que devuelva otra cosa según quién pregunte |
| 6 | Ninguna dirección de acceso está escrita en un componente (`F7-QA-006`) | **Cumplido** | Se cambia la dirección en la base y cambia lo que sale al público, sin tocar código. Y el control `C-F7-02` recorre el repositorio rechazando cualquier dirección absoluta escrita en un enlace |
| 7 | La falla de una plataforma externa no bloquea el portal central (`F7-QA-007`) | **Cumplido** | No se simula una caída: medir un tiempo de espera no probaría nada, porque un dominio inexistente falla al instante. Se comprueba algo más fuerte —**que servir el catálogo no hace ninguna llamada de red**— contándolas. Sin llamada no hay caída ajena que pueda bloquear nada |
| 8 | Todas las fichas siguen el mismo patrón, sin casos especiales (`F7-QA-008`) | **Cumplido** | Las cinco se editan, se ocultan y se publican con el mismo caso de uso, y todas llegan con **la misma forma**: si alguna necesitara un campo propio, faltaría o sobraría una clave |

---

## Defectos abiertos

**Ninguno.** Los cinco que aparecieron durante la construcción están corregidos dentro de la misma fase y se registran
abajo. Cada uno lo encontró una cosa distinta, y ninguna fue una revisión de código:

- Al primero, **ejecutar la puesta en marcha tal como el manual la describe** —la única forma de saber si un manual dice
  la verdad—.
- Al segundo, **servir una dirección que hasta entonces era del gestor de contenidos**.
- Al tercero, **intentar romperlo**: quitar la revalidación no ponía en rojo ninguna prueba, porque no hacía nada.
- Al cuarto, **leer el alcance contratado contra lo construido** antes de dar la fase por cerrada.
- Al quinto, **no conformarse con que una prueba pasara**: la del logotipo estaba en verde mientras la imagen no
  cargaba, porque comprobaba que el elemento existiera y no que trajera píxeles. Al exigir que cargara de verdad,
  apareció un defecto del almacén de archivos que alcanza a toda la plataforma y no solo a esta fase.

> **Cómo se lee esta tabla.** La última celda cuenta **cómo se corrigió** el defecto. Un defecto todavía abierto la deja
> vacía o la empieza con `Abierto`. `npm run phase:verify` lo lee así: una celda en blanco es un defecto abierto, no un
> defecto sin documentar, y con uno abierto de severidad bloqueante la fase no puede declararse aprobada.

| Id | Severidad | Descripción | Estado y corrección |
|---|---|---|---|
| `D-F7-001` | Media | `npm run db:seed` no cargaba `.env.local`: solo funcionaba si quien lo ejecutaba había exportado las variables a mano en su terminal. El README y `docs/HANDOFF.md` lo documentan como paso de la puesta en marcha, y en una instalación nueva fallaba con un mensaje que hablaba de una variable **que sí estaba escrita en el archivo**. | Corregido en el bloque A. La semilla usa `loadLocalEnv()`, el mismo cargador que ya usan las migraciones y las pruebas de integración, y el mensaje de error dice ahora dónde se busca. |
| `D-F7-002` | Alta | Nada impedía publicar en el gestor de contenidos una dirección que ya sirve una pantalla del código. La página se guardaba, el gestor la daba por publicada y quien abría la dirección veía otra cosa: una página fantasma que solo se descubre cuando alguien pregunta por qué la suya no aparece. Era un riesgo latente desde la Fase 2 y dejó de serlo al servir el catálogo desde `/herramientas`. | Corregido en el bloque B. Crear una página o una redirección en una dirección del código se rechaza con su motivo. El control `C-F7-01` obliga a que **toda** ruta pública esté clasificada: o sirve contenido propio, y entonces el gestor no publica ahí, o es una forma de publicar lo del gestor —como `legales/:param`— y entonces sí. Una pantalla nueva obliga a decidir en vez de heredar un comportamiento que nadie eligió. |
| `D-F7-003` | Baja | Las acciones del catálogo llamaban a `revalidatePath` sobre las tres rutas donde vive, con un comentario que explicaba por qué hacía falta. Las tres pantallas son dinámicas y se construyen en cada petición: no había ninguna página guardada que invalidar. Código que no hacía nada, y una explicación que afirmaba lo contrario. | Corregido en el bloque C. Se retiraron las tres llamadas y el comentario dice ahora por qué **no** se revalida, y qué habría que hacer si alguna de esas rutas dejara de ser dinámica. Apareció al intentar romperlo: quitar la revalidación no ponía en rojo ninguna prueba. |
| `D-F7-004` | Alta | La ficha se construyó sin **imagen ni logotipo**, que el PRD §12.2 y el alcance de la fase contratan. La columna `logoFileId` existía en el esquema y no la escribía ni la leía nadie: un modelo huérfano y una partida del alcance sin construir. | Corregido en el bloque D. Se construyó la carga desde la administración, con tres formatos de imagen y ninguno SVG, y una ruta abierta que sirve **el logotipo de una ficha publicada** indexado por el código de la ficha y nunca por un identificador de archivo. Apareció al revisar el alcance contratado contra lo construido, antes de dar la fase por cerrada. |
| `D-F7-005` | Alta | El almacén local de archivos guardaba el contenido **en la memoria del proceso**, y un servidor de producción atiende con varios procesos de trabajo: lo que guardaba una petición no lo encontraba la siguiente. No es lo que se anunciaba —«se pierden al reiniciar»— sino algo peor: un archivo recién subido daba 404 al pedirlo, unas veces sí y otras no. Alcanzaba a **todo** archivo de todo despliegue sin token de almacén, no solo al logotipo: credenciales, documentos de expediente, evidencias de solicitud. | Corregido en el bloque D. El adaptador local guarda en un directorio, de modo que lo que escribe un proceso lo lee cualquiera. Sigue anunciándose como local y la comprobación de salud lo sigue marcando como degradado: un directorio de contenedor desaparece con él. Lo destapó la ruta del logotipo, que fue lo primero en subir un archivo y leerlo en otra petición. |

---

## Evidencias

| Qué se afirma | Cómo se comprobó |
|---|---|
| Cada regla de la fase se probó **viéndola fallar** | Treinta y dos reglas, una por una: se rompió el código que la sostiene, se comprobó que la prueba se pone en rojo, y se restauró. **Cinco de esos intentos no fallaron**, y cada uno destapó algo: dos pruebas que pasaban por la razón equivocada —tapadas por la puerta de archivos, no por la regla que decían comprobar—, una comprobación dentro de un `if` que a veces no se cumplía, una medición de tiempo que no medía nada, y un defecto real (`D-F7-003`) |
| Las migraciones funcionan desde cero | Cada archivo de pruebas de integración crea una base efímera y aplica las **veintidós** migraciones en orden sobre un esquema vacío. No es una comprobación aparte: es la única forma en que corren las pruebas |
| Las migraciones funcionan desde la fase anterior | La base de desarrollo viene de la Fase 6 y recibió la migración nueva con `migrate deploy`, sin reconstruirse. `npm run db:check` compara la base configurada contra lo que **producen las migraciones** y no encuentra diferencia |
| El acceso es redirección y nada más | El control `C-F7-02` recorre el repositorio y rechaza una dirección escrita en un enlace, un `iframe`, una llamada de red desde el módulo del catálogo y el vocabulario del intercambio de identidad. Probado rompiéndolo de las cuatro maneras |
| Ninguna ruta del código le roba una dirección al gestor | El control `C-F7-01` exige que **toda** ruta pública esté clasificada: o sirve contenido propio, o es una forma de publicar lo del gestor. Probado rompiéndolo de tres maneras |
| Los permisos se prueban en positivo y en negativo | Quien lleva las finanzas no edita la ficha ni ve el catálogo completo; quien preside —que **sí** sabe subir archivos— no carga el logotipo; quien no administra no llega a la pantalla |
| La interfaz se revisó en móvil y en escritorio | Las pruebas de extremo a extremo corren en los dos perfiles de `playwright.config.ts` —Pixel 7 y escritorio de 1280 px— |
| La accesibilidad se validó, no se declaró | La pantalla de administración entró en el barrido con axe, con la cuenta del rol que de verdad la abre. Repite el mismo formulario una vez por ficha, que es donde aparecieron los identificadores duplicados de `D-F5-010` |
| Los estados vacíos y de error están terminados | «Todavía no hay ninguna plataforma publicada», «el acceso a X todavía no está configurado», «el catálogo está vacío» |
| La auditoría está conectada | Editar la ficha deja asiento; **cambiar la dirección deja otro**, con el valor anterior y el nuevo |
| No hay secretos ni datos reales en el repositorio | `C-REPO-04` y `C-ENV-02`. Las cinco fichas nacen sin dirección: la semilla no inventa direcciones |
| La prohibición del proveedor vetado se sostiene | `C-REPO-03`, sobre código, dependencias y documentación |

---

## Pruebas y resultados

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | Sin errores |
| `npm run lint` | Sin errores ni avisos |
| `npm run phase:verify` | **70 aprobados, 0 fallidos**, 1 no aplicable |
| `npx vitest run` | **1 225 pruebas**, todas en verde |
| `npm run build` | Compila; ninguna ruta del catálogo es estática |
| `npx playwright test` | **308 pruebas**, 8 omitidas por diseño, en móvil y escritorio |
| `npm run db:check` | La base configurada coincide con las migraciones del repositorio |
| Integración continua | Verde en cada bloque, comprobado en GitHub Actions antes de dar por cerrado ninguno |

---

## Historial de fases

| Fase | Inicio | Cierre | Estado | SHA del punto de control |
|---|---|---|---|---|
| 0 | 2026-09-03 | 2026-09-03 | `APPROVED` | `7fecd6f873c8068101478da2179d6d5a6bc17c29` |
| 1 | 2026-09-03 | 2026-09-04 | `APPROVED` | `e8daa0e` (el cierre previo `ac23003` fue revocado) |
| 2 | 2026-09-04 | 2026-09-04 | `APPROVED` | `0fedf6f` |
| 3 | 2026-09-04 | 2026-09-04 | `APPROVED` | `85cf196` |
| 4 | 2026-09-04 | 2026-09-05 | `APPROVED` | `cadebbd` (cerrada primero en `038297d`, reabierta el mismo día por la corrección de alcance de CIAN y CENI) |
| 5 | 2026-09-05 | 2026-09-06 | `APPROVED` | `6c5b18c` |
| 6 | 2026-09-06 | 2026-09-06 | `APPROVED` | `6f31d88` (cerrada primero en `a7e8031`, reabierta el mismo día por `D-F6-006`) |
| 7 | 2026-09-06 | 2026-09-06 | `APPROVED` | `0101a2a` |
| 8 a 10 | — | — | No iniciadas | — |

---


# Archivo — registro completo de la Fase 6

> Defensa, casos, protección y canalización social. Cerrada el 6 de septiembre de 2026 en `6f31d88`.

---
## Situación actual

- **Fase activa:** 6 — Defensa, casos, protección y canalización social
- **Estado:** `APPROVED`
- **Autorizada por la persona usuaria:** 5 de septiembre de 2026, junto con la Fase 5; confirmada al aprobarse esta
- **Fecha de inicio:** 6 de septiembre de 2026
- **Fecha de cierre:** 6 de septiembre de 2026 (cerrada en `a7e8031`, **reabierta** el mismo día por `D-F6-006` y cerrada de nuevo)
- **SHA del punto de control:** `6f31d88`
- **Fase anterior:** 5 — `APPROVED`, cerrada en `6c5b18c`. Su registro íntegro se conserva en el **Archivo** al final de este documento.
- **Fase siguiente:** 7 — Herramientas tecnológicas y accesos externos, **no autorizada** hasta que la persona usuaria lo indique expresamente (PRD §23.3)

---

## Alcance contratado

El PRD §24 Fase 6 contrata: solicitud guiada de apoyo; clasificación informativa; prioridades y alertas; expediente de caso; participantes y representación; asignación por territorio y competencia; tareas y plazos; comunicaciones; documentos; derivaciones; consentimiento entre entidades; panel de Trabajo y Conflictos; panel de Neuroinclusión y Enlace Familiar; panel social de Alianza Índigo; cierre y reapertura; e indicadores anonimizados.

**Qué cierra esta fase.** La Fase 2 abrió la puerta —`SupportRequest`, con su relato inmutable y su aviso de privacidad aceptado— y la dejó terminando en «leído y contestado». Aquí esa puerta lleva a algún sitio: la solicitud se valora, se convierte en expediente y el expediente se trabaja. La Fase 4 dejó al beneficiario protegido dado de alta con su origen, su necesidad inicial y su urgencia, y dijo que la atención empezaba aquí.

**La garantía que gobierna la fase.** El expediente sindical y el expediente social **no se comparten**. El acceso se concede por asignación y necesidad legítima, nunca por pertenecer al área, y nada cruza de una entidad a la otra sin consentimiento específico de la persona sobre los campos y los archivos exactos que se transfieren, ni sin que un área humana lo acepte del otro lado. La propuesta automática de canalización es una propuesta: no ejecuta nada.

---

## Bloques de trabajo

| Bloque | Contenido | Estado |
|---|---|---|
| A | Esquema de casos, participantes, tareas, comunicaciones, canalizaciones y marcas de riesgo; migración y permisos | Completo |
| B | Solicitud guiada de apoyo, clasificación informativa y propuesta de canalización con confirmación humana | Completo |
| C | Expediente de caso: apertura desde la solicitud, resumen inalterable y valoración humana | Completo |
| D | Participantes, calidades y representación | Completo |
| E | Asignación por territorio y competencia, y acceso por asignación | Completo |
| F | Tareas, plazos y próximos pasos | Completo |
| G | Comunicaciones con audiencias diferenciadas y notas reservadas | Completo |
| H | Documentos con clasificación de sensibilidad y descarga autorizada | Completo |
| I | Canalización entre entidades con los seis requisitos del PRD §10.4 | Completo |
| J | Prioridades, alertas y protocolo visible de riesgo inmediato | Completo |
| K | Cierre con resultado y motivo, y reapertura controlada | Completo |
| L | Paneles: Trabajo y Conflictos, Neuroinclusión y Enlace Familiar, y panel social | Completo |
| M | Indicadores anonimizados con umbral de privacidad | Completo |
| N | Pruebas, controles de fase, documentación y cierre | Completo |
| O | Corrección `D-F6-006`: el contrato de fases vuelve a tener una sola fuente, y el relevo queda escrito | Completo |

---

## Criterios de aceptación

Los seis criterios específicos del PRD §24 Fase 6, comprobados **ejecutando el sistema** y mirando después lo que quedó
en la base con las credenciales de la aplicación, nunca leyendo el código (`tests/integration/fase6-criterios.test.ts`):

| # | Criterio | Estado | Cómo se comprobó |
|---|---|---|---|
| 1 | El usuario puede pedir apoyo sin saber qué área le corresponde (`F6-QA-001`) | **Cumplido** | Se envía un mensaje por la entrada pública sin decir a qué entidad va. La fila resultante lleva una propuesta de canalización **con su motivo**, y a la vez `confirmedRoutingLegalEntityId` nulo y estado `RECEIVED`: el sistema propuso y no ejecutó nada |
| 2 | La propuesta automática no sustituye la confirmación humana (`F6-QA-002`) | **Cumplido** | Abrir expediente sobre una propuesta sin confirmar se niega y la tabla `case_file` queda vacía. Tras confirmar, la solicitud guarda **quién** confirmó y **cuándo**, y pasa a `TRIAGE` |
| 3 | No se comparten notas entre sindicato y A.C. sin consentimiento y necesidad (`F6-QA-003`) | **Cumplido** | Una nota reservada existe en el expediente y **no se puede ni elegir** para transferir: proponerla se rechaza porque no está en la lista blanca. Una canalización legítima queda en `PROPOSED`, sin consentimiento y sin fecha de envío, hasta que la persona diga que sí sobre esa selección exacta |
| 4 | Toda lectura sensible queda auditada (`F6-QA-004`) | **Cumplido** | Se leen las tres cosas sensibles que la fase abre —un mensaje recibido, un expediente y un documento— y las tres dejan asiento con el actor y el instante: `support.request.read`, `cases.case.read` y `files.file.download_authorized` |
| 5 | Se prueba acceso denegado para territorios y expedientes ajenos (`F6-QA-005`) | **Cumplido** | Se fuerza en la base una asignación de una delegación de Nayarit sobre un expediente de Jalisco —lo que quedaría si el alcance del nombramiento se recortara después— y el expediente no se abre. Quien no lo lleva ni es parte tampoco |
| 6 | Los casos urgentes muestran rutas humanas y de emergencia configuradas (`F6-QA-006`) | **Cumplido** | El protocolo sale del gestor de contenidos, con las rutas que la organización configuró, y la marca de riesgo lo devuelve y guarda **cuál** se enseñó. Marcarlo desde la entidad equivocada se niega: dos personas morales siguen siendo dos aunque el asunto sea urgente |

---

## Defectos abiertos

**Ninguno.** Los seis que aparecieron se corrigieron dentro de la misma fase y se registran abajo. Cuatro los encontró
el propio verificador o el intento de romper una regla. **Uno llegó al cierre y lo encontró la persona usuaria**: está
contado como tal, no disimulado, y por él la fase volvió a abrirse.

Tres son de la misma familia y merecen leerse juntos: una regla escrita en un sitio y comprobada en otro. La puerta de
descarga tenía su propia idea de qué compartimento era un archivo de caso, distinta de la del módulo; `ACTIVE_PHASE`
decía una fase distinta de la que el proyecto declara; y el README anunciaba un contrato de fases distinto del que el
PRD contrata. En los tres casos lo que falló no fue el juicio de nadie, fue que existían dos fuentes para el mismo
hecho.

> **Cómo se lee esta tabla.** La última celda cuenta **cómo se corrigió** el defecto. Un defecto todavía abierto la deja
> vacía o la empieza con `Abierto`. `npm run phase:verify` lo lee así: una celda en blanco es un defecto abierto, no un
> defecto sin documentar, y con uno abierto de severidad bloqueante la fase no puede declararse `APPROVED`.

| Id | Severidad | Descripción | Estado y corrección |
|---|---|---|---|
| `D-F6-001` | Alta | La puerta de descarga fijaba el compartimento `SOCIAL` para **todo** archivo de caso y no aportaba sonda de asignación. Un documento de defensa sindical quedaba al alcance del personal de atención social y fuera del alcance de quien llevaba el expediente. | Corregido en el bloque H. El servicio resuelve el expediente del archivo y decide con su dominio, su territorio y su equipo; la traducción de dominio a compartimento se mudó a `@/platform/authz/compartments` y el módulo la reexporta, para que exista **una** fuente. Probado viéndolo fallar. |
| `D-F6-002` | Alta | `files.file.download` es el permiso general de archivos y no exige asignación: quien lo tuviera abría el documento de cualquier expediente de su entidad sabiendo el identificador. | Corregido en el bloque H. La puerta comprueba **sobre el hecho** que quien pide alcance el expediente —lo lleva, o es parte y el documento se le enseña— antes de mirar ninguna facultad. Marcar el permiso como `needsAssignment` habría cambiado la regla para todos los archivos del sistema. |
| `D-F6-003` | Media | La regla que oculta los datos clínicos existía y **no la ejercía nadie**: ningún rol tenía a la vez la descarga de material sensible y no la facultad clínica, así que ninguna prueba la veía fallar. | Corregido en el bloque H. Se descubrió al intentar romperla. Lo que faltaba era otra cosa: la delegación territorial revisa solicitudes de afiliación cuyos documentos son datos personales sensibles y no podía abrirlos. Con esa facultad en su sitio, lo que la detiene ante un diagnóstico es la autorización clínica que no tiene. |
| `D-F6-004` | Media | Cinco decisiones sobre expedientes —dos de canalización, tres de riesgo— armaban el recurso a mano y sin territorio. Un recurso sin territorio **no se niega: se permite**. | Corregido en los bloques I y J. Lo encontró el control `C-F6-01`, escrito en el bloque E precisamente para esto, en la misma sesión en que se introdujeron. |
| `D-F6-005` | Media | `ACTIVE_PHASE` seguía en `5` mientras se construía la Fase 6: las variables que la fase en curso vuelve obligatorias no se exigían al arrancar. Es la reaparición de `D-F4-002`. | Corregido en el bloque N. Además se escribió el control `C-COH-15`, que compara lo que declara `docs/PHASE_STATUS.md` con lo que el arranque cree: la corrección de la Fase 4 dependía de que alguien se acordara, y esta no. |
| `D-F6-006` | Alta | El `README.md` seguía anunciando el contrato **anterior** a la corrección de alcance: trece fases, con **CIAN en la 8 y CENI en la 9**. Dos fases enteras después de que CIAN y CENI dejaran de ser fases. Es la puerta de entrada del repositorio y lo primero que lee quien llega, incluida una máquina: quien lo creyera construiría CIAN como Fase 8. Con él, otras cinco discrepancias de la misma renumeración. | Corregido en el bloque O, **lo encontró la persona usuaria**. El contrato de fases pasa a tener una sola fuente —los encabezados `## FASE n` del PRD §24— y el control `C-COH-16` compara contra ella el README y `prd-contract.json`, y rechaza que cualquier archivo del repositorio cite una fase que no existe. Probado viéndolo fallar de cuatro maneras. |

---

## Reapertura del 6 de septiembre · `D-F6-006`

La fase se había cerrado en `a7e8031` y se había emitido su informe. La persona usuaria revisó entonces el repositorio y
encontró lo que la puerta de salida no vio: **el `README.md` seguía presentando CIAN y CENI como fases del proyecto**,
con el contrato de trece fases anterior a la corrección de alcance del 5 de septiembre.

No es un descuido de redacción. El README es lo primero que lee quien llega —una persona nueva o un agente— y el PRD §23
obliga a construir *la fase activa declarada*. Un agente que hubiera creído esa lista habría construido CIAN como Fase 8:
exactamente lo que la corrección de alcance ordenó no hacer.

**Por qué la puerta de salida no lo vio.** Porque no lo miraba. `C-PHASE-01` comprueba que el backlog cubra las fases del
contrato, y `C-COH-15` que el arranque crea la misma fase que el proyecto declara; ninguno comparaba el contrato con lo
que el repositorio **anuncia**. La lista de fases del README no la leía nadie desde que se escribió en la Fase 0.

**Qué se corrigió.**

| Dónde | Qué decía | Qué dice |
|---|---|---|
| `README.md` §4 | Trece fases, 0 a 12, con CIAN en la 8 y CENI en la 9 | Las once fases, 0 a 10, con el nombre exacto de los encabezados del PRD §24 |
| `README.md` §1 | «atención social (CIAN), inclusión institucional (CENI)» entre lo que este sistema hace | CIAN y CENI son plataformas propias e independientes que este repositorio presenta y a las que lleva; no las construye ni administra su operación |
| `README.md` §3 | «130 entidades más 7 de apoyo y 26 tablas de relación»; «15 flujos E2E globales» | 103 entidades, 7 de apoyo y 17 de relación —127 tablas— y 13 flujos E2E, que es lo que el modelo y el plan de pruebas dicen desde la corrección |
| `README.md` §5 | Una puesta en marcha detenida en la Fase 0: «la aplicación y los comandos se incorporan en la Fase 1» | Los pasos reales, que hoy levantan la aplicación desde las migraciones del repositorio |
| `docs/PRD.md` §24 Fase 10 | «prueba integral de los 15 flujos E2E globales», contra los 13 que enumera su propio §22.2 | Los 13 del §22.2 |
| `scripts/phase/prd-contract.json` y `docs/BACKLOG.md` | Las fases 7, 9 y 10 con un nombre distinto del encabezado del PRD | El nombre del PRD, verbatim |
| Cuatro comentarios en el código y en el esquema | Promesas para las fases 9 y 12, que ya no existen | La fase que hoy contrata cada cosa: la 8 para la asistencia con IA y la búsqueda semántica, la 10 para la revisión de seguridad, y el módulo de identidad para el aislamiento entre organizaciones |
| `package.json` y `docs/TEST_PLAN.md` | `test:a11y` contratado por el PRD §22.3, documentado, y **no declarado**: un comando que el plan prometía y no existía | El comando existe y ejecuta las 184 pruebas de accesibilidad; el plan dice además la verdad sobre la integración continua, que las corre dentro de `test:e2e` porque `playwright.config.ts` declara las dos suites juntas |

**El control que impide la repetición.** `C-COH-16` toma como única fuente los encabezados `## FASE n — nombre` del PRD
§24 y compara contra ellos el contrato del verificador y la lista del README —número, orden y nombre—, comprueba que el
README declare cuántas fases son, y recorre todo el repositorio rechazando cualquier cita a una fase posterior a la
última contratada. Se probó viéndolo fallar de cuatro maneras: devolviendo CIAN a la Fase 8 del README, desalineando un
nombre en `prd-contract.json`, devolviendo «trece fases» a la frase de conteo, y devolviendo a un comentario del código
la promesa de una fase que el contrato ya no tiene.

**Qué no se tocó.** Los repositorios y el funcionamiento de CIAN y CENI. Las páginas `/cian` y `/ceni` siguen siendo
contenido del gestor de contenidos y sus direcciones externas siguen sin estar escritas en ningún componente. El archivo
histórico de este documento queda como estaba: es el registro de lo que se dijo cuando el contrato era otro, y el control
lo excluye a propósito.

### Y el relevo, escrito

El propósito de todo esto es que el proyecto **se pueda continuar sin esta conversación**: en otra ventana, en otra
cuenta, con otra persona o con otro agente. Y ahí faltaba lo más elemental: `AGENTS.md` —el archivo que un agente carga
solo al abrir el repositorio— **no decía nada de este proyecto**. Traía únicamente el aviso que escribe la herramienta de
Next.js. Quien llegara tenía que deducir por lectura el protocolo de fases, la prohibición del producto mínimo viable,
que CIAN y CENI no se construyen aquí y que no se ejecuta `prisma format`. Lo deduciría distinto.

Tampoco estaba escrito cómo se opera: levantar un PostgreSQL local, qué necesita cada suite, que las pruebas de
integración corren contra una base de verdad y por eso cada ejecución demuestra además una instalación desde cero, o que
un navegador ya instalado se aprovecha con `E2E_CHROMIUM_PATH`. Eso vivía solo en la memoria de la sesión, que es el
sitio donde no sobrevive a un cambio de ventana.

| Documento | Qué resuelve |
|---|---|
| `AGENTS.md` | Se carga solo. Los cuatro documentos que rigen y en qué orden leerlos, las reglas que no se negocian, el método y la puerta de salida |
| `docs/HANDOFF.md` | El manual de operación: puesta en marcha, cómo se corre cada suite, cómo se construye un bloque, las reglas de esquema y de permisos que más caro cuestan, el método de probar rompiendo, y cómo se cierra una fase |

**Ninguno de los dos dice en qué fase estamos**, y el control `C-COH-17` lo impide: exige que existan, que `AGENTS.md`
remita al PRD, al seguimiento, al manual y al backlog, y rechaza que cualquiera de los dos declare una fase activa, un
estado de fase o una fase concreta. Un manual que además declarara el estado se quedaría atrás en el primer cierre y
contaría una versión distinta de la verdad a quien más depende de él: exactamente lo que acababa de pasar con el README.
Probado viéndolo fallar de cuatro maneras.

---

## Evidencias

| Qué se afirma | Cómo se comprobó |
|---|---|
| Cada regla de la fase se probó **viéndola fallar** | Cincuenta y cuatro reglas, una por una: se rompió el código que la sostiene, se comprobó que la prueba se pone en rojo, y se restauró. Una prueba que nunca se ha visto fallar solo demuestra que no rompe nada. El método encontró `D-F6-003`, que ninguna otra puerta veía |
| Las migraciones funcionan desde cero | Cada archivo de pruebas de integración crea una base efímera y aplica las **veintiuna** migraciones en orden sobre un esquema vacío. No es una comprobación aparte: es la única forma en que corren las 1 167 pruebas |
| Las migraciones funcionan desde la fase anterior | La base de desarrollo viene de la Fase 5 y recibió las dos migraciones nuevas con `migrate deploy`, sin reconstruirse. `npm run db:check` compara la base configurada contra lo que **producen las migraciones**, no contra el esquema, y no encuentra diferencia |
| Los permisos se prueban en positivo y en negativo | Las seis suites nuevas incluyen su denegación: quien no lleva el expediente no lo abre, quien no reparte no abre el panel, quien no tiene la facultad clínica no ve el diagnóstico, quien envía no acepta su propia canalización, quien mide un territorio no cuenta los de otro |
| El territorio se comprueba en toda decisión de expediente | El control `C-F6-01` recorre el módulo y exige que el recurso se arme con `recursoDelExpediente` o declare su ruta. Encontró cinco decisiones sin territorio (`D-F6-004`) en la misma sesión en que se escribieron |
| La interfaz se revisó en móvil y en escritorio | Las 284 pruebas de extremo a extremo corren en los dos perfiles de `playwright.config.ts` —Pixel 7 y escritorio de 1280 px— |
| La accesibilidad se validó, no se declaró | `tests/a11y` recorre las rutas públicas y las pantallas con sesión, en tema claro y oscuro, con umbral de **cero violaciones críticas o serias** |
| Los estados vacíos y de error están terminados | Cada pantalla nueva declara su estado vacío con texto propio y su denegación: «no coordinas ninguna área», «no hay expedientes abiertos en esta área», «este expediente no se ha canalizado a ningún sitio» |
| La auditoría está conectada | El criterio `F6-QA-004` lee las tres cosas sensibles que la fase abre y comprueba los tres asientos, con actor e instante |
| No hay secretos ni datos reales en el repositorio | `C-REPO-04` y `C-ENV-02` |
| La prohibición del proveedor vetado se sostiene | `C-REPO-03`, sobre código, dependencias y documentación |

---

## Pruebas y resultados

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | Sin errores |
| `npm run lint` | Sin errores ni avisos |
| `npm run phase:verify` | **68 aprobados, 0 fallidos**, 1 no aplicable |
| `npx vitest run` | **1 167 pruebas en 74 archivos**, todas en verde |
| `npm run build` | Compila; ninguna ruta de casos es estática |
| `npx playwright test` | **284 pruebas**, 8 omitidas por diseño |
| `npm run db:check` | La base configurada coincide con las migraciones del repositorio |
| Integración continua | Verde en cada bloque, comprobado en GitHub Actions antes de dar por cerrado ninguno |

---

## Historial de fases

| Fase | Inicio | Cierre | Estado | SHA del punto de control |
|---|---|---|---|---|
| 0 | 2026-09-03 | 2026-09-03 | `APPROVED` | `7fecd6f873c8068101478da2179d6d5a6bc17c29` |
| 1 | 2026-09-03 | 2026-09-04 | `APPROVED` | `e8daa0e` (el cierre previo `ac23003` fue revocado) |
| 2 | 2026-09-04 | 2026-09-04 | `APPROVED` | `0fedf6f` |
| 3 | 2026-09-04 | 2026-09-04 | `APPROVED` | `85cf196` |
| 4 | 2026-09-04 | 2026-09-05 | `APPROVED` | `cadebbd` (cerrada primero en `038297d`, reabierta el mismo día por la corrección de alcance de CIAN y CENI) |
| 5 | 2026-09-05 | 2026-09-06 | `APPROVED` | `6c5b18c` |
| 6 | 2026-09-06 | 2026-09-06 | `APPROVED` | `6f31d88` (cerrada primero en `a7e8031`, reabierta el mismo día por `D-F6-006`) |
| 7 a 10 | — | — | No iniciadas | — |

---


# Archivo — registro completo de la Fase 5

> Estructura territorial, gobierno, asambleas y elecciones. Cerrada el 6 de septiembre de 2026 en `6c5b18c`.

## Situación actual

- **Fase activa:** 5 — Estructura territorial, gobierno, asambleas y elecciones
- **Estado:** `APPROVED`
- **Autorizada por la persona usuaria:** 5 de septiembre de 2026
- **Fecha de inicio:** 5 de septiembre de 2026
- **Fecha de cierre:** 6 de septiembre de 2026
- **SHA del punto de control:** `123cd0c`
- **Fase anterior:** 4 — `APPROVED`, cerrada en `cadebbd`. Su registro íntegro se conserva en el **Archivo** al final de este documento.
- **Fase siguiente:** 6 — Defensa, casos, protección y canalización social, **autorizada por la persona usuaria** junto con esta, y que **no se inicia hasta que la Fase 5 esté aprobada** (PRD §23.3)

---

## Alcance contratado

El PRD §24 Fase 5 contrata: unidades territoriales; secciones, delegaciones y representaciones; órganos y cargos; periodos, suplencias y poderes; convocatorias; asambleas; padrón congelado; asistencia y quórum; orden del día, resoluciones y actas; seguimiento de acuerdos; Comisión Electoral; planillas, candidaturas y elecciones; voto secreto; control de proporcionalidad de género; Comisión de Vigilancia; contratos colectivos, revisión contractual y consultas; expedientes de conflicto colectivo y huelga; régimen disciplinario; archivo histórico; y reportes para autoridad competente.

**Qué cierra esta fase.** La Fase 4 dejó dicho en el dato quién vota —`grantsPoliticalRights` y `countsForQuorum`— y no lo usó para nada. Aquí se usa: el padrón congelado sale de ahí, el quórum se calcula sobre él y la elegibilidad electoral se deriva de la misma columna. También aquí aparecen las entidades que la Fase 4 dejó esperando: `OfficeTerm`, al que apuntan `ApplicationReview.reviewerOfficeTermId` y `MemberCredential.officeTermId`, y `Resolution`, que habilita las cuotas extraordinarias del catálogo financiero.

**La garantía que gobierna la fase.** El voto es secreto y esa promesa se sostiene en el esquema, no en la interfaz: la credencial de voto se firma y se entrega, y **no se almacena al emitirse**; la urna no tiene identidad, ni columna temporal, ni identificador ordenable en el tiempo (ADR-0012). Nadie con acceso total a la base puede reconstruir quién votó qué.

---

## Bloques de trabajo

| Bloque | Contenido | Estado |
|---|---|---|
| A | Esquema y migración de gobierno, territorio, votación, negociación y disciplina | Completado |
| B | Territorio: unidades, jerarquía y panel territorial | Completado |
| C | Órganos, cargos, periodos, poderes e incompatibilidades | Completado |
| D | Convocatorias, asambleas y padrón congelado | Completado |
| E | Asistencia y quórum | Completado |
| F | Resoluciones, actas y seguimiento de acuerdos | Completado |
| G | Comisión Electoral, padrón electoral y planillas | Completado |
| H | Voto secreto, escrutinio, acta e incidencias | Completado |
| I | Negociación colectiva, consulta y huelga | Completado |
| J | Régimen disciplinario | Completado |
| K | Archivo histórico y reportes ante autoridad | Completado |
| L | Pruebas, controles de fase, documentación y cierre | Completado |

---

## Criterios de aceptación

Criterios específicos del PRD §24 Fase 5, comprobados **ejecutando el sistema** y mirando después lo que quedó en la base con las credenciales de la aplicación, nunca leyendo el código:

| # | Criterio | Estado | Cómo se comprobó |
|---|---|---|---|
| 1 | El quórum es reproducible desde el padrón congelado (`F5-QA-001`) | **Cumplido** | `fase5-criterios` congela un padrón de cinco, añade dos personas después y comprueba que la base del cálculo sigue siendo cinco; recalcula la huella desde las entradas y coincide con la guardada; y el `UPDATE` sobre el padrón congelado se rechaza con las credenciales de la aplicación |
| 2 | El voto emitido no puede asociarse con su sentido desde la base operativa (`F5-QA-002`) | **Cumplido** | Tres personas depositan sentidos distintos —el volumen bajo es deliberado— y sobre la base en crudo se comprueba que `ballot` solo tiene `id`, `selection`, `verificationCode`, `voteProcessId` y el motivo de nulidad: ni identidad, ni columna temporal; que sus identificadores son UUIDv4, que no codifican el instante; que la credencial no deposita dos veces; que el escrutinio publica códigos sin sentido; y que `UPDATE` y `DELETE` sobre una boleta se rechazan |
| 3 | Un cargo vencido pierde el acceso sin que nadie intervenga (`F5-QA-003`) | **Cumplido** | Un cargo de un mes se nombra noventa días atrás; el trabajo programado lo barre con su actor de sistema y, después, el contexto que el sistema construye para esa persona ya no lleva el permiso del cargo. También se comprueba lo contrario: mientras el periodo vive, la facultad que declara el cargo sí llega al contexto |

---

## Defectos abiertos

**Ninguno.** Los diez detectados durante la fase están corregidos y cada corrección lleva su control o su prueba.

> **Cómo se lee esta tabla.** La última celda cuenta **cómo se corrigió** el defecto. Un defecto todavía abierto la deja
> vacía o la empieza con `Abierto`. `npm run phase:verify` lo lee así: una celda en blanco es un defecto abierto, no un
> defecto sin documentar, y con uno abierto de severidad bloqueante la fase no puede declararse `APPROVED`.

| Id | Severidad | Descripción | Estado y corrección |
|---|---|---|---|
| D-F5-001 | Alta | Las tres entidades de documentos institucionales estaban contratadas para la Fase 4 y no se construyeron | Corregido. Se construyen al abrir la Fase 5, que es donde primero hacen falta: sin plantilla publicada no se emite una convocatoria |
| D-F5-002 | Media | `SignatureRecord` nombraba el cargo con el que se firmaba sin apuntar a ningún periodo: quien firmó «como Secretaría General» no podía comprobarse | Corregido con la relación `signerOfficeTerm` y su clave ajena |
| D-F5-003 | Media | Un mismo padrón congelado podía tener dos dueños porque asamblea y elección apuntaban a él por separado | Corregido: el padrón declara su dueño (`ownerKind`) con dos referencias únicas y un `CHECK` de coherencia |
| D-F5-004 | Alta | `appointOffice` creaba el ámbito territorial del nombramiento con el nombre de relación equivocado: nombrar con territorio fallaba siempre | Corregido. Lo encontró la prueba de integración de los criterios, que es la primera que nombró de verdad |
| D-F5-005 | Alta | Declarar quórum y certificar un escrutinio exigen motivo en el catálogo, y sus acciones de servidor no lo adjuntaban: dos botones que siempre respondían «no tienes autorización» | Corregido en las tres acciones. Control `C-F5-08`, probado rompiéndolo |
| D-F5-006 | Alta | `TRUNCATE ... CASCADE` en la limpieza entre casos del catálogo financiero dejó de estar acotado en cuanto el territorio pasó a nacer de una resolución: el grafo de claves ajenas se cerró en ciclo y la orden vaciaba la base entera, semilla incluida | Corregido con borrados acotados. Control `C-F5-09`, probado rompiéndolo |
| D-F5-007 | Media | El cargador de entorno marca `__NEXT_PROCESSED_ENV` y el proceso hijo la heredaba: la prueba del archivo de entorno pasaba aislada y fallaba en la ejecución completa | Corregido retirando la marca del entorno del hijo |
| D-F5-008 | Alta | Un cargo no confería sus facultades: `OfficeDefinitionPermission` se escribía al definirlo y no la leía nadie. Un cargo con cartera que no abría ninguna puerta | Corregido en el resolvedor de actores y en la sonda de pruebas. Comprobado en `fase5-criterios`: la facultad llega con el cargo y se va con él |
| D-F5-009 | Alta | El módulo disciplinario entero era inalcanzable: sus permisos exigen asignación y ninguno de los siete casos de uso aportaba la sonda que la comprueba | Corregido. La asignación es tener cargo vivo en el órgano instructor; la lista de quien no instruye sale vacía, no prohibida. Control `C-F5-10` y prueba `discipline-due-process` |
| D-F5-010 | Media | Accesibilidad: la tabla que se desplaza no era alcanzable con el teclado, y dos formularios en la misma pantalla compartían los identificadores de sus campos | Corregido en las primitivas. `ScrollableTable` es región enfocable con nombre obligatorio; los campos admiten identificador propio. Lo encontró la revisión con axe de las quince pantallas institucionales, ahora en la suite |

---

## Tareas completadas

- **A.** Esquema institucional en dieciséis archivos Prisma, migración correctiva verificada desde cero y sobre base actualizada, y cuarenta y siete permisos nuevos con su reparto por rol.
- **B.** Unidades territoriales con ruta materializada e índice de prefijo (ADR-0027), panel territorial de agregados y disolución que se niega mientras quede vida dentro.
- **C.** Órganos, cargos con sus facultades, periodos, suplencias, poderes que no sobreviven al cargo que los otorgó, e incompatibilidades.
- **D.** Convocatorias con la anticipación que fija el estatuto, orden del día con la mayoría deducida del tipo de punto, y padrón congelado con su huella.
- **E.** Asistencia que copia voz y voto del padrón congelado, cálculo de quórum y declaración que se niega sobre un padrón que no se puede comprobar.
- **F.** Resoluciones con resultado leído del escrutinio, actas en su versión reservada y su versión publicable, y seguimiento de acuerdos con evidencia.
- **G.** Comisión Electoral instalada antes de la convocatoria, padrón electoral propio, planillas con control de proporcionalidad de género que **alerta y no decide**.
- **H.** Voto secreto conforme al ADR-0012, escrutinio, acta de resultados y expediente de evidencia sin una sola boleta dentro.
- **I.** Contratos colectivos, revisión contractual, consultas con su propio padrón congelado y expedientes de huelga que exigen acuerdo humano aprobado por las dos vías.
- **J.** Régimen disciplinario con debido proceso comprobable: sin notificación y sin audiencia —o su renuncia expresa— no hay resolución, y ninguna automatización interviene.
- **K.** Archivo histórico y obligaciones ante autoridad competente.
- **L.** Treinta y nueve pruebas unitarias de las piezas puras, dos suites de integración nuevas —criterios de fase y debido proceso disciplinario—, veintiséis comprobaciones de accesibilidad sobre las pantallas institucionales, y diez controles de fase, cada uno probado rompiendo lo que vigila.

---

# Archivo — registro completo de la Fase 4

> Afiliación, padrones, directorios y credenciales. Cerrada el 5 de septiembre de 2026 en `cadebbd`, tras una reapertura el mismo día por la corrección de alcance de CIAN y CENI.

## Situación actual

- **Fase activa:** 4 — Afiliación, padrones, directorios y credenciales
- **Estado:** `APPROVED`
- **Autorizada por la persona usuaria:** 4 de septiembre de 2026
- **Fecha de inicio:** 4 de septiembre de 2026
- **Cierre previo:** 5 de septiembre de 2026 en `038297d`, **reabierto** el mismo día por la corrección de alcance de CIAN y CENI (véase «Corrección de alcance» más abajo)
- **Fecha de cierre:** 5 de septiembre de 2026, con la corrección de alcance ya aplicada
- **SHA del punto de control:** `cadebbd`
- **Fase anterior:** 3 — `APPROVED`, cerrada en `85cf196`. Su registro íntegro se conserva en el **Archivo** al final de este documento.
- **Fase siguiente:** 5 — Estructura territorial, gobierno, asambleas y elecciones, **no autorizada** hasta que la persona usuaria lo indique expresamente (PRD §23.3)

---

## Alcance contratado

El PRD §24 Fase 4 contrata: registro maestro de persona; solicitud de agremiado; afiliación honoraria activa; alta de beneficiario protegido; relaciones familiares y de cuidado; revisión y resolución; documentación; pagos y activación; membresías y vigencias; bajas, suspensiones y conversiones; padrón sindical; padrón honorario; padrón protegido; directorio interno; directorio público opt-in; preferencias de indexación; credenciales y QR; preparación de altas y bajas para obligaciones laborales; y panel personal moderno.

**Qué cierra esta fase.** La Fase 3 dejó resuelto el dinero y deliberadamente sin conectar los derechos: `Subscription.membershipId` y `Payment.appliesToKind` quedaron declarados y sin escribir. Aquí se escriben. Una membresía se activa cuando un webhook firmado confirma el cobro, nunca antes y nunca desde el regreso del navegador.

**Lo que esta fase deliberadamente no hace.** No convoca asambleas ni celebra elecciones: eso es la Fase 5. Lo que sí hace es dejar dicho, en el propio dato, quién vota y quién no —`MembershipType.grantsPoliticalRights` y `countsForQuorum`—, de modo que la fase siguiente lea una respuesta en vez de inventarla. Tampoco abre expedientes de caso: un beneficiario protegido se da de alta aquí con su origen, su necesidad inicial y su nivel de urgencia, y la atención empieza en la Fase 6.

**Lo que no se inventa.** No se siembra ninguna cuota ni ningún importe: el catálogo se administra desde la pantalla de finanzas (ADR-0040). Los tipos de membresía sí se siembran, porque son estructura estatutaria y no dinero: qué calidades existen, cuál concede derechos políticos y cuál no. Ninguno lleva precio.

---

## Criterios de aceptación

Criterios específicos del PRD §24 Fase 4:

| # | Criterio | Estado | Cómo se comprobó |
|---|---|---|---|
| 1 | Una misma persona puede tener varias relaciones sin duplicarse | **Cumplido** | `fase4-criterios` lleva a una misma persona a ser beneficiaria, honoraria, cuidadora y titular de credencial: cuatro relaciones, una fila de persona, sin fusión de por medio (`F4-QA-001`) |
| 2 | Un beneficiario recibe atención sin afiliación ni pago | **Cumplido** | Un alta protegida sin membresía, sin solicitud y sin un solo cobro asociado; y afiliarse después **no** cierra la atención |
| 3 | Un afiliado honorario nunca obtiene voto por error | **Cumplido** | Probado en los cuatro sitios donde podría colarse: la comprobación de la base rechaza derechos políticos, quórum y padrón ante la autoridad en una calidad honoraria —también al crear una nueva—, el padrón sindical no la trae y su rol no tiene ninguna facultad electoral (`F4-QA-002`) |
| 4 | Solo agremiados elegibles aparecen en el padrón sindical correspondiente | **Cumplido** | `rosters` prueba los tres padrones por separado y el filtro de elegibilidad; el criterio se vuelve a comprobar de extremo a extremo en `fase4-criterios` |
| 5 | Retirar consentimiento elimina la publicación pública y la indexación controlada | **Cumplido** | `directory` comprueba que la ficha deja de servirse, sale del listado, deja de ser indexable y que las direcciones afectadas se devuelven para invalidar la caché (ADR-0087) |
| 6 | Una credencial revocada se refleja inmediatamente en el verificador | **Cumplido** | `credentials` verifica el mismo código antes y después de revocar, sin ningún trabajo de por medio. El estado se deriva al leer (ADR-0092) y los controles `C-F4-01` y `C-F4-02` impiden que vuelva a guardarse o a cachearse |
| 7 | Todos los estados y transiciones están auditados | **Cumplido** | El ciclo completo deja los cinco asientos —enviada, tomada, aprobada, activada, credencial emitida— y su `MembershipStatusEvent`, que es inmutable por privilegios de columna |

---

## Tareas completadas

Las veinticuatro tareas de la Fase 4 del backlog, de `F4-DAT-001` a `F4-DOC-001`. El detalle vive en la sección **Fase 4** de [`BACKLOG.md`](BACKLOG.md).

---

## Evidencias

| Qué se afirma | Cómo se comprobó |
|---|---|
| Las migraciones funcionan desde cero | Cada archivo de pruebas de integración crea una base efímera y aplica las **dieciséis** migraciones en orden sobre un esquema vacío. No es una comprobación aparte: es la única forma en que corren las 613 pruebas |
| Las migraciones funcionan desde la fase anterior | La base de desarrollo viene de la Fase 3 y recibió las cuatro migraciones nuevas de esta fase con `migrate deploy`, sin reconstruirse. Es la base sobre la que se hicieron todos los recorridos en navegador |
| Los permisos se prueban en positivo y en negativo | Cada suite de la fase incluye su prueba de denegación: quien no tiene la facultad no lee el padrón, no revoca una credencial ajena, no descarga la credencial de otra persona, no lee los consentimientos de otra, no exporta el directorio. `C-F1-05` comprueba que existen |
| La interfaz se revisó en móvil y en escritorio | Las 232 pruebas de extremo a extremo corren en los dos perfiles de `playwright.config.ts` —Pixel 7 y escritorio de 1280 px—, incluidas las 38 pantallas con sesión de esta fase |
| La accesibilidad se validó, no se declaró | `tests/a11y` recorre 12 rutas públicas y 19 pantallas con sesión, en tema claro y oscuro, con umbral de **cero violaciones críticas o serias**. Encontró `D-F4-021`, que ninguna otra puerta veía |
| Los estados vacíos y de error están terminados | Cada pantalla nueva declara su estado vacío con texto propio —no un guion— y su denegación. El recorrido en navegador de cada bloque los atravesó |
| La auditoría está conectada | El ciclo completo deja asiento de cada acto; `C-F1-11` comprueba además que ningún permiso exigido en código se quede sin titular posible |
| No hay secretos ni datos reales en el repositorio | `C-REPO-04` y `C-ENV-02`. La contraseña de las cuentas de prueba se genera en cada corrida y viaja por el entorno del proceso, nunca por un archivo |
| La prohibición del proveedor vetado se sostiene | `C-REPO-03`, sobre código, dependencias y documentación |
| Cada pantalla se abrió de verdad en un navegador | Cinco recorridos guiados en Chromium —bloques D, E, G, H, I y J—, que encontraron ocho de los defectos de la fase. Ninguno lo veían los tipos, el linter ni las pruebas de dominio |

---

## Pruebas y resultados

| Puerta | Resultado |
|---|---|
| `npx tsc --noEmit` | Sin errores, con `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes` |
| `npm run lint` | Sin errores ni avisos |
| `npm test` (unitarias) | 20 archivos · **335 pruebas** |
| `npm run test:integration` | 35 archivos · **613 pruebas** |
| `npm run test:e2e` | **232 pruebas** en los dos perfiles, 8 omitidas por referencia visual ausente |
| `npm run build` | Compila y genera las 82 rutas del mapa |
| `npm run phase:verify` | **53 controles aprobados, 0 fallidos**, 1 no aplicable |

Los cuatro controles nuevos de la fase —`C-F4-01` a `C-F4-04`— se comprobaron **viéndolos fallar** contra el código que causó cada defecto. Uno de ellos, `C-F4-03`, aprobó en su primera versión con el defecto delante: se reescribió hasta que señaló la línea exacta.

---

## Defectos abiertos

**Ninguno abierto.** Los veintidós que aparecieron durante la construcción se corrigieron dentro de la fase, como exige el PRD §0 punto 6, y quedan registrados porque cada uno enseñó algo. Ocho los encontró abrir la pantalla en un navegador; tres, un control de fase; dos, la suite de accesibilidad al extenderse; uno, el propio registro del servidor; y el último, comprobar que el verificador supiera ver un defecto abierto.

> **Cómo se lee esta tabla.** La última celda cuenta **cómo se corrigió** el defecto. Un defecto todavía abierto la deja
> vacía o la empieza con `Abierto`. `npm run phase:verify` lo lee así: una celda en blanco es un defecto abierto, no un
> defecto sin documentar, y con uno abierto de severidad bloqueante la fase no puede declararse `APPROVED`.

| Id | Severidad | Descripción | Estado y corrección |
|---|---|---|---|
| `D-F4-001` | Alta | La semilla deja el aviso de privacidad de la entrada pública en borrador y **no existe ninguna pantalla ni caso de uso que lo publique**. El formulario público de contacto exige uno publicado, así que en cualquier instalación real falla siempre; solo la prueba de integración lo publica, con una escritura directa. Viene de la Fase 2 | Corregido. Administración de versiones de aviso y consentimiento en `/gestion/consentimientos`: redactar, publicar —lo que retira la versión anterior en el mismo acto— y retirar con motivo. La semilla sigue dejándolos en borrador a propósito: un texto legal lo publica quien responde de él, no una migración |
| `D-F4-002` | Alta | `ACTIVE_PHASE` seguía en `1` desde la Fase 1. La Fase 3 cerró sin subirlo, de modo que las seis variables de Stripe nunca pasaron a ser obligatorias: una instalación productiva arrancaba con las claves vacías y lo descubría en el primer cobro | Corregido. `ACTIVE_PHASE = 4`, con los valores de prueba declarados en la integración continua y en la preparación de las pruebas. `ENVIRONMENT.md` §11 dice ahora que la constante se sube **al abrir** cada fase, no al cerrarla |
| `D-F4-003` | Alta | `identity.user.disable` estaba declarado desde la Fase 1 sin titular, sin caso de uso y sin pantalla: una cuenta invitada por error o la de quien dejó la organización no se podía cerrar desde ninguna parte | Corregido. `disableAccount` y `reenableAccount`, con titular `EXECUTIVE_SECRETARY` —quien invita, cierra— y pantalla en `/gestion/personas` (ADR-0072) |
| `D-F4-005` | Alta | Tras avisar de una posible duplicidad, el formulario aparecía **en blanco**: React vacía los campos de un formulario al terminar una acción, así que quien acababa de teclear quince campos los perdía justo en el momento en que se le pedía revisarlos y volver a enviar | Corregido. La acción devuelve lo escrito y el formulario lo repinta; hizo falta además una clave de remontaje, porque un `defaultValue` solo se aplica al montar y cambiarlo después no repinta nada. Encontrado conduciendo la pantalla en un navegador real |
| `D-F4-006` | Media | Fusionar dos registros funcionaba y **no lo decía**: el aviso de éxito vivía dentro de la lista de candidatas, y una fusión correcta deja esa lista vacía. La pantalla cambiaba sola y quien acababa de fusionar no sabía si lo había hecho | Corregido. El aviso se pinta fuera de la lista. La regla que queda: un mensaje de resultado nunca va dentro de la rama que la propia acción hace desaparecer |
| `D-F4-007` | Alta | `authorizeDownload` existía desde la Fase 1 y **no lo invocaba nadie**: la ruta de descarga exige un pase firmado y ninguna pantalla lo emitía, así que ningún archivo guardado se podía abrir. No se notaba porque hasta esta fase nada subía archivos desde una pantalla | Corregido con una ruta que emite el pase y redirige, enlazada desde los documentos de la solicitud |
| `D-F4-008` | Alta | El almacén de archivos llamaba a Vercel Blob directamente, sin puerto ni adaptador. Sin un token real la subida **se queda colgada**, en desarrollo y en la integración continua por igual; las pruebas de la Fase 1 lo esquivaban insertando las filas a mano, de modo que una prueba que no podía fallar acompañaba a un código que nadie había ejecutado | Corregido con `BlobStorePort` y dos adaptadores, como el correo y la pasarela (ADR-0076). El adaptador de memoria se declara como tal y el panel de salud lo dice. Lo destapó la primera prueba que subió un archivo de verdad |
| `D-F4-009` | Alta | `consent.grant` solo lo tenía el personal de atención social y `consent.revoke` **no lo tenía nadie**: ninguna persona podía aceptar la publicación de sus propios datos ni retirarla después, y la pantalla de retiro no habría podido usarla ningún titular. Además, exigir siempre una relación de cuidado para consentir por otra persona dejaba inservible el medio «papel firmado» con cualquier persona adulta capaz | Corregido. Parejas `consent.grant_own` · `consent.revoke_own` repartidas a los roles que hablan por sí mismos, facultad institucional para la Secretaría Ejecutiva y la atención social, y tres caminos honestos en `grantConsent` (ADR-0077). El control `C-F1-11` impide la recaída: comprueba que todo permiso exigido por una llamada a `can` tenga titular posible, y se verificó viéndolo fallar con `consent.revoke` y con `identity.user.disable` |
| `D-F4-010` | Alta | La pantalla de avisos y consentimientos devolvía **500**: el componente de servidor importaba la lista de propósitos declarada dentro de un archivo `'use client'`. En el servidor eso no es un arreglo sino una referencia al cliente, así que el `.map` reventaba. Los tipos pasaban, el linter callaba y las pruebas de integración no tocan la pantalla | Corregido. La lista vive en `etiquetas.ts`, un módulo sin directiva que importan las dos orillas —además estaba duplicada en la acción del servidor—. El control `C-F2-07` impide la recaída y se comprobó viéndolo fallar con el código anterior |
| `D-F4-011` | Media | El expediente de una atención protegida **nunca podía enseñar la necesidad inicial**: leía la fila del padrón, que la oculta con privacidad reforzada, y en su lugar proponía bajar la privacidad para leer lo que quien abre el expediente ya tiene derecho a ver. Además buscaba la fila entre las doscientas del padrón, así que habría dejado de encontrar expedientes al crecer | Corregido con `beneficiaryDetail`, que lee esa atención y solo esa. Ocultar en la lista y mostrar en el expediente son reglas distintas; y abrir un expediente reforzado deja asiento en la bitácora, que es lo que «controles reforzados de privacidad» (PRD §3.4) significa cuando se traduce a algo comprobable |
| `D-F4-012` | Alta | La pantalla de una solicitud devolvía **500**: el módulo de acciones marcado `'use server'` exportaba, además de sus acciones, una constante con el estado inicial del formulario. Next lo rechaza en ejecución —«a "use server" file can only export async functions»—. Los tipos pasaban, el linter callaba y la compilación de producción terminaba en verde | Corregido quitando la constante del módulo de acciones. El control `C-F2-08` impide la recaída y se comprobó viéndolo fallar con el código anterior. Es la misma frontera de `C-F2-07` mirada desde el otro lado |
| `D-F4-013` | Media | Al contestar una aclaración, el formulario desaparecía —ya no hay nada que contestar— y con él el aviso de «recibimos tu respuesta». Quien acababa de escribir media página no leía en ninguna parte que hubiera llegado. La misma forma de `D-F4-006`, ahora del lado de quien solicita | Corregido con un acuse que vive **fuera** del formulario, en el estado de la solicitud, y sobrevive a recargar la página (ADR-0074). En la pantalla de revisión se añadió por lo mismo la línea de quién tiene tomada la solicitud |
| `D-F4-014` | Alta | Activar una membresía escribía la fila del padrón y nada más: la persona quedaba **agremiada en los datos y aspirante para el motor de permisos**. No podía leer su propia membresía, ni decidir sobre su ficha del directorio, ni ver su credencial. Ninguna prueba de dominio lo veía —todas construyen el contexto del actor con los roles ya puestos—; lo destapó abrir `/mi/directorio` en un navegador y leer «No tienes autorización para realizar esta acción» | Corregido. La activación concede el rol de la calidad y el fin de la membresía lo retira, en la misma transacción y con el otorgante que firmó la resolución (ADR-0088). Retirar es condicional: si otra membresía viva sostiene la calidad, el rol se queda. Cinco pruebas nuevas en `membership-lifecycle`, comprobadas viéndolas fallar las cinco con la sincronización desactivada, y el recorrido completo en Chromium: solicitar, aprobar, aparecer, retirar y dar de baja |
| `D-F4-015` | Media | Al retirar la ficha del directorio, la sección «Retirar mi ficha» desaparecía —ya no queda nada que retirar— y con ella el acuse. Quien acababa de ejercer su derecho leía «No apareces en el directorio público», que es exactamente lo que lee quien **nunca autorizó nada**: la pantalla no distinguía las dos situaciones. Tercera aparición de la misma forma, después de `D-F4-006` y `D-F4-013` | Corregido. El acuse se deriva del hecho —la fecha de retiro de la última ficha— y se pinta fuera de la sección condicional (ADR-0089), así que sobrevive a recargar y a volver mañana. La prueba de integración cubre que el dato esté; que la pantalla lo enseñe se comprobó en Chromium, viéndolo fallar antes de la corrección |
| `D-F4-016` | Media | El directorio interno identificaba cada fila por la persona, pero **la fila es una membresía**: quien sostiene dos calidades ocupa dos filas, y React recibía dos hijos con la misma clave —puede duplicar una y omitir la otra—. Salió en la consola del navegador durante el recorrido del bloque, con dos avisos que ninguna prueba de dominio produce | Corregido usando el número de miembro, que es único por membresía y es justo lo que la fila muestra. La prueba de integración fija la premisa que lo hacía posible: una misma persona devuelve dos filas, con número y calidad distintos |
| `D-F4-017` | Media | Quien tenía cuenta y todavía no membresía abría «Mi credencial» y leía **«No tienes autorización para realizar esta acción»**: `credentialing.credential.read_own` no lo tenía `APPLICANT`. La verdad era que aún no tenía ninguna credencial, y la pantalla lo decía como si la organización se lo negara. Además el portal ofrecía la pestaña a todo el mundo, así que llevaba a la puerta cerrada. Segunda aparición de la forma de `D-F4-009` | Corregido en dos mitades (ADR-0094): la facultad sobre lo propio pasa a `APPLICANT` —quien solicita merece leer «se emite al activarse tu membresía»— y el portal filtra sus secciones por la facultad que las abre, igual que el área de gestión desde la Fase 1. Lo destapó abrir la pantalla en un navegador |
| `D-F4-018` | Media | En la credencial impresa, la línea «Verifica en …» se salía por el borde derecho: iba centrada bajo el QR y el SVG no ajusta ni recorta. Lo que se perdía era precisamente la dirección que alguien tendría que teclear. Un nombre largo se habría metido dentro del recuadro del QR por la misma razón | Corregido. La dirección baja a la columna de texto, alineada a la izquierda, y toda línea que puede crecer se comprime con `textLength` cuando no cabe —y solo cuando no cabe— (ADR-0091). Dos pruebas nuevas fijan que ningún texto entra en la zona del QR. Se vio dibujando las cuatro tarjetas y mirándolas: ni los tipos ni las pruebas de dominio ven un texto que se sale |
| `D-F4-019` | **Alta** | `personConsents` recibía el identificador de la persona **por parámetro** y decidía con una sola facultad, `consent.read`, que tenían tanto la Secretaría como cualquier agremiada: bastaba con pedir el identificador de otra para leer su historial completo de consentimientos —para qué autorizó el tratamiento de sus datos, cuándo lo retiró, con qué texto—. Lo destapó una sonda escrita al preparar la pantalla de consentimientos de la persona, no una prueba existente: todas pasaban el identificador de quien preguntaba. La matriz de `PERMISSIONS.md` §4 **siempre dijo `O`** —solo sobre lo propio— para los roles personales: lo que se había separado del contrato eran el catálogo y la semilla | Corregido separando la pareja `consent.read` · `consent.read_own`, como ya estaba separada para otorgar y revocar (ADR-0096). Quien representa con una relación viva también lee. El control `C-F4-03` impide la recaída y se comprobó **dos veces**: la primera versión daba verde con el defecto delante —recortaba la firma en la primera llave, y `input: { personId: string }` lleva una llave dentro de los parámetros—, así que se reescribió contando paréntesis |
| `D-F4-020` | Baja | El enrutador animaba el desplazamiento en **cada cambio de ruta**: la hoja de estilos declara desplazamiento suave y Next necesita `data-scroll-behavior="smooth"` en `<html>` para desactivarlo durante las transiciones. En una plataforma para personas neurodivergentes, el movimiento involuntario es justo lo que el PRD §5.2 manda poder controlar. Lo dijo el propio servidor de desarrollo en su registro; ninguna prueba lo mira | Corregido declarando el atributo. La preferencia de movimiento reducido sigue ganando por encima de todo |
| `D-F4-021` | Media | Dos pantallas de afiliación pedían `--color-on-accent`, un token que **nunca se declaró**. Un `var()` roto no falla: la propiedad se queda sin valor y el navegador hereda lo que hubiera, así que el texto del botón principal salía en tinta oscura sobre el índigo del acento. Contraste insuficiente en el llamado a la acción más importante de la pantalla, invisible para los tipos, el linter y toda prueba de dominio | Corregido usando `--color-ink-inverse`, que es el token que existe. Lo destapó la suite de accesibilidad al extenderse a las pantallas con sesión. El control `C-F4-04` lo caza antes y sin levantar un navegador: comprueba que todo token que una pantalla pide esté declarado en la hoja de estilos. Se verificó viéndolo fallar |
| `D-F4-022` | **Alta** | `C-COH-06` y `C-COH-07` llevaban desde la Fase 0 **dando verde sin mirar**. El lector de defectos exigía que la última celda de la fila dijera literalmente `Abierto` o `Cerrado`; ninguna de las 81 filas del documento lo dice, de modo que devolvía la lista vacía y los dos controles aprobaban sobre cero defectos. La misma forma que `D-F4-019` enseñó con `C-F4-03`: un control que aprueba sin leer es peor que no tenerlo. Lo destapó comprobar, al cerrar esta corrección de alcance, que el verificador **detectara** un defecto abierto | Corregido. El lector usa la forma que el documento tiene de verdad —identificador entre acentos graves, severidad, y la corrección en la última celda— y la regla se invierte: abierto es la celda vacía o la que empieza con `Abierto`, `Pendiente` o `Sin corregir`. `Bloqueante` se añade a las severidades que impiden aprobar. Comprobado viéndolo fallar en sus dos formas: con la celda diciendo `Abierto` y con la celda en blanco, y viéndolo pasar de 0 a 14 defectos leídos al arreglar el lector |
| `D-F4-004` | Media | `identity.person.merge` tampoco lo tenía ningún rol: la pantalla de fusión de duplicados no la habría podido usar nadie. Lo detectó una prueba de integración al fallar con `FORBIDDEN` | Corregido. Lo recibe `EXECUTIVE_SECRETARY`, que es quien lleva el padrón, y la matriz de `PERMISSIONS.md` §4 registra la fila que le faltaba |

---

## Decisiones

Las decisiones de esta fase se registran en [`DECISIONS.md`](DECISIONS.md), de ADR-0064 a ADR-0096.

Las que gobiernan lo construido aquí, en una línea cada una:

- **ADR-0074** · El acuse vive fuera del formulario que la acción se lleva por delante. Apareció tres veces —`D-F4-006`, `D-F4-013`, `D-F4-015`— y acabó como regla en ADR-0089.
- **ADR-0080** · Un plazo vencido hace visible una situación; no decide sobre nadie. El trabajo recuerda una vez y no rechaza.
- **ADR-0082** · Un cobro confirmado anuncia el hecho por la bandeja de salida; `billing` no llama a `membership`.
- **ADR-0083** · Terminar dice siempre por qué, y vencer no es decidir: `EXPIRY` y `CONVERSION` existen para no disfrazar un vencimiento de decisión de alguien.
- **ADR-0086 · ADR-0087** · El directorio público se deriva de la autorización, y retirarla invalida la caché o no es retirar.
- **ADR-0088** · El rol sigue a la calidad y se va con ella; no es un nombramiento.
- **ADR-0090 · ADR-0091** · La codificación del QR no se escribe a mano; el dibujo sí, y la credencial se compone al pedirla.
- **ADR-0092 · ADR-0093** · La credencial no tiene vida propia: su estado se deriva al leer, y la firma precede a la base sin sustituirla.
- **ADR-0094 · ADR-0096** · Mirar lo propio no es un privilegio del rango, y leer lo propio no es la misma facultad que leer lo ajeno.
- **ADR-0095** · El panel abre con decisiones y calla cuando no hay ninguna.

---

## Informe de cierre (PRD §23.3)

**Qué queda funcionando.** Una persona llega, es identificada sin duplicarse, solicita afiliación —por su cuenta o con alguien capturando a su lado—, adjunta documentación, recibe una revisión humana con plazo si hace falta aclarar algo, y una resolución fundada. Si su calidad tiene cuota, la membresía nace cuando un webhook firmado confirma el cobro; si no la tiene, con la resolución. Al activarse recibe su número de miembro, el rol que su calidad le da y una credencial con QR que cualquiera puede verificar sin sesión. Entra a su panel y ve lo que tiene pendiente, decide si aparece en el directorio público y para qué autoriza el uso de sus datos, y puede retirarlo. La organización lleva tres padrones separados, prepara las altas y bajas ante la autoridad laboral, y todo cambio de estado queda con motivo, actor y fecha.

**Lo que la puerta universal exige, punto por punto** (PRD §23.2):

| Punto | Estado |
|---|---|
| Todo el alcance implementado | Los diecinueve puntos del alcance del PRD §24 Fase 4, en veinticuatro tareas del backlog. El alcance no cambió con la corrección: CIAN y CENI nunca fueron alcance de esta fase, solo anticipos suyos en el esquema |
| Sin defectos críticos, altos o medios abiertos | Ninguno abierto: 22 encontrados, 22 cerrados dentro de la fase. El último, `D-F4-022`, lo destapó comprobar que el propio verificador supiera ver un defecto abierto |
| Sin botones, rutas ni acciones incompletas | `C-REPO-02` y `C-F1-02`; cada pantalla se abrió en un navegador |
| Migraciones desde cero y desde la fase anterior | Las dos, y no como comprobación aparte: la suite de integración exige la primera y la base de desarrollo probó la segunda. La migración correctiva de la corrección de alcance se probó además sobre una base actualizada, desde cero, y **viéndola fallar** con un dato que usaba un valor retirado |
| Permisos positivos y negativos probados | En cada suite de la fase; `C-F1-05` comprueba que existen |
| Interfaz revisada en móvil y escritorio | 232 pruebas en los dos perfiles |
| Accesibilidad validada | 12 rutas públicas y 19 pantallas con sesión, dos temas, cero violaciones críticas o serias |
| Estados vacíos y de error terminados | Cada pantalla nueva los declara con texto propio |
| Auditoría conectada | El ciclo completo deja los cinco asientos y su evento de estado inmutable |
| Documentación refleja el código real | Los diez documentos de `docs/` actualizados, incluidos el PRD y el contrato de fases: once fases 0 a 10, trece flujos E2E, catorce roles, y ninguna promesa de construir CIAN o CENI aquí |
| Lint, tipos, pruebas y compilación | Todo en verde sobre el árbol que se cierra: tipos, lint, 335 unitarias, 613 de integración, 232 de navegador en los dos perfiles, compilación de producción y los 53 controles de `phase:verify` |
| Sin secretos ni datos reales | `C-REPO-04`, `C-ENV-02`; la contraseña de las cuentas de prueba se genera en cada corrida |
| Informe de cierre | Este |

**Lo que la corrección de alcance cambió en este cierre.** La fase se había cerrado el 5 de septiembre en `038297d`. La instrucción de retirar CIAN y CENI del repositorio llegó después y tocaba el contrato de la fase activa, así que la fase volvió a `IN_PROGRESS` y se cierra ahora con la corrección aplicada. **Nada de lo construido se deshizo:** lo que se retiró eran anticipos —valores de enumeración, cinco roles y una columna— que ninguna función de esta fase escribía. El apartado «Corrección de alcance» de este documento lo detalla ámbito por ámbito.

**Lo que esta fase deliberadamente no hace, y no es una omisión.** No convoca asambleas ni celebra elecciones —Fase 5—, pero deja dicho en el dato quién vota: `grantsPoliticalRights` y `countsForQuorum`, con una comprobación de la base que impide que una calidad honoraria los obtenga por error. No abre expedientes de caso —Fase 6—: un beneficiario protegido se da de alta aquí con su origen y su necesidad inicial, y la atención empieza allá.

**Una cosa que queda dicha y no hecha.** El aviso previo al vencimiento de una credencial —«te quedan quince días»— no está construido. No pertenece a `F4-CRE-001`…`004` y el propio contrato de trabajos lo asigna a `reminders`, que tampoco existe todavía. Se corrigió la descripción del trabajo `credential-expiry` en `INTEGRATIONS.md`, que prometía marcar credenciales vencidas: no marca nada, porque el vencimiento se deriva al leer. Quien abra la fase que construya `reminders` encontrará el sitio señalado.

---

## Corrección de alcance · CIAN y CENI son plataformas externas

**Fecha:** 5 de septiembre de 2026. **Instruida por la persona usuaria**, después de que la Fase 4 se cerrara en `038297d`.

**Qué cambió.** CIAN y CENI son plataformas independientes y ya desarrolladas, con su propia autenticación, su propia operación, sus propios pagos y sus propios datos. Este repositorio **no** las construye, no las duplica y no administra su operación. Aparecen exclusivamente como **accesos externos** del ecosistema, con el mismo patrón de ficha que NeuroPlan, ADIA y NEXO: nombre, imagen, descripción breve, público al que se dirige, botón de acceso con indicación accesible de que se abre otra plataforma, y dirección externa **configurable desde el CMS**, nunca escrita en un componente.

**Por qué la fase vuelve a `IN_PROGRESS`.** La instrucción llegó después del cierre y toca el contrato de la fase activa: el modelo de datos, el catálogo de permisos, la semilla de roles y varias pantallas de la Fase 4 llevaban anticipos de CIAN y CENI. Declarar aprobada una fase cuyo alcance acaba de corregirse sería sostener una firma sobre un texto que ya no es el mismo. El cierre previo queda registrado con su SHA; la fase se cierra de nuevo cuando la persona usuaria lo autorice.

**Qué se retiró del repositorio.**

| Ámbito | Qué se retiró |
|---|---|
| PRD | Entidades `Cian*` (11) y `Ceni*` (14) de §18; endpoints `/api/v1/cian/*`, `/api/v1/ceni/*` y `/api/v1/verify/ceni/*`; las fases 8 (CIAN) y 9 (CENI); los casos de uso de IA sobre CIAN y CENI. §13 y §14 se reescribieron como «plataforma del ecosistema», con la lista expresa de lo que Fuerza Índigo **no** hace |
| Fases | El proyecto pasa de trece a **once fases, 0 a 10**. La 7 se reescribe como «Plataformas y herramientas del ecosistema»; 10, 11 y 12 se renumeran a 8, 9 y 10 |
| Modelo de datos | `ToolDefinition`, `ToolPlan`, `ToolEntitlement`, `ToolLaunch` y `ExternalIdentityLink` se sustituyen por una sola entidad de catálogo, `EcosystemLink`: ficha y dirección de acceso, sin derechos, sin lanzamientos y sin vínculo de identidad |
| Esquema | **26 valores de enumeración retirados** en once tipos: 5 de `RoleCode`, `Compartment.CLINICAL`, `FileClassification.CLINICAL`, `FileContextKind.CIAN` y `.CENI`, 4 de `CatalogProductKind`, 3 de `ModuleBinding`, 3 de `PaymentAppliesTo`, 2 de `ScholarshipProgram`, 3 de `ConsentPurpose`, `BeneficiaryOrigin.CIAN` y `SupportRequestType.CIAN_ATTENTION`. Más la columna `Subscription.toolEntitlementId`. Un solo valor **nuevo**: `ScholarshipProgram.SERVICE`, donde se funden `CIAN_SERVICE` y `TOOL_ACCESS` para que ninguna beca se pierda |
| Permisos | Los 5 roles de operación de CIAN y CENI, sus columnas de la matriz, las familias `cian` y `ceni`, y los propósitos de consentimiento `CIAN_CARE`, `CLINICAL_DATA_SHARING` y `TOOL_IDENTITY_EXCHANGE` |
| Flujos y pruebas | `F-16` y `F-17`; `E2E-10` y `E2E-11`. Los flujos E2E globales pasan de quince a **trece** y se renumeran |

**Qué se conservó.** Las páginas públicas `/cian` y `/ceni`, sus acentos de módulo en el sistema de diseño, y las menciones institucionales del ecosistema: CIAN y CENI siguen siendo parte del ecosistema Alianza Índigo, y la plataforma lo dice. Lo que ya no hace es operarlas.

**Los archivos de las fases 0 a 3 quedan tal cual.** Son el registro de lo que se dijo y se firmó en su momento, y varias de sus líneas nombran módulos y pruebas que esta corrección retira. Reescribirlos convertiría un historial en una versión conveniente del pasado. Lo que rige hoy es este apartado.

**Migración correctiva.** `20260905120000_correccion_de_alcance_cian_y_ceni_externos`. No reescribe ninguna migración aplicada. PostgreSQL no permite retirar un valor de un tipo enumerado, de modo que cada tipo afectado se renombra, se vuelve a crear sin los valores retirados y se reasignan sus columnas —incluidas las de arreglo `consent_version.requiredFor`, `retention_policy.appliesToClassification` y `retention_policy.appliesToContextKind`—. Antes de tocar los tipos, una comprobación recorre las once tablas afectadas y **detiene la migración con un mensaje explícito** si alguna fila conserva un valor retirado: un anticipo se retira, un dato real se resuelve a mano. Verificada de las dos maneras que exige la instrucción:

- **Sobre una base actualizada:** se levantó una base con las 16 migraciones anteriores, se insertaron los cinco roles de CIAN y CENI y un permiso del compartimento clínico, y la migración los retiró dejando `role`, `permission` y `role_permission` sin rastro, sin tipos `_anterior` huérfanos y con los 527 privilegios de columna intactos.
- **Sobre una instalación nueva:** base vacía, `prisma migrate deploy` con las 17 migraciones y semilla: 14 roles y 97 permisos.
- **La comprobación se probó viéndola fallar:** con una `retention_policy` que declaraba `CLINICAL`, la migración se detuvo con el nombre exacto de la fila.

**Qué no se tocó.** Los repositorios y el funcionamiento de CIAN y CENI. Esta corrección vive por completo dentro de este repositorio.

---

## Historial de fases

| Fase | Inicio | Cierre | Estado | SHA del punto de control |
|---|---|---|---|---|
| 0 | 2026-09-03 | 2026-09-03 | `APPROVED` | `7fecd6f873c8068101478da2179d6d5a6bc17c29` |
| 1 | 2026-09-03 | 2026-09-04 | `APPROVED` | `e8daa0e` (el cierre previo `ac23003` fue revocado) |
| 2 | 2026-09-04 | 2026-09-04 | `APPROVED` | `0fedf6f` |
| 3 | 2026-09-04 | 2026-09-04 | `APPROVED` | `85cf196` |
| 4 | 2026-09-04 | 2026-09-05 | `APPROVED` | `cadebbd`. Afiliación completa de punta a punta: registro maestro, solicitud con revisión humana y plazo, activación por cobro confirmado, vigencias y bajas, tres padrones, directorio interno y público opt-in, credenciales con QR verificable y panel personal. 22 defectos encontrados y cerrados. Cerrada primero en `038297d`, reabierta el mismo día por la corrección de alcance de CIAN y CENI, y cerrada de nuevo con ella aplicada |
| 5 a 10 | — | — | No iniciadas | — |

---


---

# Archivo — registro completo de la Fase 3

> Catálogo financiero, Stripe y libro auxiliar. Cerrada el 4 de septiembre de 2026 en `85cf196`.

## Situación actual

- **Fase activa:** 3 — Catálogo financiero, Stripe y libro auxiliar
- **Estado:** `APPROVED`
- **Autorizada por la persona usuaria:** 4 de septiembre de 2026
- **Fecha de inicio:** 4 de septiembre de 2026
- **SHA del punto de control:** `85cf196`
- **Fase anterior:** 2 — `APPROVED`, cerrada en `0fedf6f`. Su registro íntegro se conserva en el **Archivo** al final de este documento.
- **Fase siguiente:** 4 — Afiliación, padrones, directorios y credenciales, autorizada por la persona usuaria el 4 de septiembre de 2026

---

## Alcance contratado

El PRD §24 Fase 3 contrata: catálogo de productos y precios; entidades receptoras; dos configuraciones Stripe; Checkout; portal de cliente; pagos únicos y suscripciones; cupones, becas, exenciones y convenios; webhooks idempotentes; pagos manuales con evidencia; reembolsos; conciliación; libro auxiliar; registro patrimonial y movimientos de activos; reportes y exportaciones autorizadas; alertas de fallos; y plantillas de comprobante.

**Lo que esta fase deliberadamente no hace.** No activa membresías ni derechos de servicio: el PRD §24 ordena resolver los pagos **antes** de conectar activaciones, y las membresías son de la Fase 4. El modelo deja preparadas las referencias —`Subscription.membershipId`, `Payment.appliesToKind`— sin escribirlas, de modo que la fase siguiente conecte sin reconstruir nada.

**Lo que no se inventa.** El catálogo se administra desde una pantalla, no desde la semilla. Una cuota sindical es una cantidad que acuerda la organización, y sembrar un importe plausible sería el mismo error que inventar un valor estatutario (ADR-0040). La semilla deja la configuración de cobro por entidad, que es estructura, no dinero.

---

## Criterios de aceptación

Criterios específicos del PRD §24 Fase 3:

| # | Criterio | Estado |
|---|---|---|
| 1 | Ningún acceso se activa por la página de retorno de Stripe | Cumplido — `C-F3-01` |
| 2 | Repetir un webhook no duplica movimientos | Cumplido — `C-F3-02` |
| 3 | Fuerza Índigo y Alianza Índigo pueden conciliarse por separado | Cumplido — `C-F3-03` |
| 4 | Los importes usan moneda y unidades menores | Cumplido — `C-F3-04` |
| 5 | Los ajustes requieren motivo, actor y auditoría | Cumplido — `C-F3-05` |
| 6 | Los escenarios de pago exitoso, fallido, pendiente, reembolsado y disputado están probados | Cumplido — `C-F3-06` |

---

## Tareas completadas

Las veintidós tareas de la Fase 3 del backlog, de `F3-DAT-001` a `F3-DOC-001`. El detalle vive en la sección **Fase 3** de [`BACKLOG.md`](BACKLOG.md).

---

## Evidencias

| Qué se afirma | Cómo se comprobó |
|---|---|
| El libro auxiliar no se puede editar ni borrar | Dos pruebas de integración lo intentan con el cliente de la aplicación y reciben `permission denied` del motor |
| Los movimientos patrimoniales tampoco | Otras dos pruebas, del mismo modo |
| Un asiento no se revierte dos veces | El segundo intento choca contra un índice único y devuelve conflicto |
| Un reenvío de la pasarela no duplica el ingreso | Dos eventos distintos con la misma factura dejan un solo cobro, por su clave de idempotencia |
| Volver del navegador no confirma nada | El cobro se queda sin confirmar y sin fecha de pago tras el retorno; lo mueve solo el webhook firmado |
| La firma se verifica de verdad | Comprobado contra un servidor levantado: firma correcta aceptada, y rechazadas la ausente, la de la otra cuenta, la de marca de tiempo vieja y la de un cuerpo alterado en un byte |
| Quien registra un pago manual no puede aprobarlo | Una prueba le da los dos roles a la misma persona y comprueba que sigue sin poder |
| Una beca gana al descuento y no se acumulan | Con un descuento del diez por ciento y una beca del sesenta, se cobra el cuarenta |
| El punto es siempre separador decimal | «150.005» se rechaza en vez de leerse como ciento cincuenta mil cinco |
| Un importe grande no pierde precisión | Una prueba guarda y recupera un importe mayor que el entero seguro de JavaScript, y falla si se reintroduce el paso por coma flotante |
| La política de contenido deja pagar | Comprobado en un navegador real: con `form-action 'self'` a secas, la redirección a la pasarela no llega a salir |
| Cada plantilla que el código pide está sembrada | Una prueba recorre el código productivo buscando los códigos y exige que existan publicados |
| Los seis controles de la fase miden algo | Cada uno se rompió a propósito y se comprobó que falla |

---

## Pruebas y resultados

| Puerta | Resultado |
|---|---|
| Verificación de fase | 44 controles aprobados, 0 fallidos, 1 no aplicable |
| Tipos y lint | Sin errores |
| Pruebas unitarias | 312 |
| Pruebas de integración | 354, contra PostgreSQL real |
| Extremo a extremo, accesibilidad y rendimiento | 148 en móvil y escritorio |

Lo que las pruebas de esta fase comprueban contra el motor y no contra el código: que el libro auxiliar y los movimientos patrimoniales **no se puedan editar ni borrar** desde la aplicación, que un asiento no se pueda revertir dos veces, y que un reenvío de la pasarela no cree un segundo ingreso.

Los cinco estados de un pago —pendiente, exitoso, fallido, reembolsado y disputado— se recorren enteros, desde abrir el cobro hasta lo que la persona ve en su pantalla.

---

## Defectos abiertos

| Id | Severidad | Descripción | Estado y corrección |
|---|---|---|---|
| `D-F3-001` | Alta | El punto era separador de millares en algunas formas de escribir una cantidad, así que «150.005» se leía como ciento cincuenta mil cinco pesos: un error de mil veces en un cobro que sale de verdad | Corregido. El punto es siempre decimal, que es la convención de México; hay prueba que fija las dos lecturas |
| `D-F3-002` | Alta | Un importe pasaba por `number` al validarse, y por encima del entero seguro de JavaScript perdía precisión antes de llegar a la columna, que es `BigInt` | Corregido. La validación produce `bigint` y la prueba falla si se reintroduce el paso por `number` |
| `D-F3-003` | Alta | La fecha de vigencia se guardaba a medianoche UTC: un precio acordado para el 1 de enero empezaba a regir a las seis de la tarde del 31 de diciembre y se presentaba con la fecha del día anterior | Corregido. `startOfDayInZone` interpreta el día del calendario en la zona de quien captura, con horario de verano incluido |
| `D-F3-004` | Media | `/gestion` llevaba su propia lista de secciones, distinta de la que dibuja la navegación: quien solo tuviera el catálogo de cobros entraba al área de gestión para ser expulsado de ella | Corregido. Una sola lista en `app/gestion/secciones.ts`, que usan el marco, la portada y el portal de la persona: eran tres copias, y la tercera apareció al construir el bloque siguiente |
| `D-F3-005` | Media | Había dos `formatMoney`: el de la Fase 2 dividía entre cien y perdía precisión en importes grandes, y además fijaba dos decimales para cualquier moneda | Corregido. Uno solo, en `platform/i18n`, con aritmética entera y el exponente tomado del catálogo de monedas |
| `D-F3-006` | Baja | El mensaje «reactívalo antes de ponerle precio» prometía una operación que no existía: la única salida real era crear otro concepto con código distinto y partir el histórico en dos | Corregido. `reactivateProduct`, con motivo escrito y asiento en la bitácora |
| `D-F3-007` | Alta | La integración continua llevaba fallando desde la Fase 2 sin que nadie lo mirara. `tests/unit/config/env-file.test.ts` heredaba del entorno de la máquina la misma variable que estaba afirmando: donde `SUPERADMIN_PASSWORD_HASH` viene exportada —como en la propia integración continua— la prueba dejaba de leer el archivo y leía la máquina | Corregido. El proceso hijo hereda el entorno **menos** las variables bajo examen, y dos pruebas nuevas fijan qué hace el cargador cuando el mismo nombre viene de dos sitios. Verificado reproduciendo la condición: la prueba vieja falla con la variable exportada y la nueva pasa |
| `D-F3-008` | Baja | El chequeo de salud del contenedor de PostgreSQL buscaba una base con el nombre del rol y dejaba veinte `FATAL: database "fuerza" does not exist` en cada registro, delante de quien viniera a investigar un fallo real | Corregido: `pg_isready -U fuerza -d fuerza_ci` |
| `D-F3-009` | Alta | La migración de la Fase 3 revocó `UPDATE` sobre `payment` y devolvió columna por columna, pero olvidó `subscriptionId`. Una intención de cobro se crea antes de que exista la suscripción, así que el enlace solo puede escribirse después: sin ese privilegio, la primera cuota de cada suscripción quedaba suelta, sin poder atribuirse al periodo que pagó | Corregido con una migración que concede esa columna. Lo detectaron las pruebas de webhooks; el motor hizo lo que se le pidió y lo que estaba mal era la lista |
| `D-F3-010` | Alta | Con `form-action 'self'` a secas, Chromium bloquea la redirección a la pasarela: aplica la directiva a toda la cadena de redirección, no solo al primer destino. Quien intentara pagar se quedaría mirando una página que no hace nada, sin ningún error a la vista | Corregido enumerando los dos servidores de la pasarela. Comprobado en un navegador de verdad —con la directiva estrecha la petición no llega a salir— y fijado con una prueba de extremo a extremo sobre la cabecera que responde el servidor |
| `D-F3-011` | Alta | El acuse de la entrada pública fallaba **siempre** desde la Fase 2: al renombrar `InboundInquiry` a `SupportRequest` (D-F2-003) se cambió el código de la plantilla en el caso de uso y no en la semilla. Nadie que escribiera por el formulario público recibía acuse, y no se notaba porque el envío va por la cola: el trabajo se reintentaba en silencio hasta agotarse | Corregido en la semilla. Se añadió una prueba que recorre el código productivo buscando los códigos de plantilla que pide y comprueba que todos estén sembrados; se comprobó que falla al romper lo que vigila |
| `D-F3-012` | Media | El control `C-F1-02` solo leía exportaciones escritas una por línea, así que un `export { a, b } from '…'` en una sola línea pasaba sin revisar: daba verde por no haber mirado | Corregido: ahora lee las llaves de cada bloque `export { … }`. Al corregirlo encontró de inmediato dos casos que llevaba tiempo dejando pasar |
| `D-F3-013` | Baja | Tres de los controles nuevos de la Fase 3 acusaban de más o miraban lo que no era: uno señalaba a la cola de trabajos, donde `SUCCEEDED` es el estado de un trabajo; otro al indicador de progreso, que multiplica por cien para sacar un porcentaje; y el tercero daba por buena la comprobación del doble control mirando una línea del listado que solo sirve para no ofrecer un botón | Corregidos los tres antes de darlos por buenos. Cada uno se probó rompiendo lo que vigila y comprobando que falla |

---

## Decisiones

Las decisiones de esta fase se registran en [`DECISIONS.md`](DECISIONS.md) a partir de ADR-0049.

---

# Archivo — registro completo de la Fase 2

> Sistema de diseño, PWA, CMS y sitio público. Cerrada el 4 de septiembre de 2026 en `0fedf6f`.

## Situación actual

- **Fase activa:** 2 — Sistema de diseño, PWA, CMS y sitio público
- **Estado:** `APPROVED`
- **Autorizada por la persona usuaria:** 4 de septiembre de 2026
- **Fecha de inicio:** 4 de septiembre de 2026
- **SHA del punto de control:** `0fedf6f`
- **Fase anterior:** 1 — `APPROVED`, cerrada en `e8daa0e` tras una reapertura. Su registro íntegro se conserva en el **Archivo** al final de este documento.
- **Fase siguiente:** 3 — Catálogo financiero, Stripe y libro auxiliar, **no autorizada** hasta que la persona usuaria lo indique expresamente (PRD §23.3)

---

## Alcance contratado

El PRD §24 Fase 2 contrata: tokens y componentes; temas claro y oscuro; preferencias neuroinclusivas; navegación pública; CMS versionado; páginas públicas del mapa funcional; formularios de contacto y entrada inicial; buscador público; SEO técnico; metadatos sociales; PWA; centro de accesibilidad; páginas legales configurables; y analítica respetuosa de la privacidad para eventos esenciales.

**Lo que esta fase deliberadamente no hace.** El verificador público de credenciales y distintivos, que vive en `/verificar/*` dentro del mapa de rutas, es alcance de la Fase 4 (`F4-CRE-003`): construir aquí una pantalla que no puede verificar nada sería el botón sin acción que el PRD §0.3 prohíbe. Las páginas públicas de módulos posteriores —directorio, CIAN, CENI, herramientas, eventos— sí se construyen, con su contenido editorial real del CMS y con estado vacío genuino donde el dato aún no existe, nunca con contenido ficticio que aparente terminación.

---

## Criterios de aceptación

Criterios específicos del PRD §24 Fase 2:

| # | Criterio | Estado |
|---|---|---|
| 1 | Ninguna página usa contenido ficticio para aparentar terminación | Cumplido · `C-F2-01` |
| 2 | La identidad diferencia módulos sin fragmentar el ecosistema | Cumplido · `C-F2-02` |
| 3 | Todas las rutas principales tienen diseño móvil y escritorio verificado | Cumplido · `C-F2-03` |
| 4 | El CMS maneja borrador, revisión, publicación y reversión | Cumplido · `C-F2-04` |
| 5 | La PWA no almacena expedientes sensibles | Cumplido · `C-F2-05` |
| 6 | Rendimiento y accesibilidad alcanzan los umbrales de `TEST_PLAN.md` | Cumplido · `C-F2-06` |

Los seis controles se comprobaron **a la inversa**: se rompió a propósito lo que cada uno vigila y se confirmó que el verificador acusa. Un control que solo se ha visto pasar no ha demostrado nada.

---

## Tareas completadas

Las veintiséis tareas de la sección **Fase 2** de [`BACKLOG.md`](BACKLOG.md), agrupadas en diez bloques:

| Bloque | Contenido |
|---|---|
| A | Tokens en tres capas, temas claro y oscuro con contraste calculado, y las cinco preferencias neuroinclusivas |
| B | Primitivas accesibles, patrones de estado obligatorios y formulario por pasos |
| C | Gestor de contenidos con borrador, revisión, programación, publicación, archivo, historial y reversión |
| D | Navegación pública sin JavaScript, sitio público, buscador y centro de accesibilidad |
| E | Entrada única de ayuda y contacto, con acuse por folio y bandeja para el personal con facultades |
| F | Redirecciones y páginas legales por entidad jurídica |
| G | Aplicación instalable: manifiesto, iconos, caché acotada e indicación de conexión |
| H | SEO técnico, metadatos sociales, datos estructurados y medición agregada |
| I | Playwright en móvil y escritorio, umbrales de accesibilidad y de rendimiento, y pruebas visuales deterministas |
| J | Controles `C-F2-*`, documentación del sistema de diseño y cierre |

**Lo que esta fase deliberadamente no entrega, y por qué.** Las páginas institucionales del mapa funcional existen como rutas: cada una resuelve, tiene sus metadatos, es editable desde el gestor y, mientras nadie haya publicado nada, dice con todas sus letras que aún no hay contenido. Lo que **no** se entrega es el texto de esas páginas. Un comunicado o una descripción del sindicato firmados por la organización los escribe la organización; redactarlos aquí sería ponerle palabras en la boca, que es la misma clase de error que inventar un valor estatutario (ADR-0040). El control `C-F2-01` comprueba que la semilla no cree contenido editorial.

---

## Evidencias

| Qué se afirma | Cómo se comprobó |
|---|---|
| El sitio público se sirve de verdad | Servidor levantado y rutas consultadas: códigos de estado, contenido y rotación del *nonce* de la política de contenido entre peticiones |
| Una dirección inexistente devuelve 404 | Comprobado sobre el servidor, no sobre el código |
| Una redirección devuelve 308 al destino | Comprobado sobre el servidor |
| El formulario público funciona de extremo a extremo | Playwright: se completa, se envía y devuelve folio, en móvil y escritorio |
| El relato original no se puede alterar | La aplicación intenta el `UPDATE` y el motor lo deniega |
| La caché no guarda nada con sesión | Se recorren zonas con sesión y se inspecciona la caché del navegador |
| Sin red se cae en la pantalla de sin conexión | Se corta la red en el navegador y se navega |
| Los umbrales de rendimiento miden algo | 516 ms de LCP en la portada con red lenta y 96 ms en el formulario; la medición de estabilidad detecta un salto provocado durante la carga |
| Los seis controles de fase acusan | Se rompió lo que cada uno vigila y se confirmó el fallo |

---

## Pruebas y resultados

| Suite | Resultado |
|---|---|
| Puerta de fase (`npm run phase:verify`) | 38 controles aprobados, 0 fallidos |
| Tipos (`npm run typecheck`) | Sin errores |
| Lint (`npm run lint`) | Sin avisos |
| Unitarias (`npm test`) | 264 en verde |
| Integración contra PostgreSQL (`npm run test:integration`) | 211 en verde |
| Navegador (`npm run test:e2e`), móvil y escritorio | 142 en verde, 8 omitidas (comparación de píxeles, opcional) |
| Compilación (`npm run build`) | Correcta |

Las omitidas son las comparaciones píxel a píxel, que se activan con `E2E_VISUAL=1`. La razón de que no estén en la puerta está escrita en `tests/e2e/visual/temas.spec.ts`: una imagen de referencia generada en una máquina y comparada en otra falla por cómo cada sistema suaviza la tipografía, no por el producto, y una suite que falla por razones sobre las que nadie puede actuar acaba desactivada.

---

## Defectos abiertos

Ninguno abierto. Los que aparecieron durante la construcción se corrigieron en su momento y se dejan registrados porque cada uno enseñó algo:

| Id | Severidad | Descripción | Corrección |
|---|---|---|---|
| `D-F2-001` | Alta | Dos cargadores leían `.env.local` con reglas opuestas y corrompían el hash del Superadmin en direcciones distintas, ninguna con error visible | Un solo cargador, el del servidor, y una función que se niega a escribir lo que el formato no representa (ADR-0043) |
| `D-F2-002` | Alta | El ayudante de pruebas volvía a conceder privilegios con una lista copiada a mano de las migraciones: las pruebas daban por buena una inmutabilidad que solo existía en producción | Lee las migraciones (ADR-0046) |
| `D-F2-003` | Alta | La entrada pública se construyó como tabla nueva, duplicando la `SupportRequest` que el modelo de datos contrata desde la Fase 0 | Reconciliada sobre la tabla contratada, con sus tres desviaciones documentadas (ADR-0044) |
| `D-F2-004` | Media | Las pruebas de integración respetaban el hash heredado del entorno; el de la integración continua era otro, y dos pruebas habrían fallado allí sin que nada del código cambiara | Las pruebas imponen su propia credencial |
| `D-F2-005` | Media | Una dirección inexistente devolvía una página de disculpa con código 200 | 404 real, con la pantalla en `not-found.tsx` del grupo público |
| `D-F2-006` | Media | El Superadmin raíz tenía `content.redirect.manage` y ninguna pantalla desde la que ejercerlo | Retirado de la lista cerrada (ADR-0048) |
| `D-F2-007` | Media | Next sustituye el bloque `openGraph` completo: tres pantallas se habían quedado sin imagen social, y eso solo se ve fuera del sitio | Una función común compone los metadatos, con una prueba por ruta |
| `D-F2-008` | Media | El enlace de «saltar al contenido» medía 41,6 px al recibir el foco, por debajo del umbral contratado | Corregido y comprobado enfocado |
| `D-F2-009` | Media | La suite de extremo a extremo no era repetible: al cuarto pase saltaba el límite de envíos del formulario y una prueba fallaba por su propio éxito anterior | La preparación deja la entrada en cero, sin tocar el límite |
| `D-F2-010` | Media | `test.skip` con condición en el cuerpo de un `describe` saltaba **todas** las pruebas del bloque, y la suite visual entera se estaba omitiendo sin decirlo | La condición va dentro de la prueba |
| `D-F2-011` | Media | Los controles de fases cerradas dejaban de ejecutarse al abrir la siguiente: cada cierre era una amnistía | Los controles acumulativos siguen corriendo; solo `C-F0-01` es exclusivo de su fase, y consta por qué |
| `D-F2-012` | Baja | `C-F1-07` acusaba como defecto el texto de la opción vacía de un `Select` que sí tiene etiqueta visible | Ahora mira elemento por elemento |
| `D-F2-013` | Baja | `C-COH-02` acusaba «para decidir» por contener «a decidir» | Límite de palabra al principio, y consta por qué no al final |
| `D-F2-014` | Baja | La declaración de accesibilidad decía «en construcción» de un centro de preferencias que ya existía | Puesta al día y movida al grupo público |

Los cuatro últimos son defectos **de los controles**, no del producto, y se registran igual: un control que acusa de más enseña a ignorarlo, y entonces deja de servir cuando acierta.

---

## Decisiones

Veintitrés decisiones, de ADR-0041 a ADR-0063 en [`DECISIONS.md`](DECISIONS.md):

| ADR | Decisión |
|---|---|
| 0041 | Una redirección sobrevive a la página que la originó |
| 0042 | El actor raíz no tiene voz editorial |
| 0043 | Un solo cargador para los archivos de entorno |
| 0044 | La entrada pública amplía `SupportRequest`; no crea una tabla paralela |
| 0045 | Sin aviso de privacidad publicado no se recaba ningún dato |
| 0046 | Los privilegios de las pruebas se leen de las migraciones |
| 0047 | Las páginas legales se distinguen por dirección, no por columna nueva |
| 0048 | Un permiso sin pantalla desde la que ejercerlo no se concede |
| 0049 | Un precio no se edita: se cierra y nace otro |
| 0050 | Archivar es reversible; borrar no existe |
| 0051 | Un día del calendario se convierte en instante con la zona de quien lo captura |
| 0052 | Pagar lo propio es un permiso, no una comprobación de identidad |
| 0053 | Volver del navegador no prueba ningún pago |
| 0054 | La idempotencia del cobro se apoya en la intención abierta, no en una clave eterna |
| 0055 | El portal de cliente no se reconstruye |
| 0056 | Un evento adelantado no es un error: queda sin conciliar y se reintenta |
| 0057 | La idempotencia del ingreso se ancla en el documento de la pasarela |
| 0058 | El doble control se comprueba por persona, no solo por permiso |
| 0059 | Una beca gana al descuento y no se acumulan |
| 0060 | Un corte con diferencias se puede cerrar; lo que no se puede es callarlas |
| 0061 | Una exención no deja asiento en el libro |
| 0062 | Rendir cuentas es un derecho; exportar el libro es una facultad |
| 0063 | Lo que se dejó de cobrar se informa, aunque no esté en el libro |

El sistema de diseño se documenta aparte, en [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).

---

# Archivo — registro completo de la Fase 1

> Incluye el cierre revocado del 3 de septiembre, los diecinueve defectos con su corrección y el informe final del 4 de septiembre.

### Situación al cerrar

- **Fase activa:** 1 — Infraestructura, datos, autenticación, permisos y Superadmin
- **Estado:** `APPROVED` — reabierta el 4 de septiembre de 2026 tras una revisión externa, corregida y cerrada de nuevo
- **Autorizada por la persona usuaria:** 3 de septiembre de 2026
- **Fecha de inicio:** 3 de septiembre de 2026
- **Fecha de cierre:** 3 de septiembre de 2026
- **SHA del punto de control:** `e8daa0e`
- **Fase anterior:** 0 — `APPROVED`, cerrada en `7fecd6f`. Su registro íntegro se conserva en el **Archivo** al final de este documento.
- **Fase siguiente:** 2 — Sistema de diseño, PWA, CMS y sitio público, **no autorizada** hasta que la persona usuaria lo indique expresamente (PRD §23.3)

---

### Alcance contratado

El PRD §24 Fase 1 contrata: Next.js, TypeScript estricto y estructura modular; configuración de Vercel; Prisma y Neon; migración inicial completa de entidades base; conexión y salud de base de datos; autenticación ordinaria; acceso Superadmin por variables de entorno; sesiones, recuperación e invitaciones; roles, permisos y alcances; servicio de auditoría; servicio privado de Vercel Blob; validación central de variables; manejo uniforme de errores; trabajos programados base; pruebas y datos semilla no sensibles; y CI de calidad.

Pantallas contratadas: inicio y cierre de sesión; activación y recuperación; sesiones propias; login de Superadmin; tablero técnico de Superadmin; gestión base de entidades jurídicas, personas administradoras y roles; y visor de auditoría con permisos.

La gestión de roles quedó repartida entre dos superficies, por una razón que no es de comodidad. El actor raíz **no** puede otorgar nombramientos: administra la plataforma y no gobierna el sindicato (ADR-0034). Su panel muestra las cuentas y sus nombramientos en solo lectura, y el otorgamiento vive en `/gestion`, donde entra quien tiene facultades sindicales.

A ese alcance se suma, por la corrección `F0-COR-007` de la fase anterior, el puerto de correo con plantillas versionadas y registro de entrega, que la activación por invitación y la recuperación de contraseña necesitan.

---

### Criterios de aceptación

Criterios específicos del PRD §24 Fase 1:

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Un Superadmin puede iniciar sesión sin existir como miembro | Cumplido | `tests/integration/superadmin.test.ts`: entra con las credenciales del entorno sobre una base con cero personas y cero cuentas |
| 2 | Un administrador ordinario no puede asignarse permisos superiores | Cumplido | `tests/integration/role-assignment.test.ts`: los dos controles —autonombramiento y no elevación— probados en negativo, sin excepción por tipo de actor |
| 3 | El aislamiento por entidad y territorio funciona en consultas y mutaciones | Cumplido | `tests/integration/isolation.test.ts` y `role-assignment.test.ts`: el visor recorta en la consulta y no al pintar; pedir la entidad ajena por filtro tampoco la devuelve; y un nombramiento sin entidad no alcanza ninguna, que es el defecto por el que este criterio se declaró cumplido antes de tiempo (`D-F1-012`) |
| 4 | Un archivo privado no puede abrirse mediante su URL persistente sin autorización | Cumplido | `tests/integration/file-access.test.ts`: el canje reevalúa la política, de modo que revocar un nombramiento invalida un pase ya emitido |
| 5 | Las migraciones corren desde el repositorio sobre una base vacía | Cumplido | `tests/integration/migrations.test.ts` y `deployment.test.ts`: la base de todas las pruebas se construye con `prisma migrate deploy` sobre una base vacía |
| 6 | No existe ninguna dependencia del proveedor prohibido | Cumplido | Control `C-REPO-03`: cero coincidencias fuera del propio control de cumplimiento |

---

### Tareas completadas

Las 38 tareas contratadas de la Fase 1 y las once correcciones de defectos hallados durante la construcción. El detalle vive en la sección **Fase 1** de [`BACKLOG.md`](BACKLOG.md).

---

### Evidencias

- 32 tablas creadas por las migraciones del repositorio sobre una base vacía, con tres migraciones aplicadas y ninguna a medias.
- 33 permisos en el catálogo, 19 roles sembrados y 33 unidades territoriales, con semilla idempotente comprobada por doble ejecución.
- Cero personas y cero cuentas sembradas: el padrón no se inventa.
- Cadena de resúmenes de la bitácora verificada de extremo a extremo, incluida su detección de alteración y de supresión.
- `UPDATE`, `DELETE` y `TRUNCATE` sobre las bitácoras denegados al rol con el que corre la aplicación, comprobado ejecutándolos.
- 21 rutas construidas, ninguna con acción sin efecto ni dato simulado.

---

### Pruebas y resultados

| Nivel | Archivos | Casos | Resultado |
|---|---|---|---|
| Unitarias | 7 | 135 | En verde |
| Integración contra PostgreSQL real | 10 | 149 | En verde |
| **Total** | **17** | **284** | **En verde** |

Controles del verificador de fase: **31 aprobados, 0 fallidos, 2 no aplicables**.

Siete de las trece pruebas negativas obligatorias de [`PERMISSIONS.md`](PERMISSIONS.md) §9 están escritas y en verde: las números 1, 2, 3, 9, 10, 11 y 13. Las seis restantes —compartimento clínico de extremo a extremo, organización CENI ajena, consentimiento ausente, afiliación honoraria y voto, y nombramiento vencido sobre `OfficeTerm`— dependen de entidades que las fases 5 a 9 introducen; sus mecanismos sí están probados hoy en el motor de decisión, en `tests/unit/authz/`.

---

### Defectos abiertos

Ninguno. Los once defectos hallados durante la construcción se corrigieron dentro de la fase y cada uno dejó tras de sí un control que lo habría detectado.

| Id | Severidad | Descripción | Estado y corrección |
|---|---|---|---|
| D-F1-001 | Bloqueante | La migración inicial creaba `audit_event` sin `chainKey` ni `chainSequence`, que el modelo sí declaraba: un despliegue desde base vacía levantaba un esquema sobre el que ninguna acción auditada podía escribirse | Corregido en `F1-COR-001`. Controles `C-F1-04` y la prueba de comparación entre migraciones y modelo |
| D-F1-002 | Bloqueante | Ningún rol del catálogo recibía `access.role.assign` y ninguna pantalla invocaba `assignRole`: en un despliegue nuevo nadie podía nombrar a nadie, nunca | Corregido en `F1-COR-002`. Controles `C-F1-02` y `C-F1-03` |
| D-F1-003 | Alta | No existía forma de crear la primera Secretaría Ejecutiva, a la que por construcción nadie de dentro puede nombrar | Corregido en `F1-COR-003`. Probado en `deployment.test.ts` |
| D-F1-004 | Alta | La persona titular de un archivo no podía descargarlo: la matriz decía `O` y el catálogo no tenía el permiso que expresara esa `O` | Corregido en `F1-COR-004` (ADR-0035) |
| D-F1-005 | Alta | El límite de intentos contaba los fallos de todo el sistema cuando la petición no traía origen identificable | Corregido en `F1-COR-005` (ADR-0037) |
| D-F1-006 | Media | «Cerrar todo lo demás» cerraba también la sesión desde la que se pedía | Corregido en `F1-COR-006`. Probado en `account-lifecycle.test.ts` |
| D-F1-007 | Media | El control de no elevación eximía al actor raíz; la exención era inalcanzable, pero se habría convertido en vía de elevación al primer cambio de la lista cerrada | Corregido en `F1-COR-007` |
| D-F1-008 | Media | El separador del resumen de auditoría era un byte nulo literal, que volvía binario el módulo para git y para las búsquedas: un cambio ahí no aparecía en ningún diff de revisión | Corregido en `F1-COR-008` |
| D-F1-009 | Alta | `npm run lint` abortaba antes de revisar un solo archivo, de modo que la puerta de calidad estaba en verde sin haber revisado nada | Corregido en `F1-COR-009` (ADR-0031). Reveló 23 defectos reales |
| D-F1-010 | Media | El verificador daba falsos positivos con la palabra española «TODO» y con un `.env.local` que git nunca vio | Corregido en `F1-COR-010` |
| D-F1-011 | Media | El guion de arranque perdía la entrada cuando no venía de un terminal | Corregido en `F1-COR-011` |

### Segunda tanda: defectos de la revisión externa del 4 de septiembre

El cierre anterior fue revocado. Los dos primeros invalidaban criterios de aceptación que yo había declarado cumplidos.

| Id | Severidad | Descripción | Estado y corrección |
|---|---|---|---|
| D-F1-012 | Bloqueante | El motor convertía un nombramiento sin entidad jurídica en alcance a **todas**, lo contrario de lo que `PERMISSIONS.md` §6 promete. El guion de arranque creaba así la primera Secretaría Ejecutiva, de modo que quedaba con acceso transversal a las dos personas morales. Ninguna prueba lo detectaba porque las fixtures traían ese caso por omisión | Corregido en `F1-COR-012` (ADR-0038). Control `C-F1-08` y pruebas negativas propias |
| D-F1-013 | Bloqueante | La semilla inventaba cuatro valores estatutarios —días de convocatoria, porcentaje de firmas, reelección— y los atribuía a secciones del PRD que los remiten a los estatutos; y declaraba la versión en vigor desde una fecha igualmente inventada | Corregido en `F1-COR-013` (ADR-0040). Control `C-F1-09` |
| D-F1-014 | Alta | Rotar `SUPERADMIN_SESSION_VERSION` no invalidaba nada, y cerrar la sesión raíz solo borraba la cookie: un testigo copiado seguía sirviendo | Corregido en `F1-COR-014`. Probado en `superadmin.test.ts` |
| D-F1-015 | Alta | El límite de intentos agrupaba por el correo enmascarado, que no es inyectivo: los fallos contra una cuenta bloqueaban otra | Corregido en `F1-COR-015` (ADR-0039) |
| D-F1-016 | Media | `SECURITY.md` declaraba una política de contenido que ninguna ruta emitía, y un comentario en la configuración la describía con nonces | Corregido en `F1-COR-016`. Control `C-F1-10`, verificado contra el servidor en ejecución |
| D-F1-017 | Media | La salud daba por sano el adaptador SMTP, que lanza al primer envío; y el despliegue migraba sin sembrar, dejando una instalación nueva sin roles ni permisos | Corregido en `F1-COR-017`. Control `C-F1-10` |
| D-F1-018 | Media | `DATA_MODEL.md` §17 enumeraba como sembrados tipos de membresía, consentimientos, plantillas y herramientas que la semilla no crea; `ENVIRONMENT.md` decía que `AUTH_SECRET` firma las sesiones, cuando solo seudonimiza el origen | Corregido en `F1-COR-018` |
| D-F1-019 | Baja | `requiresOfficeTerm` viajaba a la vista sin que nada lo hiciera cumplir: `OfficeTerm` es entidad de la Fase 5 | Corregido en `F1-COR-019` |

---

### Decisiones

Las decisiones de esta fase se registran en [`DECISIONS.md`](DECISIONS.md), de la ADR-0031 a la ADR-0037:

| ADR | Decisión |
|---|---|
| 0031 | ESLint fijado en la línea 9 mientras el ecosistema de React alcanza la 10 |
| 0032 | Los campos de formulario se leen con tipo, no con `String()` |
| 0033 | La intercepción de peticiones usa la convención `proxy` |
| 0034 | Nombrar es un acto institucional: la facultad vive en la Secretaría Ejecutiva |
| 0035 | Descargar lo propio es un permiso distinto de descargar lo ajeno |
| 0036 | Las pruebas de integración clonan una plantilla y se conectan con el rol acotado |
| 0037 | Un origen desconocido no comparte cubo con todo el sistema |

---


---

# Archivo — registro completo de la Fase 0

> Se conserva íntegro. Incluye el cierre revocado, los catorce defectos con su corrección y el informe final. Es la referencia de lo que falló y de por qué las decisiones son como son.

### Alcance contratado

El PRD §24 Fase 0 contrata: inspección del repositorio; inventario de código reutilizable y deuda; mapa de módulos y dependencias; modelo de dominios; diagrama completo de datos; matriz de roles, atributos y permisos; contratos de servicios e integraciones; arquitectura de rutas; estrategia de archivos; estrategia de auditoría; estrategia de Stripe por entidad; estrategia de IA y privacidad; mapa de consentimientos; catálogo inicial de estados y transiciones; plan de migraciones; plan de pruebas; ADR y documentación base; y configuración de seguimiento de fases.

Entregables contratados: `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/PERMISSIONS.md`, `docs/FLOWS.md`, `docs/INTEGRATIONS.md`, `docs/SECURITY.md`, `docs/TEST_PLAN.md`, `docs/PHASE_STATUS.md`, diagramas Mermaid mantenibles y backlog asignado a fases sin tareas huérfanas.

### Lo que esta fase deliberadamente **no** hace

El PRD §24 Fase 0 prohíbe implementar funciones de fases posteriores, salvo la infraestructura mínima necesaria para validar la arquitectura. En consecuencia, este repositorio **no** contiene todavía la aplicación Next.js, el esquema Prisma ni los comandos de calidad: son alcance de las Fases 1 y 2, según el calendario de [`BACKLOG.md`](BACKLOG.md). La infraestructura mínima incorporada se limita al verificador de fase, al contrato del PRD en formato legible por máquina y a la plantilla de variables de entorno.

---

### Criterios de aceptación

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

### Tareas completadas

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

### Evidencias

| Evidencia | Ubicación |
|---|---|
| Documentación de arquitectura y sus doce entregables | `docs/` |
| Contrato del PRD legible por máquina | `scripts/phase/prd-contract.json` |
| Resultado de la verificación de fase | `reports/phase-verify.json` |
| Copia íntegra de la especificación maestra | `docs/PRD.md` |
| Diagramas Mermaid mantenibles | Integrados en `ARCHITECTURE.md`, `DATA_MODEL.md` y `FLOWS.md` |

---

### Pruebas y resultados

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

### Defectos abiertos

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

### Decisiones

**30 decisiones** de arquitectura registradas en [`DECISIONS.md`](DECISIONS.md). Las estructurales: monolito modular en Next.js (ADR-0001), autenticación propia con Argon2id por el requisito de Superadmin sin base (ADR-0003), fronteras de módulo verificadas por el linter (ADR-0006), abstracción de Stripe por entidad jurídica (ADR-0014), reglas estatutarias versionadas como dato (ADR-0022) y la regla de no declarar comandos que no funcionan (ADR-0023).

Las seis nacidas de la corrección de defectos: secreto del voto sin almacenar la credencial (ADR-0012, que **sustituye** su primera redacción), bandeja de salida transaccional (ADR-0025), `Actor` como sujeto de atribución (ADR-0026), jerarquía territorial por ruta materializada (ADR-0027), pgvector con búsqueda híbrida (ADR-0028), llavero de firma con identificador de clave (ADR-0029) y verificación de coherencia (ADR-0030).

Ninguna decisión técnica fue trasladada a la persona usuaria, conforme al PRD §0.1.

---

### Riesgos identificados para las fases siguientes

Se registran aquí para que la fase propietaria los atienda, no como defectos de la Fase 0.

| Riesgo | Fase propietaria | Mitigación contratada |
|---|---|---|
| El secreto del voto es difícil de garantizar si el diseño se relaja al implementar | 5 | Prueba de no correlación sobre el volcado de la base en E2E-07 |
| La conciliación financiera puede degradarse con eventos fuera de orden | 3 | Persistencia previa al procesamiento y estado `UNRECONCILED` con alerta |
| Los compartimentos de datos clínicos pueden filtrarse por consultas cruzadas | 8 | Prohibición de consultas Prisma cruzadas entre módulos y prueba negativa por compartimento |
| El volumen del padrón puede degradar el directorio | 4 | Índices declarados en `DATA_MODEL.md` §15 y umbral de rendimiento en `TEST_PLAN.md` §8 |
| La reforma estatutaria podría alterar actos pasados | 5 | Reglas versionadas con vigencia y referencia guardada en cada acto (ADR-0022) |

---

### Historial de fases

| Fase | Inicio | Cierre | Estado | SHA del punto de control |
|---|---|---|---|---|
| 0 | 2026-09-03 | 2026-09-03 | `APPROVED` | `7fecd6f873c8068101478da2179d6d5a6bc17c29` — el cierre revocado fue `a441aa7` |
| 1 a 12 | — | — | No iniciadas | — |

---

### Informe de cierre de la Fase 0

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
