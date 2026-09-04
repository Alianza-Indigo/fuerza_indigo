# Estado de fase

> Documento de seguimiento exigido por el PRD §23.1. Se actualiza durante toda la construcción. El verificador `npm run phase:verify` lee de aquí la fase activa y ejecuta los controles que le corresponden.

---

## Situación actual

- **Fase activa:** 3 — Catálogo financiero, Stripe y libro auxiliar
- **Estado:** `IN_PROGRESS`
- **Autorizada por la persona usuaria:** 4 de septiembre de 2026
- **Fecha de inicio:** 4 de septiembre de 2026
- **SHA del punto de control:** se registra en el cierre
- **Fase anterior:** 2 — `APPROVED`, cerrada en `0fedf6f`. Su registro íntegro se conserva en el **Archivo** al final de este documento.
- **Fase siguiente:** 4 — Afiliación, padrones, directorios y credenciales, **no autorizada** hasta que la persona usuaria lo indique expresamente (PRD §23.3)

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
| 1 | Ningún acceso se activa por la página de retorno de Stripe | En curso |
| 2 | Repetir un webhook no duplica movimientos | En curso |
| 3 | Fuerza Índigo y Alianza Índigo pueden conciliarse por separado | En curso |
| 4 | Los importes usan moneda y unidades menores | En curso |
| 5 | Los ajustes requieren motivo, actor y auditoría | En curso |
| 6 | Los escenarios de pago exitoso, fallido, pendiente, reembolsado y disputado están probados | En curso |

---

## Tareas completadas

En curso. El detalle vive en la sección **Fase 3** de [`BACKLOG.md`](BACKLOG.md).

---

## Evidencias

Se registran en el cierre.

---

## Pruebas y resultados

Se registran en el cierre.

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

---

## Decisiones

Las decisiones de esta fase se registran en [`DECISIONS.md`](DECISIONS.md) a partir de ADR-0049.

---

## Historial de fases

| Fase | Inicio | Cierre | Estado | SHA del punto de control |
|---|---|---|---|---|
| 0 | 2026-09-03 | 2026-09-03 | `APPROVED` | `7fecd6f873c8068101478da2179d6d5a6bc17c29` |
| 1 | 2026-09-03 | 2026-09-04 | `APPROVED` | `e8daa0e` (el cierre previo `ac23003` fue revocado) |
| 2 | 2026-09-04 | 2026-09-04 | `APPROVED` | `0fedf6f` |
| 3 | 2026-09-04 | — | `IN_PROGRESS` | — |
| 4 a 12 | — | — | No iniciadas | — |

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
