# Plan de pruebas y calidad

> Entregable de la **Fase 0** (PRD §24). Contrata la pirámide de pruebas del PRD §22.1, los quince flujos E2E globales del PRD §22.2, los comandos de calidad del PRD §22.3 y los umbrales que gobiernan la puerta universal de salida del PRD §23.2.

---

## 1. Qué significa "probado" en este proyecto

Una función no está terminada por compilar. Está terminada cuando se cumplen los doce criterios transversales del PRD §25: flujo normal, flujos alternos y errores, validación en servidor, permisos probados en positivo **y en negativo**, auditoría en la acción crítica, interfaz moderna y adaptable, estados de carga, vacío, error y éxito, uso con teclado y tecnologías de asistencia, ausencia de fugas en registros, URL y respuestas, pruebas automatizadas proporcionales al riesgo, documentación que refleja el comportamiento real y verificación en despliegue de vista previa.

El plan asigna a cada uno de esos criterios un tipo de prueba concreto, para que ninguno dependa de la buena voluntad de quien revisa.

---

## 2. Pirámide de pruebas (PRD §22.1)

| Nivel | Herramienta | Qué cubre | Dónde vive |
|---|---|---|---|
| Unitarias | Vitest | Reglas de dominio, invariantes, transiciones de estado, cálculos de quórum y proporcionalidad, aritmética de dinero, políticas de autorización puras | `tests/unit/` |
| Integración | Vitest + PostgreSQL aislado | Casos de uso completos contra base real: transacciones, unicidad, aislamiento por entidad y territorio, auditoría escrita | `tests/integration/` |
| Contractuales | Vitest + adaptadores controlados | Stripe, Gemini, correo y herramientas: firma, idempotencia, esquema de salida, degradación | `tests/integration/contracts/` |
| Componentes | Vitest + Testing Library | Componentes críticos con estado: formularios por pasos, tablas con filtros, selectores de consentimiento | `tests/unit/components/` |
| E2E | Playwright | Los quince flujos globales y los flujos propios de cada fase, en móvil y escritorio | `tests/e2e/` |
| Accesibilidad | Playwright + motor de reglas + revisión manual | Rutas representativas de cada superficie | `tests/a11y/` |
| Visuales | Playwright | Rutas representativas en claro y oscuro, 360 px y escritorio | `tests/e2e/visual/` |
| Migración | Vitest + Prisma | Instalación sobre base vacía y actualización desde la fase anterior | `tests/integration/migrations/` |
| Rendimiento y concurrencia | Playwright + guion de carga | Flujos críticos: verificación QR, votación, Checkout, padrón | `tests/e2e/performance/` |

**Regla de proporcionalidad al riesgo:** todo lo clasificado como crítico en [`SECURITY.md`](SECURITY.md) §1 exige prueba de integración **y** prueba negativa de autorización. Nada crítico se cubre solo con pruebas unitarias.

---

## 3. Entornos y datos de prueba

- Base de datos efímera por ejecución, creada y migrada desde el repositorio; nunca se reutiliza una base con estado ajeno.
- Adaptadores controlados para Stripe, Gemini, correo y herramientas: las pruebas **no** llaman a proveedores reales.
- Datos semilla idempotentes y manifiestamente ficticios. **Nunca** se copian datos reales de producción a un ambiente de prueba (PRD §20.3).
- Cada prueba crea su propio contexto de actor con roles, entidad, territorio y asignaciones explícitas; ninguna prueba se apoya en un actor con permisos totales salvo cuando el permiso total es lo que se prueba.

---

## 4. Los quince flujos E2E globales (PRD §22.2)

Cada flujo se ejecuta en móvil (360 px) y escritorio, en tema claro y oscuro, y forma parte de la regresión permanente desde la fase que lo habilita. La Fase 12 los ejecuta íntegros como condición de liberación.

### E2E-01 · Solicitud, revisión, pago, activación y verificación QR de un agremiado
**Fase 4** (depende de 3). Recorre `F-01`: requisitos, cuenta, captura, declaraciones, evidencia, aceptación de estatutos, resumen, envío, revisión humana, aclaración con plazo, resolución fundada, cobro, activación por webhook, emisión de credencial y verificación pública del QR. **Asertos:** la solicitud original permanece inalterada tras la revisión; el número de miembro se asigna solo al activar; la credencial verifica como vigente.

### E2E-02 · Afiliación honoraria con pago y beneficios sin derecho de voto
**Fase 4.** Recorre `F-02` y concluye intentando participar en una votación abierta. **Asertos:** la persona accede a beneficios y herramientas; **no** aparece en `VoteEligibility`; no computa para el quórum; la credencial es visualmente distinta de la de agremiado.

### E2E-03 · Registro de beneficiario protegido sin afiliación ni cobro
**Fase 4.** Recorre `F-03` desde un origen no propio (familiar autorizado). **Asertos:** no se crea membresía ni cobro; la persona recibe atención; el registro nace con privacidad reforzada cuando es menor de edad; no aparece en el padrón remitido a autoridades.

### E2E-04 · Consentimiento y canalización de Fuerza Índigo a Alianza Índigo
**Fase 6.** Recorre `F-10`. **Asertos:** sin consentimiento la canalización no avanza de `AWAITING_CONSENT`; solo viajan los campos y documentos seleccionados; el área receptora acepta y el seguimiento no expone notas reservadas; todo queda auditado.

### E2E-05 · Pago fallido, reintento, conciliación y activación correcta
**Fase 3.** Recorre `F-06`. **Asertos:** el fallo no activa derechos; el periodo de gracia no corta el acceso de inmediato; el reintento exitoso activa una sola vez; repetir el webhook no duplica movimientos; la conciliación cuadra por entidad jurídica.

### E2E-06 · Directorio privado y publicación voluntaria con retiro posterior
**Fase 4.** Recorre `F-08`. **Asertos:** por omisión la persona no aparece; al publicar solo se exponen los campos autorizados; al retirar el consentimiento la ruta pública deja de responder, la caché se invalida y se emite la señal de no indexación.

### E2E-07 · Convocatoria, padrón congelado, quórum, voto secreto y acta
**Fase 5.** Recorre `F-11` y `F-12`. **Asertos:** primera y segunda convocatoria se distinguen; el quórum se calcula desde el padrón congelado y lo declara una persona; el voto duplicado se impide por unicidad de la huella de credencial; el acta se publica en su versión reservada y en su versión publicable. **Aserto adversario:** tras una votación con **tres** personas electoras, sobre un volcado completo de la base ninguna consulta asocia una fila de `Ballot` con una de `VoteEligibility`; se comprueba además que `Ballot` no tiene columna temporal y que sus identificadores no son ordenables en el tiempo. El volumen bajo es deliberado: es el escenario donde cualquier fuga residual sería más explotable.

### E2E-08 · Caso disciplinario con audiencia, resolución y recurso
**Fase 5.** Recorre `F-14`. **Asertos:** sin notificación y sin audiencia no existe transición a resolución; el agremiado accede a su expediente; el recurso se registra y puede revocar la sanción restituyendo derechos; el expediente permanece reservado para quien no está asignado.

### E2E-09 · Acceso a una herramienta por beneficio y revocación al vencer
**Fase 7.** Recorre `F-15`. **Asertos:** la persona ve por qué tiene acceso y hasta cuándo; el enlace firmado expira y no admite reutilización; al vencer el derecho el lanzamiento se deniega; la caída simulada de la herramienta no bloquea el portal.

### E2E-10 · CIAN desde admisión hasta plan y seguimiento
**Fase 8.** Recorre `F-16`. **Asertos:** el triage es humano; un profesional no asignado no ve el expediente; un rol sindical no ve notas clínicas; la familia accede solo a lo autorizado; la corrección de una nota crea una nota nueva sin sobrescribir la original.

### E2E-11 · CENI desde contratación hasta certificado QR y renovación
**Fase 9.** Recorre `F-17`. **Asertos:** una organización no accede a otra; cerrar una evaluación preserva versión y evidencia; la decisión de certificación la firma una persona; el verificador distingue vigente, suspendido, vencido y revocado; la contratación se concilia con la entidad receptora correcta.

### E2E-12 · Consulta a Gemini con permisos y revisión humana
**Fase 10.** Recorre `F-18`. **Asertos:** el prompt proviene de una versión publicada, no del código; las fuentes respetan los permisos del actor; la salida se marca como generada con IA y es editable; una acción sensible exige confirmación humana; con el proveedor caído el flujo continúa por vía humana.

### E2E-13 · Revocación de un rol territorial sin pérdida del historial
**Fase 5** (base en 1). **Asertos:** al concluir el nombramiento el acceso se revoca automáticamente; los actos realizados durante el periodo permanecen íntegros y atribuidos; las sesiones de la persona saliente no se transfieren a su sustituta.

### E2E-14 · Acceso denegado a un expediente ajeno aunque se conozca su identificador
**Fase 1**, ampliado en cada fase que agrega expedientes. **Asertos:** la respuesta es `NOT_FOUND` en superficies públicas y de portal; se registra `SecurityEvent` `ACCESS_DENIED`; la respuesta no revela la existencia del recurso ni datos de terceros; se prueba para casos, episodios CIAN, expedientes CENI, procedimientos disciplinarios y archivos.

### E2E-15 · Despliegue desde base vacía mediante migraciones del repositorio
**Fase 1**, repetido en cada fase. **Asertos:** `prisma migrate deploy` levanta el esquema completo desde cero; la semilla es idempotente y no contiene datos reales; la aplicación arranca y responde la verificación de salud; una migración fallida detiene el despliegue sin dejar el esquema a medias.

---

## 5. Pruebas de autorización negativas

Las trece pruebas negativas obligatorias están enumeradas en [`PERMISSIONS.md`](PERMISSIONS.md) §9 y las catorce amenazas con su prueba y fase propietaria en [`SECURITY.md`](SECURITY.md) §8. Ambas listas son condición de cierre de sus fases: `phase:verify` las exige y la revisión de la puerta universal las verifica.

Regla adicional: **cada permiso nuevo llega con su prueba negativa en el mismo cambio**. Un permiso sin prueba negativa se considera una función incompleta de la fase activa.

---

## 6. Pruebas de migración

Cada fase ejecuta dos escenarios (PRD §17.3, §23.2):

1. **Instalación limpia:** base vacía → todas las migraciones → semilla → arranque → verificación de salud.
2. **Actualización:** base en el estado de la fase anterior con datos representativos → migraciones nuevas → verificación de que ningún dato existente se perdió ni se corrompió, y de que los índices únicos parciales siguen siendo satisfechos.

Se prueba además que una migración con error **detiene** el despliegue, y que las migraciones aplicadas no se editan: una corrección es una migración nueva.

---

## 7. Accesibilidad (PRD §5.2, §5.3)

Umbrales de la puerta de salida:

| Control | Umbral |
|---|---|
| Violaciones automáticas de gravedad crítica o seria | **Cero** en todas las rutas probadas |
| Contraste de texto | AA como mínimo; AAA en texto de cuerpo de rutas de trámite |
| Navegación completa por teclado | 100 % de los flujos, con foco visible y orden lógico |
| Etiquetas visibles en formularios | 100 % de los campos; nunca solo texto de marcador |
| Errores junto al campo | 100 % de los formularios, con explicación en lenguaje claro |
| Objetivos táctiles | 44 × 44 px como mínimo |
| Reducción de movimiento | Respetada; sin parpadeos ni reproducción automática |
| Ampliación de texto | Utilizable al 200 % sin pérdida de contenido ni de función |
| Lectores de pantalla | Revisión manual de los flujos de trámite en cada fase que los introduce |

Controles neuroinclusivos verificados por prueba: procesos largos divididos en pasos con indicador de avance y tiempo estimado; guardado automático con posibilidad de pausar y continuar; resumen antes de enviar; una decisión principal por bloque; preferencias sensoriales persistentes por persona; modo de enfoque que reduce elementos secundarios; y ausencia de exigencia de comprender términos jurídicos o técnicos para completar un trámite.

---

## 8. Rendimiento

| Métrica | Umbral | Dónde se mide |
|---|---|---|
| Largest Contentful Paint | ≤ 2.5 s en móvil simulado con red lenta | Inicio, afiliación, solicitar apoyo, directorio, verificador |
| Interaction to Next Paint | ≤ 200 ms | Formularios por pasos y tablas con filtros |
| Cumulative Layout Shift | ≤ 0.1 | Todas las rutas públicas |
| Respuesta del verificador QR | ≤ 500 ms en el percentil 95 | `/verificar/*` |
| Emisión de boleta bajo concurrencia | Sin voto duplicado con 200 emisiones simultáneas | Módulo de votación |
| Consulta de padrón | ≤ 1 s con 50 000 registros y filtros combinados | Padrón y directorio interno |
| Procesamiento de webhook | ≤ 200 ms hasta persistir el evento | `/api/v1/webhooks/stripe/*` |

Se prueba explícitamente el comportamiento con **conexión lenta o intermitente** (PRD §5.4): los formularios no pierden datos, las acciones que requieren conexión lo indican y ninguna operación se ejecuta dos veces por un reintento del navegador.

---

## 9. Estados de interfaz obligatorios

Cada pantalla o componente de datos prueba los once estados del PRD §5.4: carga inicial, carga incremental, vacío genuino, ausencia de resultados por filtros, error recuperable, error de autorización, sesión expirada, funcionamiento exitoso, confirmación antes de acciones sensibles, deshacer cuando resulte seguro y funcionamiento con conexión lenta.

La distinción entre **vacío genuino** y **sin resultados por filtros** es obligatoria y se verifica: son mensajes y acciones distintas.

---

## 10. Pruebas contractuales de integraciones

| Integración | Qué se prueba |
|---|---|
| Stripe | Firma válida e inválida; evento repetido; evento fuera de orden; evento sin pago local; cuenta cruzada; idempotencia de Checkout; reembolso con doble control; disputa |
| Gemini | Prompt resuelto desde versión publicada; variables no declaradas descartadas; fuentes filtradas por permisos; salida fuera de esquema rechazada; documento con instrucciones incrustadas; proveedor caído y degradación al flujo humano; límite de costo alcanzado |
| Correo | Plantilla versionada; rebote y reintento; supresión por preferencia; aviso obligatorio **no** suprimible |
| Blob | Tipo real falseado; tamaño excesivo; URL vencida; URL de otro actor; eliminación con bloqueo legal activo |
| Herramientas | Token expirado; `jti` reutilizado; derecho revocado; herramienta caída |
| Cron | Invocación sin `CRON_SECRET`; ejecución concurrente que no duplica efectos; agotamiento de reintentos con alerta |

---

## 11. Comandos de calidad (PRD §22.3)

| Comando | Qué hace | Fase que lo habilita |
|---|---|---|
| `npm run lint` | Reglas de estilo y **fronteras de módulos**: falla si una ruta importa Prisma, Blob, Stripe o el SDK de IA | 1 |
| `npm run typecheck` | TypeScript en modo estricto, sin errores ni supresiones sin justificación | 1 |
| `npm run test` | Unitarias y de componentes | 1 |
| `npm run test:integration` | Integración y contractuales contra base efímera | 1 |
| `npm run test:e2e` | Playwright, móvil y escritorio | 2 |
| `npm run test:a11y` | Accesibilidad automatizada sobre rutas representativas | 2 |
| `npm run build` | Construcción de producción | 1 |
| `npm run db:migrate` | Migraciones desde el repositorio | 1 |
| `npm run db:seed` | Semilla idempotente y no sensible | 1 |
| `npm run phase:verify` | Controles de la fase activa; resultado legible por humanos y por agentes | **0** |

`phase:verify` está disponible desde la Fase 0 y no requiere dependencias instaladas. Los demás comandos se declaran en `package.json` **cuando funcionan**: este repositorio no publica comandos que no hagan lo que prometen.

### 11.2 Controles de coherencia del verificador

Los primeros quince controles comprobaban existencia, tamaño y presencia de nombres. No podían detectar contradicciones entre documentos, y su resultado en verde sirvió para declarar aprobada una fase que tenía doce (defecto `D-F0-013`). Los ocho controles de coherencia nacen cada uno de un defecto real y existen para que ese defecto no pueda repetirse en silencio:

| Control | Qué comprueba |
|---|---|
| `C-DATA-03` | Cada entidad del PRD tiene bloque de definición con al menos cuatro campos, no una mención suelta |
| `C-COH-01` | Ninguna relación se declara como arreglo de identificadores |
| `C-COH-02` | Ningún tipo se declara como disyuntiva abierta y ninguna decisión se pospone |
| `C-COH-03` | Ninguna entidad referencia **obligatoriamente** a otra de fase posterior; las referencias anulables hacia adelante exigen justificación escrita |
| `C-COH-04` | El algoritmo de decisión tiene un solo punto de concesión, al final de la tubería, y comprueba las seis condiciones |
| `C-COH-05` | La urna no declara identidad, marca temporal ni identificadores ordenables en el tiempo |
| `C-COH-06` | Una fase con defectos abiertos de severidad bloqueante no puede declararse aprobada |
| `C-COH-07` | Cada defecto abierto tiene su tarea de corrección en el backlog |

**Regla que queda establecida.** Cada defecto que se descubra deja tras de sí un control que lo habría detectado. Un defecto sin control es un defecto que puede repetirse. Y ningún resultado en verde justifica una decisión sin preguntarse antes qué **no** mide el control que lo produjo.

### 11.1 Integración continua

La CI ejecuta, en este orden y deteniéndose al primer fallo: `phase:verify` → `lint` → `typecheck` → `test` → `test:integration` → `build` → `test:e2e` → `test:a11y`. El despliegue a producción ejecuta además `prisma migrate deploy` y se detiene si la migración falla.

---

## 12. Cobertura

La cobertura se mide, pero no sustituye al juicio. Umbrales mínimos:

| Ámbito | Líneas | Ramas |
|---|---|---|
| `src/modules/*/domain` (reglas e invariantes) | 95 % | 90 % |
| `src/modules/*/application` (casos de uso) | 90 % | 85 % |
| `src/platform/authz` y `src/platform/audit` | 95 % | 90 % |
| Resto del código de servidor | 80 % | 70 % |

Un módulo con cobertura alta y sin prueba negativa de autorización **no** cumple: la puerta de salida evalúa ambas cosas.

---

## 13. Puerta de salida por fase (PRD §23.2)

Una fase se cierra solo si, además de los controles automatizados de `phase:verify`, se verifica manualmente:

1. Todo el alcance de la fase implementado, sin funciones parciales.
2. Cero defectos conocidos de severidad crítica, alta o media dentro de la fase.
3. Ningún botón, ruta o acción incompleta.
4. Migraciones correctas desde cero y desde la fase anterior.
5. Permisos probados en positivo y en negativo.
6. Interfaz revisada en móvil y escritorio.
7. Accesibilidad validada contra los umbrales de §7.
8. Estados vacíos y de error terminados.
9. Auditoría conectada a las acciones críticas de la fase.
10. Documentación que refleja el código real.
11. `lint`, `typecheck`, pruebas y `build` en verde.
12. Sin secretos ni datos reales en el repositorio.
13. Informe de cierre emitido.

Si falla un solo punto, la fase queda `BLOCKED` o permanece `IN_PROGRESS`. No existe cierre parcial.

---

## 14. Trazabilidad

| Requisito del PRD | Sección |
|---|---|
| §22.1 Pirámide de pruebas | §2 |
| §22.2 Quince flujos E2E globales | §4 |
| §22.3 Comandos de calidad | §11 |
| §5.4 Estados obligatorios de interfaz | §9 |
| §5.2 y §5.3 Accesibilidad y neuroinclusión | §7 |
| §17.3 Pruebas de migración | §6 |
| §20.5 Amenazas | §5 y `SECURITY.md` §8 |
| §23.2 Puerta universal de salida | §13 |
| §25 Criterios transversales | §1 |
