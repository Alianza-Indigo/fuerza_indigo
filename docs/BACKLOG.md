# Backlog por fases

> Entregable de la **Fase 0** (PRD §24): *"backlog asignado a fases, sin tareas huérfanas"*. Todo el alcance del PRD está distribuido en las trece fases. **No existe una sección de tareas sin asignar**: el control `C-PHASE-01` de `npm run phase:verify` falla si alguna fase queda sin tareas o si aparecen identificadores de otra fase dentro de una sección.

## Cómo leer este documento

- **Identificador:** `F<fase>-<área>-<consecutivo>`. Áreas: `ARQ` arquitectura · `DAT` datos · `AUT` autenticación · `PER` permisos · `AUD` auditoría · `ARC` archivos · `JOB` trabajos · `UI` interfaz · `CMS` contenidos · `PWA` aplicación instalable · `PAG` pagos · `LIB` libro auxiliar · `AFI` afiliación · `PAD` padrones · `DIR` directorios · `CRE` credenciales · `TER` territorio · `GOB` gobierno · `ASA` asambleas · `ELE` elecciones · `NEG` negociación colectiva · `DIS` disciplina · `CAS` casos · `SOC` social · `HER` herramientas · `CIAN` atención integral · `CENI` certificación · `IA` inteligencia artificial · `NOT` notificaciones · `EVE` eventos · `IND` indicadores · `SEC` seguridad · `ACC` accesibilidad · `QA` pruebas · `DOC` documentación · `OPS` operación.
- **Estado:** `Pendiente`, `En curso`, `Terminada`. Solo la fase activa puede tener tareas en curso.
- Cada tarea se considera terminada cuando cumple los doce criterios transversales del PRD §25, no cuando compila.

---

## Fase 0 — Arquitectura integral y preparación del repositorio

| Id | Tarea | Estado |
|---|---|---|
| F0-ARQ-001 | Inspeccionar el repositorio y levantar el inventario de código reutilizable y de deuda | Terminada |
| F0-ARQ-002 | Definir capas, dirección de dependencias y contratos de los servicios de aplicación | Terminada |
| F0-ARQ-003 | Trazar el mapa de módulos con sus dependencias permitidas | Terminada |
| F0-ARQ-004 | Diseñar la arquitectura de rutas de las siete superficies y las familias de API | Terminada |
| F0-DAT-001 | Modelar las 130 entidades del PRD §18.1 a §18.10 con campos, relaciones e índices | Terminada |
| F0-DAT-005 | Modelar las entidades de apoyo y las tablas de relación que el articulado del PRD exige | Terminada |
| F0-DAT-002 | Definir enumeraciones, máquinas de estado y transiciones con motivo y actor | Terminada |
| F0-DAT-003 | Justificar consolidaciones y ampliaciones del modelo | Terminada |
| F0-DAT-004 | Redactar el plan de migraciones y la estrategia de cambios con datos vivos | Terminada |
| F0-PER-001 | Construir la matriz de roles, atributos y permisos, y el algoritmo de decisión | Terminada |
| F0-PER-002 | Levantar el mapa de consentimientos con propósito, alcance y efecto de la revocación | Terminada |
| F0-ARC-001 | Definir la estrategia de archivos privados, clasificación, retención y bloqueo legal | Terminada |
| F0-AUD-001 | Definir la estrategia de auditoría transaccional, anexable y encadenada | Terminada |
| F0-PAG-001 | Definir la estrategia de Stripe por entidad jurídica y el contrato de webhooks | Terminada |
| F0-IA-001 | Definir la estrategia de IA, prompts versionados, privacidad y límites de decisión | Terminada |
| F0-QA-001 | Redactar el plan de pruebas con los quince flujos E2E globales y los umbrales | Terminada |
| F0-DOC-001 | Redactar los entregables documentales de la fase con diagramas Mermaid | Terminada |
| F0-DOC-002 | Registrar las decisiones de arquitectura en el registro de ADR | Terminada |
| F0-OPS-001 | Preparar el repositorio: control de versiones, plantilla de entorno y convenciones | Terminada |
| F0-OPS-002 | Construir el verificador de fase sin dependencias y el contrato del PRD | Terminada |
| F0-DOC-003 | Distribuir todo el alcance del PRD en el backlog de las trece fases | Terminada |

### Correcciones abiertas por la revisión semántica

La revisión de coherencia del 3 de septiembre de 2026 reabrió `F0-DAT-001`, `F0-DAT-002`, `F0-PER-001`, `F0-ARQ-003` y `F0-OPS-002`. Cada corrección cierra el defecto homónimo registrado en [`PHASE_STATUS.md`](PHASE_STATUS.md). **Las catorce están terminadas**; `F0-COR-014` corrige un defecto que no vio ninguna persona, sino el control `C-COH-03` en su primera ejecución.

| Id | Tarea | Severidad | Estado |
|---|---|---|---|
| F0-COR-001 | Reescribir el algoritmo de decisión para que el Superadmin recorra entidad, territorio, asignación, consentimiento y compartimento, con lista de permisos concedidos en vez de lista de prohibiciones | Crítica | Terminada |
| F0-COR-002 | Definir la construcción criptográfica del testigo electoral y eliminar toda vía de correlación temporal entre elegibilidad y boleta; ajustar la garantía afirmada en seguridad a lo que el diseño demuestra | Crítica | Terminada |
| F0-COR-003 | Sustituir los veintiún arreglos de identificadores por tablas de relación con clave foránea e integridad referencial | Alta | Terminada |
| F0-COR-004 | Condicionar los campos laborales de la solicitud a la categoría, de modo que la afiliación honoraria no responda requisitos de agremiado | Alta | Terminada |
| F0-COR-005 | Generalizar el modelo de autoría a persona, Superadmin raíz y sistema en todas las entidades, como ya ocurre en la bitácora | Alta | Terminada |
| F0-COR-006 | Definir el coordinador de otorgamiento de derechos y el patrón de bandeja de salida que resuelve la dependencia del cobro sin romper el mapa de módulos | Alta | Terminada |
| F0-COR-007 | Adelantar a la Fase 1 las plantillas versionadas de mensaje y el registro de entrega que exigen la invitación y la recuperación | Media | Terminada |
| F0-COR-008 | Resolver la dependencia de CENI sobre eventos: adelantar la entidad mínima o desacoplar el requisito de capacitación | Media | Terminada |
| F0-COR-009 | Modelar la fragmentación documental, el almacenamiento de vectores y la estrategia de recuperación de la búsqueda semántica | Media | Terminada |
| F0-COR-010 | Cerrar la decisión sobre la representación de la jerarquía territorial y registrarla como decisión de arquitectura | Media | Terminada |
| F0-COR-011 | Separar el permiso de informes de rendición de cuentas del de lectura del libro auxiliar y ajustar la matriz | Media | Terminada |
| F0-COR-012 | Introducir identificador de clave en la firma de códigos verificables para permitir rotación sin invalidación simultánea | Media | Terminada |
| F0-COR-013 | Incorporar al verificador controles de coherencia entre documentos, no solo de existencia y de presencia de nombres | Alta | Terminada |
| F0-COR-014 | Mover las reglas estatutarias versionadas a la Fase 1 y justificar por escrito las once referencias anulables hacia fases posteriores | Alta | Terminada |

---

## Fase 1 — Infraestructura, datos, autenticación, permisos y Superadmin

| Id | Tarea | Estado |
|---|---|---|
| F1-ARQ-001 | Inicializar Next.js con App Router y TypeScript en modo estricto | Terminada |
| F1-ARQ-002 | Crear la estructura modular y el andamiaje de capas por módulo | Terminada |
| F1-ARQ-003 | Implementar el núcleo de casos de uso: contexto de actor, resultado, errores y correlación | Terminada |
| F1-ARQ-004 | Configurar el linter con reglas de frontera que impidan importar infraestructura desde rutas | Terminada |
| F1-ARQ-005 | Configurar el despliegue en Vercel, regiones, runtime y cabeceras de seguridad | Terminada |
| F1-DAT-001 | Escribir el esquema Prisma multiarchivo de las entidades base de identidad, acceso y territorio | Terminada |
| F1-DAT-002 | Escribir el esquema de archivos, trabajos, bandeja de salida, auditoría y reglas estatutarias versionadas | Terminada |
| F1-DAT-003 | Generar la migración inicial y verificar su ejecución sobre base vacía | Terminada |
| F1-DAT-004 | Retirar los privilegios de actualización y borrado sobre las tablas de bitácora | Terminada |
| F1-DAT-005 | Implementar la semilla idempotente y sin datos personales reales | Terminada |
| F1-DAT-006 | Implementar la verificación de salud de base de datos y de configuración | Terminada |
| F1-AUT-001 | Implementar el registro de credenciales con Argon2id y su comando de generación de hash | Terminada |
| F1-AUT-002 | Implementar inicio y cierre de sesión con rotación y cookies endurecidas | Terminada |
| F1-NOT-001 | Migrar `NotificationTemplate`, `Notification` y `DeliveryAttempt`, e implementar el puerto de correo con plantillas versionadas y registro de entrega | Terminada |
| F1-AUT-003 | Implementar activación por invitación y verificación de correo | Terminada |
| F1-AUT-004 | Implementar recuperación de contraseña con respuesta uniforme y token de un solo uso | Terminada |
| F1-AUT-005 | Implementar el listado y la revocación de sesiones propias | Terminada |
| F1-AUT-006 | Implementar el límite de intentos, el bloqueo temporal y las alertas | Terminada |
| F1-AUT-007 | Implementar el acceso de Superadmin por variables de entorno en ruta independiente | Terminada |
| F1-PER-001 | Implementar el motor de políticas por rol y atributos con filtrado de filas y campos | Terminada |
| F1-PER-002 | Implementar roles, permisos, asignaciones y alcances territoriales | Terminada |
| F1-PER-003 | Implementar la revocación automática al concluir un nombramiento | Terminada |
| F1-PER-004 | Impedir que un administrador ordinario se otorgue permisos superiores | Terminada |
| F1-AUD-001 | Implementar el servicio de auditoría transaccional con encadenamiento por hash | Terminada |
| F1-AUD-002 | Implementar el visor de auditoría con filtrado por alcance del actor | Terminada |
| F1-ARC-001 | Implementar el servicio privado de archivos sobre Vercel Blob con validación de contenido | Terminada |
| F1-ARC-002 | Implementar la descarga por ruta autenticada con URL temporal según clasificación | Terminada |
| F1-ARC-003 | Implementar políticas de retención y bloqueo legal | Terminada |
| F1-JOB-001 | Implementar la cola de trabajos con bloqueo, idempotencia, reintentos y alertas | Terminada |
| F1-JOB-002 | Implementar el despachador de Vercel Cron autenticado y los trabajos base | Terminada |
| F1-UI-001 | Construir las pantallas de acceso, activación, recuperación y sesiones propias | Terminada |
| F1-UI-002 | Construir el tablero técnico de Superadmin y la gestión base de entidades, personas y roles | Terminada |
| F1-SEC-001 | Implementar el límite de tasa, la protección contra falsificación de peticiones y el saneamiento de registros | Terminada |
| F1-QA-001 | Configurar Vitest, base efímera y adaptadores controlados | Terminada |
| F1-QA-002 | Escribir las pruebas negativas de autorización obligatorias del catálogo | Terminada |
| F1-QA-003 | Escribir las pruebas de migración limpia y de actualización | Terminada |
| F1-QA-004 | Configurar la integración continua con los comandos de calidad de la fase | Terminada |
| F1-DOC-001 | Documentar el entorno, las decisiones nuevas y el estado de la fase | Terminada |

### Correcciones de defectos hallados durante la construcción

| Id | Corrección | Severidad | Estado |
|---|---|---|---|
| F1-COR-001 | Añadir a `audit_event` las columnas de la cadena de resúmenes que el modelo declaraba y la migración no creaba | Bloqueante | Terminada |
| F1-COR-002 | Otorgar la facultad de nombrar a la Secretaría Ejecutiva y construir el área de gestión que la ejerce | Bloqueante | Terminada |
| F1-COR-003 | Construir el guion de arranque de la primera Secretaría Ejecutiva | Alta | Terminada |
| F1-COR-004 | Añadir `files.file.download_own` para que la titular de un archivo pueda abrirlo | Alta | Terminada |
| F1-COR-005 | Impedir que un origen desconocido agote el cupo del límite de intentos de todo el sistema | Alta | Terminada |
| F1-COR-006 | Conservar la sesión propia al cerrar las demás | Media | Terminada |
| F1-COR-007 | Retirar la exención del actor raíz en el control de no elevación, inalcanzable pero latente | Media | Terminada |
| F1-COR-008 | Sustituir el byte nulo literal del resumen de auditoría, que volvía binario el módulo para git | Media | Terminada |
| F1-COR-009 | Reparar la puerta de calidad: el linter abortaba antes de revisar un solo archivo | Alta | Terminada |
| F1-COR-010 | Corregir los falsos positivos del verificador en marcadores y en secretos versionados | Media | Terminada |
| F1-COR-011 | Corregir la lectura de entrada del guion de arranque cuando no viene de un terminal | Media | Terminada |
| F1-COR-012 | Un nombramiento sin entidad jurídica no alcanza ninguna, y ningún rol con permisos puede otorgarse sin ella | Bloqueante | Terminada |
| F1-COR-013 | Retirar de la semilla los valores estatutarios inventados y sembrar el conjunto en borrador | Bloqueante | Terminada |
| F1-COR-014 | Comparar la versión de la sesión raíz al resolverla y revocar la fila al cerrar sesión | Alta | Terminada |
| F1-COR-015 | Agrupar el límite de intentos por huella estable y no por el correo enmascarado | Alta | Terminada |
| F1-COR-016 | Emitir la política de contenido con nonce por petición | Media | Terminada |
| F1-COR-017 | Ejecutar la semilla en el despliegue y derivar la salud del correo del propio adaptador | Media | Terminada |
| F1-COR-018 | Alinear la documentación del entorno y de la semilla con lo que el código hace | Media | Terminada |
| F1-COR-019 | Retirar de la vista el campo de periodo de cargo, que nada hace cumplir hasta la Fase 5 | Baja | Terminada |

---

## Fase 2 — Sistema de diseño, PWA, CMS y sitio público

| Id | Tarea | Estado |
|---|---|---|
| F2-UI-001 | Definir los tokens de color, tipografía, espaciado, radio, sombra y movimiento | Hecho |
| F2-UI-002 | Construir las primitivas accesibles personalizadas a la identidad visual | Hecho |
| F2-UI-003 | Implementar tema claro y oscuro con contraste verificado | Hecho |
| F2-UI-004 | Implementar preferencias neuroinclusivas persistentes: densidad, movimiento, enfoque y tamaño de texto | Hecho |
| F2-UI-005 | Construir los patrones de estado: carga, vacío, sin resultados, error, autorización y sesión expirada | Hecho |
| F2-UI-006 | Construir el patrón de formulario por pasos con avance, guardado automático y resumen | Hecho |
| F2-UI-007 | Implementar la navegación pública adaptable desde 360 px | Hecho |
| F2-CMS-001 | Implementar el CMS con borrador, revisión, programación, publicación, archivo e historial | Hecho |
| F2-CMS-002 | Implementar la reversión de versiones y el registro de cambios editoriales | Hecho |
| F2-CMS-003 | Implementar redirecciones, metadatos y las páginas legales configurables por entidad | Hecho |
| F2-UI-008 | Construir las páginas públicas institucionales del mapa funcional | Hecho |
| F2-UI-009 | Construir las páginas públicas de CIAN, CENI y herramientas | Hecho |
| F2-UI-010 | Construir el formulario de contacto y la entrada inicial de solicitudes | Hecho |
| F2-UI-011 | Implementar el buscador público con estados vacío y sin resultados diferenciados | Hecho |
| F2-UI-012 | Construir el centro de accesibilidad y la declaración correspondiente | Hecho |
| F2-PWA-001 | Implementar manifiesto, iconos y comportamiento instalable | Hecho |
| F2-PWA-002 | Implementar caché segura que nunca almacena expedientes ni respuestas autenticadas | Hecho |
| F2-PWA-003 | Indicar con claridad las acciones que requieren conexión | Hecho |
| F2-ARQ-001 | Implementar los catálogos de mensajes y los formatos de fecha, número y moneda | Hecho |
| F2-OPS-001 | Implementar SEO técnico, mapa del sitio, datos estructurados y metadatos sociales | Hecho |
| F2-OPS-002 | Implementar analítica respetuosa de la privacidad para eventos esenciales | Hecho |
| F2-ACC-001 | Verificar los umbrales de accesibilidad en todas las rutas públicas | Hecho |
| F2-QA-001 | Configurar Playwright con perfiles móvil y escritorio, y las pruebas visuales | Hecho |
| F2-QA-002 | Verificar los umbrales de rendimiento de las rutas públicas | Hecho |
| F2-DOC-001 | Documentar el sistema de diseño y actualizar el estado de la fase | Hecho |

**Qué significa «hecho» en F2-UI-008 y F2-UI-009.** Las páginas institucionales del mapa funcional existen: cada ruta contratada resuelve, tiene sus metadatos, es editable desde el gestor de contenidos y, mientras nadie haya publicado nada, dice con todas sus letras que aún no hay contenido en vez de mostrar relleno. Lo que **no** se entrega es el texto: un comunicado o una descripción del sindicato firmados por la organización los escribe la organización. Redactarlos aquí sería poner palabras en boca de Fuerza Índigo, que es la misma clase de error que inventar un valor estatutario. Los datos vivos de CIAN, CENI, herramientas, afiliación, directorio y eventos llegan con sus fases (8, 9, 7, 4, 4 y 11).

---

## Fase 3 — Catálogo financiero, Stripe y libro auxiliar

| Id | Tarea | Estado |
|---|---|---|
| F3-DAT-001 | Migrar las entidades de finanzas con la entidad receptora presente en cada movimiento | Hecho |
| F3-PAG-001 | Implementar el catálogo de productos y precios versionados con identificadores de Stripe | Hecho |
| F3-PAG-002 | Implementar la configuración de las dos cuentas de Stripe y su selección por entidad | Hecho |
| F3-PAG-003 | Implementar el Checkout alojado con clave de idempotencia | Hecho |
| F3-PAG-004 | Implementar el portal de cliente | Hecho |
| F3-PAG-005 | Implementar pagos únicos y suscripciones con periodo de gracia configurable | Hecho |
| F3-PAG-006 | Implementar cupones, becas, exenciones y convenios documentados | Hecho |
| F3-PAG-007 | Implementar la recepción de webhooks por cuenta con firma verificada y persistencia previa | Hecho |
| F3-PAG-008 | Implementar el procesamiento idempotente, transaccional y reintentable de eventos | Hecho |
| F3-PAG-009 | Implementar los pagos manuales con evidencia y doble control | Hecho |
| F3-PAG-010 | Implementar reembolsos con solicitud y aprobación por personas distintas | Hecho |
| F3-LIB-001 | Implementar el libro auxiliar inmutable con asientos de reversión | Hecho |
| F3-LIB-002 | Implementar la conciliación por entidad y periodo con detección de diferencias | Hecho |
| F3-LIB-003 | Implementar el registro patrimonial y sus movimientos con acuerdo habilitante | Hecho |
| F3-LIB-004 | Implementar los cortes y reportes semestrales de rendición de cuentas | Hecho |
| F3-LIB-005 | Implementar las exportaciones autorizadas con motivo, marca temporal y auditoría | Hecho |
| F3-OPS-001 | Implementar las alertas de eventos sin conciliar y de fallos de cobro | Hecho |
| F3-CMS-001 | Implementar las plantillas de comprobante y su emisión | Hecho |
| F3-UI-001 | Construir el panel de finanzas y la vista de pagos de la persona | Hecho |
| F3-QA-001 | Probar pago exitoso, fallido, pendiente, reembolsado y disputado | Hecho |
| F3-QA-002 | Probar firma inválida, evento repetido, evento fuera de orden y cuenta cruzada | Hecho |
| F3-DOC-001 | Documentar el modelo financiero y actualizar el estado de la fase | Hecho |

---

## Fase 4 — Afiliación, padrones, directorios y credenciales

| Id | Tarea | Estado |
|---|---|---|
| F4-DAT-001 | Migrar las entidades de membresías, padrones, relaciones y credenciales | Hecho |
| F4-AFI-001 | Implementar el registro maestro de persona con detección y resolución de duplicidad | Hecho |
| F4-AFI-002 | Implementar la solicitud de agremiado con sus catorce pasos y el resumen inmutable | Hecho |
| F4-AFI-003 | Implementar la afiliación honoraria con sus tres perfiles y su credencial diferenciada | En curso. Perfiles, solicitud y consentimientos hechos; la credencial diferenciada es F4-CRE-001 y la activación por cobro es F4-AFI-008 |
| F4-AFI-004 | Implementar el alta de beneficiario protegido desde los siete orígenes previstos | Hecho |
| F4-AFI-005 | Implementar las relaciones familiares y de cuidado con alcance, vigencia y consentimiento | Hecho |
| F4-AFI-006 | Implementar la revisión humana, la solicitud de aclaración con plazo y la resolución fundada | Hecho |
| F4-AFI-007 | Implementar la gestión documental de la solicitud con revisión por documento | Hecho |
| F4-AFI-008 | Conectar la activación de membresía con el cobro confirmado por webhook | Pendiente |
| F4-AFI-009 | Implementar bajas, suspensiones, vencimientos y conversiones sin duplicar la persona | Pendiente |
| F4-PAD-001 | Implementar el padrón de agremiados con sus filtros e índices reales | Pendiente |
| F4-PAD-002 | Implementar el padrón de afiliados honorarios | Pendiente |
| F4-PAD-003 | Implementar el padrón de beneficiarios protegidos con privacidad reforzada | Pendiente |
| F4-PAD-004 | Implementar la preparación de altas y bajas para las obligaciones ante la autoridad laboral | Pendiente |
| F4-DIR-001 | Implementar el directorio interno con búsqueda, filtros y exportación auditada | Pendiente |
| F4-DIR-002 | Implementar las preferencias de publicación granulares y la publicación pública | Pendiente |
| F4-DIR-003 | Implementar el retiro del consentimiento con invalidación de caché y señal de no indexación | Pendiente |
| F4-CRE-001 | Implementar la emisión de credenciales con código opaco firmado y sus cuatro diseños | Pendiente |
| F4-CRE-002 | Implementar la descarga digital e imprimible de la credencial | Pendiente |
| F4-CRE-003 | Implementar el verificador público con lectura de estado vivo y registro agregado | Pendiente |
| F4-CRE-004 | Implementar la revocación con efecto inmediato en el verificador | Pendiente |
| F4-UI-001 | Construir el panel personal con prioridades reales y sus secciones | Pendiente |
| F4-QA-001 | Probar que una persona acumula calidades sin duplicarse | Pendiente |
| F4-QA-002 | Probar que un afiliado honorario nunca obtiene voto ni computa para el quórum | Pendiente |
| F4-QA-003 | Probar el ciclo completo de solicitud, pago, activación y verificación | Pendiente |
| F4-DOC-001 | Documentar padrones y credenciales, y actualizar el estado de la fase | Pendiente |

---

## Fase 5 — Estructura territorial, gobierno, asambleas y elecciones

| Id | Tarea | Estado |
|---|---|---|
| F5-DAT-001 | Migrar las entidades de gobierno, territorio, votación, negociación y disciplina | Pendiente |
| F5-TER-001 | Implementar las unidades territoriales con jerarquía consultable y acuerdo habilitante | Pendiente |
| F5-TER-002 | Construir el panel territorial con padrón, solicitudes, casos, actividades e indicadores | Pendiente |
| F5-GOB-001 | Implementar órganos, definiciones de cargo y sus conjuntos de permisos | Pendiente |
| F5-GOB-002 | Implementar periodos, suplencias, poderes y su documentación probatoria | Pendiente |
| F5-GOB-003 | Implementar la administración de las reglas estatutarias versionadas, cuyo modelo y semilla existen desde la Fase 1 | Pendiente |
| F5-GOB-004 | Implementar el control de incompatibilidades entre cargos y comisiones | Pendiente |
| F5-ASA-001 | Implementar convocatorias de primera y segunda vuelta con anticipación normativa | Pendiente |
| F5-ASA-002 | Implementar el orden del día, los documentos previos y las reglas de elegibilidad | Pendiente |
| F5-ASA-003 | Implementar el congelamiento del padrón con huella verificable | Pendiente |
| F5-ASA-004 | Implementar el registro de asistencia con credencial, manual y sesión remota | Pendiente |
| F5-ASA-005 | Implementar el cálculo de quórum y su declaración firmada por persona autorizada | Pendiente |
| F5-ASA-006 | Implementar resoluciones, actas, anexos, firmas y niveles de publicación | Pendiente |
| F5-ASA-007 | Implementar el seguimiento de acuerdos con responsable, plazo y estado | Pendiente |
| F5-ELE-001 | Implementar la Comisión Electoral, su calendario y su convocatoria | Pendiente |
| F5-ELE-002 | Implementar el padrón de electores y su publicación conforme a reglas | Pendiente |
| F5-ELE-003 | Implementar el registro y la validación de planillas con alertas de proporcionalidad | Pendiente |
| F5-ELE-004 | Implementar el voto secreto: credencial firmada que no se almacena al emitirse, urna sin identidad ni marca temporal y registro de credencial consumida (ADR-0012) | Pendiente |
| F5-ELE-005 | Implementar el escrutinio verificable, el acta de resultados y las incidencias | Pendiente |
| F5-ELE-006 | Implementar la exportación de evidencia para la autoridad competente | Pendiente |
| F5-NEG-001 | Implementar los expedientes de contrato colectivo y revisión contractual | Pendiente |
| F5-NEG-002 | Implementar la consulta a agremiados afectados con padrón específico congelado | Pendiente |
| F5-NEG-003 | Implementar los expedientes de conflicto colectivo y huelga con acuerdo humano obligatorio | Pendiente |
| F5-DIS-001 | Implementar el procedimiento disciplinario con control de conflicto de interés | Pendiente |
| F5-DIS-002 | Implementar notificación, acceso al expediente, audiencia y valoración de pruebas | Pendiente |
| F5-DIS-003 | Implementar resolución fundada, sanción, recurso y restitución de derechos | Pendiente |
| F5-GOB-005 | Implementar el archivo histórico y los reportes de obligaciones ante autoridad | Pendiente |
| F5-QA-001 | Probar que el quórum es reproducible desde el padrón congelado | Pendiente |
| F5-QA-002 | Probar que el sentido del voto no es correlacionable desde la base | Pendiente |
| F5-QA-003 | Probar que un cargo vencido pierde el acceso sin intervención manual | Pendiente |
| F5-DOC-001 | Documentar la vida institucional y actualizar el estado de la fase | Pendiente |

---

## Fase 6 — Defensa, casos, protección y canalización social

| Id | Tarea | Estado |
|---|---|---|
| F6-DAT-001 | Migrar las entidades de solicitudes, casos, derivaciones y marcas de emergencia | Pendiente |
| F6-CAS-001 | Implementar la solicitud guiada de apoyo con preguntas de información | Pendiente |
| F6-CAS-002 | Implementar la clasificación informativa y la propuesta de canalización | Pendiente |
| F6-CAS-003 | Implementar la confirmación humana obligatoria antes de canalizar | Pendiente |
| F6-CAS-004 | Implementar prioridades, alertas y el protocolo visible de riesgo inmediato | Pendiente |
| F6-CAS-005 | Implementar el expediente de caso con resumen original inalterable | Pendiente |
| F6-CAS-006 | Implementar participantes, calidades y representación | Pendiente |
| F6-CAS-007 | Implementar la asignación por territorio y competencia con escalamiento | Pendiente |
| F6-CAS-008 | Implementar tareas, plazos y próximos pasos | Pendiente |
| F6-CAS-009 | Implementar comunicaciones con audiencias diferenciadas y notas reservadas | Pendiente |
| F6-CAS-010 | Implementar documentos con clasificación de sensibilidad y descarga autorizada | Pendiente |
| F6-CAS-011 | Implementar el cierre con resultado y motivo, y la reapertura controlada | Pendiente |
| F6-SOC-001 | Implementar la canalización entre entidades con los seis requisitos obligatorios | Pendiente |
| F6-SOC-002 | Implementar la selección explícita de campos y documentos que se transfieren | Pendiente |
| F6-SOC-003 | Implementar la aceptación, devolución y seguimiento sin exponer notas reservadas | Pendiente |
| F6-UI-001 | Construir el panel de Trabajo y Conflictos | Pendiente |
| F6-UI-002 | Construir el panel de Neuroinclusión y Enlace Familiar | Pendiente |
| F6-UI-003 | Construir el panel social de Alianza Índigo | Pendiente |
| F6-IND-001 | Implementar indicadores anonimizados de casos con umbrales de privacidad | Pendiente |
| F6-SEC-001 | Implementar la auditoría de lectura, descarga, edición y compartición de material sensible | Pendiente |
| F6-QA-001 | Probar que la persona pide apoyo sin saber qué área corresponde | Pendiente |
| F6-QA-002 | Probar el acceso denegado a expedientes y territorios ajenos | Pendiente |
| F6-DOC-001 | Documentar el modelo de casos y actualizar el estado de la fase | Pendiente |

---

## Fase 7 — Herramientas tecnológicas

| Id | Tarea | Estado |
|---|---|---|
| F7-DAT-001 | Migrar las entidades de herramientas, derechos, lanzamientos e identidad externa | Pendiente |
| F7-HER-001 | Implementar el catálogo de herramientas con identidad visual y estado operativo | Pendiente |
| F7-HER-002 | Implementar planes, elegibilidad declarativa y su motor de evaluación | Pendiente |
| F7-HER-003 | Implementar los derechos de acceso con origen, vigencia y explicación a la persona | Pendiente |
| F7-HER-004 | Implementar el lanzamiento con enlace firmado de corta duración y un solo uso | Pendiente |
| F7-HER-005 | Implementar el vínculo de identidad externa con consentimiento específico | Pendiente |
| F7-HER-006 | Implementar el historial de acceso sin almacenar contenido de la herramienta | Pendiente |
| F7-HER-007 | Implementar la suspensión y revocación con política de conservación | Pendiente |
| F7-HER-008 | Integrar NeuroPlan, ADIA y NEXO con sus modalidades respectivas | Pendiente |
| F7-UI-001 | Construir el panel de herramientas de la persona y el de administración | Pendiente |
| F7-IND-001 | Implementar métricas agregadas de uso por perfil y territorio | Pendiente |
| F7-DOC-001 | Documentar cómo agregar una herramienta nueva sin tocar el núcleo | Pendiente |
| F7-QA-001 | Probar expiración, reutilización de enlace y revocación de derecho | Pendiente |
| F7-QA-002 | Probar que la caída de una herramienta no bloquea el portal central | Pendiente |

---

## Fase 8 — CIAN

| Id | Tarea | Estado |
|---|---|---|
| F8-DAT-001 | Migrar las entidades de admisión, agenda, episodios, planes y notas | Pendiente |
| F8-CIAN-001 | Implementar la admisión y la entrevista inicial con consentimiento informado | Pendiente |
| F8-CIAN-002 | Implementar la valoración de necesidades sin diagnóstico | Pendiente |
| F8-CIAN-003 | Implementar el triage humano, la prioridad y la lista de espera | Pendiente |
| F8-CIAN-004 | Implementar el directorio de profesionales, servicios y verificación de habilitación | Pendiente |
| F8-CIAN-005 | Implementar disponibilidad, capacidad y prevención de traslapes | Pendiente |
| F8-CIAN-006 | Implementar citas presenciales y remotas con recordatorios | Pendiente |
| F8-CIAN-007 | Implementar cancelaciones, reprogramaciones y ausencias | Pendiente |
| F8-CIAN-008 | Implementar el episodio y el expediente de atención | Pendiente |
| F8-CIAN-009 | Implementar planes versionados con objetivos, actividades y seguimiento | Pendiente |
| F8-CIAN-010 | Implementar notas profesionales restringidas con corrección por nota nueva | Pendiente |
| F8-CIAN-011 | Implementar canalizaciones diagnósticas y terapéuticas con consentimiento | Pendiente |
| F8-CIAN-012 | Implementar la coordinación con familia o cuidadores autorizados | Pendiente |
| F8-CIAN-013 | Conectar pagos, becas y comprobantes de servicios | Pendiente |
| F8-CIAN-014 | Integrar la derivación a NeuroPlan | Pendiente |
| F8-CIAN-015 | Implementar encuestas de experiencia, resultados y cierre o alta | Pendiente |
| F8-UI-001 | Construir el panel profesional y el de coordinación con sus bandejas | Pendiente |
| F8-IND-001 | Implementar indicadores agregados y anonimizados de calidad y satisfacción | Pendiente |
| F8-QA-001 | Probar que un profesional solo ve casos asignados | Pendiente |
| F8-QA-002 | Probar que el personal sindical no ve notas clínicas por omisión | Pendiente |
| F8-DOC-001 | Documentar la operación de CIAN y actualizar el estado de la fase | Pendiente |

---

## Fase 9 — CENI

| Id | Tarea | Estado |
|---|---|---|
| F9-DAT-001 | Migrar las entidades de programas, evaluaciones, hallazgos y certificados | Pendiente |
| F9-CENI-001 | Implementar el alta de organizaciones, sus responsables y sus sedes | Pendiente |
| F9-CENI-002 | Implementar el seguimiento de prospección y contratación | Pendiente |
| F9-CENI-003 | Implementar programas, líneas y su contratación con pago a la entidad correcta | Pendiente |
| F9-CENI-004 | Implementar instrumentos de evaluación versionados con criterios y ponderaciones | Pendiente |
| F9-CENI-005 | Implementar el diagnóstico inicial y la captura de respuestas | Pendiente |
| F9-CENI-006 | Implementar la carga y validación de evidencias con solicitud de corrección | Pendiente |
| F9-CENI-007 | Implementar hallazgos con severidad y trazabilidad del evaluador | Pendiente |
| F9-CENI-008 | Implementar planes de mejora con responsables, fechas y verificación | Pendiente |
| F9-CENI-009 | Implementar requisitos de capacitación y su acreditación **por evidencia documental**, sin depender del módulo de eventos | Pendiente |
| F9-CENI-010 | Implementar el control de conflicto de interés del evaluador | Pendiente |
| F9-CENI-011 | Implementar la decisión humana de certificación con fundamento | Pendiente |
| F9-CENI-012 | Implementar la emisión de certificado y distintivo con código firmado | Pendiente |
| F9-CENI-013 | Implementar vigencia, suspensión, revocación y renovación | Pendiente |
| F9-CENI-014 | Implementar el verificador público que distingue los cuatro estados | Pendiente |
| F9-CENI-015 | Implementar el directorio público de organizaciones certificadas | Pendiente |
| F9-CENI-016 | Implementar oportunidades y convenios con agremiados y capacitadores | Pendiente |
| F9-UI-001 | Construir los paneles de organización, evaluador y coordinación | Pendiente |
| F9-IND-001 | Implementar información agregada sobre barreras de inclusión con anonimización | Pendiente |
| F9-QA-001 | Probar que una organización nunca accede a otra | Pendiente |
| F9-QA-002 | Probar que cerrar una evaluación preserva su versión y su evidencia | Pendiente |
| F9-DOC-001 | Documentar el ciclo CENI y actualizar el estado de la fase | Pendiente |

---

## Fase 10 — Inteligencia artificial Gemini

| Id | Tarea | Estado |
|---|---|---|
| F10-DAT-001 | Migrar las entidades de configuración, prompts, conversaciones, generaciones y revisiones | Pendiente |
| F10-IA-001 | Implementar el servicio central de Gemini ejecutado solo en servidor | Pendiente |
| F10-IA-002 | Implementar prompts administrables con versiones, estados y reversión | Pendiente |
| F10-IA-003 | Implementar el laboratorio de pruebas de prompts y su publicación con revisión humana | Pendiente |
| F10-IA-004 | Implementar la base documental con separación de fuentes por permisos | Pendiente |
| F10-IA-005 | Implementar la minimización, redacción y seudonimización antes de enviar al modelo | Pendiente |
| F10-IA-006 | Implementar la validación de la salida contra el esquema declarado | Pendiente |
| F10-IA-007 | Implementar las defensas contra inyección de prompt y exfiltración | Pendiente |
| F10-IA-008 | Implementar la lista de efectos prohibidos y su rechazo en el servicio | Pendiente |
| F10-IA-009 | Implementar orientación inicial y explicación de trámites en lenguaje claro | Pendiente |
| F10-IA-010 | Implementar clasificación sugerida de solicitudes y resúmenes asistidos | Pendiente |
| F10-IA-011 | Implementar el apoyo para redactar comunicaciones y documentos | Pendiente |
| F10-IA-012 | Implementar el apoyo administrativo de CIAN sin diagnóstico | Pendiente |
| F10-IA-013 | Implementar el análisis asistido de evidencia CENI sin decisión | Pendiente |
| F10-IA-014 | Implementar la revisión humana de salidas y su registro | Pendiente |
| F10-IA-015 | Implementar el control de costos, límites y su consulta por módulo | Pendiente |
| F10-IA-016 | Implementar la degradación al flujo humano cuando el proveedor no responde | Pendiente |
| F10-QA-001 | Probar que ningún prompt crítico vive solamente en el código | Pendiente |
| F10-QA-002 | Probar que las fuentes respetan los permisos del usuario | Pendiente |
| F10-DOC-001 | Documentar la gobernanza de la IA y actualizar el estado de la fase | Pendiente |

---

## Fase 11 — Comunicaciones, eventos, capacitación e indicadores

| Id | Tarea | Estado |
|---|---|---|
| F11-DAT-001 | Migrar las entidades de eventos y registros de asistencia | Pendiente |
| F11-NOT-001 | Implementar el centro de notificaciones dentro de la plataforma | Pendiente |
| F11-NOT-002 | Ampliar el envío por correo con campañas, preferencias y reintentos sobre la base construida en la Fase 1 | Pendiente |
| F11-NOT-003 | Implementar notificaciones web con autorización explícita de la persona | Pendiente |
| F11-NOT-004 | Implementar preferencias por categoría sin permitir suprimir avisos obligatorios | Pendiente |
| F11-NOT-005 | Implementar campañas operativas autorizadas y su separación de lo obligatorio | Pendiente |
| F11-EVE-001 | Implementar el calendario público y privado de eventos | Pendiente |
| F11-EVE-002 | Implementar registro, capacidad, elegibilidad y lista de espera | Pendiente |
| F11-EVE-003 | Conectar el cobro de eventos con el catálogo financiero | Pendiente |
| F11-EVE-004 | Implementar asistencia, materiales y evaluación | Pendiente |
| F11-EVE-006 | Enlazar los requisitos de capacitación CENI con eventos, como enriquecimiento del mecanismo por evidencia ya operativo desde la Fase 9 | Pendiente |
| F11-EVE-005 | Implementar constancias verificables y revocables | Pendiente |
| F11-IND-001 | Construir los tableros por rol con decisiones accionables | Pendiente |
| F11-IND-002 | Implementar indicadores territoriales con agregación y umbrales de privacidad | Pendiente |
| F11-IND-003 | Implementar los reportes institucionales y sus exportaciones auditadas | Pendiente |
| F11-IND-004 | Implementar la publicación de transparencia autorizada | Pendiente |
| F11-IND-005 | Implementar alertas de vencimientos y obligaciones | Pendiente |
| F11-QA-001 | Probar que las plantillas están versionadas y que las exportaciones respetan permisos | Pendiente |
| F11-DOC-001 | Documentar comunicaciones e indicadores, y actualizar el estado de la fase | Pendiente |

---

## Fase 12 — Endurecimiento, migración final y liberación productiva

| Id | Tarea | Estado |
|---|---|---|
| F12-QA-001 | Ejecutar íntegros los quince flujos E2E globales | Pendiente |
| F12-SEC-001 | Realizar la revisión de seguridad contra las catorce amenazas del plan | Pendiente |
| F12-SEC-002 | Realizar la revisión completa de permisos positivos y negativos | Pendiente |
| F12-UI-001 | Realizar la revisión visual completa en móvil y escritorio, en claro y oscuro | Pendiente |
| F12-ACC-001 | Realizar la validación de accesibilidad automatizada y la revisión manual | Pendiente |
| F12-QA-002 | Ejecutar las pruebas de rendimiento y de carga en los flujos críticos | Pendiente |
| F12-OPS-001 | Ejercitar la recuperación ante fallos y la restauración de base y archivos | Pendiente |
| F12-PAG-001 | Verificar la conciliación de ambas cuentas de Stripe | Pendiente |
| F12-IA-001 | Revisar costos, límites y registros del servicio de inteligencia artificial | Pendiente |
| F12-OPS-002 | Verificar SEO técnico y comportamiento instalable | Pendiente |
| F12-OPS-003 | Revisar registros, alertas y observabilidad de webhooks y trabajos | Pendiente |
| F12-DAT-001 | Ejecutar la migración de datos existentes cuando los haya | Pendiente |
| F12-DOC-001 | Redactar los manuales operativos por rol | Pendiente |
| F12-DOC-002 | Preparar y realizar la capacitación administrativa | Pendiente |
| F12-OPS-004 | Completar la lista de verificación de despliegue en Vercel | Pendiente |
| F12-OPS-005 | Desplegar a producción y verificar posteriormente | Pendiente |
| F12-DOC-003 | Documentar la aprobación final por módulo | Pendiente |

---

## Cobertura del PRD

Cada sección del PRD tiene tareas asignadas. Esta tabla permite comprobar que nada quedó fuera.

| Sección del PRD | Fases que la implementan |
|---|---|
| §2 Fuente normativa y arquitectura institucional | 0, 1, 5 |
| §3 Personas, membresías y relaciones | 0, 4 |
| §4 Usuarios, roles y control de acceso | 0, 1, 5 |
| §5 Experiencia de usuario y sistema de diseño | 2, y cada fase con interfaz |
| §6 Mapa funcional | 2, 4, 5, 6, 8, 9, 11 |
| §7 Directorios, padrones y credenciales | 4 |
| §8 Afiliación y admisión | 4 |
| §9 Estructura sindical, territorio y gobierno | 5 |
| §10 Protección, defensa y atención social | 6 |
| §11 Pagos, membresías y Stripe | 3 |
| §12 Herramientas tecnológicas | 7 |
| §13 CIAN | 8 |
| §14 CENI | 9 |
| §15 Inteligencia artificial con Gemini | 10 |
| §16 Comunicación, contenidos y notificaciones | 2, 11 |
| §17 Arquitectura técnica obligatoria | 0, 1, 2 |
| §18 Modelo de datos | 0, y la fase que migra cada familia |
| §19 API y contratos de aplicación | 0, 1, y la fase de cada familia |
| §20 Seguridad, privacidad y auditoría | 1, 6, 12 |
| §21 Variables de entorno | 0, 1 |
| §22 Pruebas y calidad | 0, 1, 2, 12 |
| §23 Protocolo de ejecución por fases | 0, y todas |
| §24 Fases de construcción | Todas |
| §25 Criterios de aceptación transversales | Todas |
| §27 Definición final de terminado | 12 |
