# Variables de entorno

> Entregable de la **Fase 0** (PRD §21). Documenta propósito, obligatoriedad, formato y ambiente de cada variable. La plantilla sin secretos es [`.env.example`](../.env.example); el control `C-ENV-01` de `npm run phase:verify` comprueba que ambas listas coincidan con el PRD.

---

## 1. Reglas generales

1. **Los secretos viven solo aquí.** Nunca en la base de datos, en el código, en el repositorio ni en los registros de aplicación (PRD §20.3).
2. **Ninguna variable pública contiene un secreto.** El prefijo `NEXT_PUBLIC_` llega al navegador; solo lo usan valores públicos por diseño, como las claves publicables de Stripe.
3. **Arranque fallido comprensible.** La ausencia de una variable obligatoria detiene el arranque con un mensaje que dice **qué** falta y **para qué** sirve, sin revelar el valor esperado (PRD §21).
4. **Validación centralizada.** `src/platform/config` valida el conjunto con un esquema Zod al iniciar el proceso; ningún módulo lee `process.env` directamente.
5. **Ambientes separados.** Desarrollo local, Vista previa y Producción tienen bases de datos, almacenes y claves distintos. Nunca se copian datos reales de producción a otro ambiente.
6. **Un solo cargador de archivos.** Todo lo que lee `.env.local` fuera del servidor —migraciones, semillas, pruebas de integración— pasa por `loadLocalEnv()` (`src/platform/config/local-env.ts`), que usa el mismo cargador que la aplicación. El cargador nativo de Node lee el mismo archivo con otras reglas y da otro valor; usar los dos deja a las herramientas viendo una configuración distinta de la del servidor.

### Cómo se escribe en un archivo un valor que lleva `$`

El cargador de entorno **expande variables**. En un archivo, `$argon2id` se sustituye por el contenido de una variable llamada `argon2id`, que no existe, y el valor llega mutilado **sin ningún error a la vista**. Las comillas por sí solas no lo evitan.

| Destino | Cómo se escribe |
|---|---|
| Archivo local (`.env.local`) | Entre comillas simples y con cada `$` escapado: `SUPERADMIN_PASSWORD_HASH='\$argon2id\$v=19\$m=19456,t=2,p=1\$...'` |
| Panel de Vercel | El valor **crudo**, sin comillas ni contrabarras: ahí no hay archivo ni expansión |

`npm run auth:hash-password` imprime las dos formas ya listas, cada una con su destino. La función que compone la línea es `envFileLine()` (`src/platform/config/env-file.ts`); se niega a escribir un valor que el formato no sepa representar sin pérdida —saltos de línea, comillas simples, contrabarra final— en lugar de escribirlo mal.

El analizador desescapa **solo** `\$`. Las contrabarras, las comillas dobles y los acentos graves llegan tal cual. La prueba `tests/unit/config/env-file.test.ts` escribe cada caso, lo carga en un proceso nuevo con el cargador real y compara con el valor original.

Leyenda de obligatoriedad: **Obl.** obligatoria en ese ambiente · **Opc.** opcional · **—** no aplica.

---

## 2. Aplicación y sesiones

| Variable | Propósito | Formato | Desarrollo | Vista previa | Producción |
|---|---|---|---|---|---|
| `APP_URL` | URL absoluta y canónica de la instancia. Base de los enlaces de correo, los retornos de Stripe, las URL de verificación y los metadatos sociales. | URL sin barra final, p. ej. `https://fuerzaindigo.lat` | Obl. | Obl. | Obl. |
| `AUTH_SECRET` | Seudonimización de direcciones de origen, huella de agrupación del límite de intentos y firma de testigos internos de corta duración. **No** firma las sesiones: son testigos opacos aleatorios de los que la base guarda solo el resumen (ADR-0003). | 32 bytes aleatorios en base64url | Obl. | Obl. | Obl. |

Generación de `AUTH_SECRET`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Rotarlo invalida todas las sesiones y todos los enlaces firmados en vuelo. Es la acción de contención inmediata ante una sospecha de compromiso.

---

## 3. Superadmin (PRD §4.4)

| Variable | Propósito | Formato | Desarrollo | Vista previa | Producción |
|---|---|---|---|---|---|
| `SUPERADMIN_EMAIL` | Identifica al Superadmin raíz, que **no** existe como registro editable en la base. | Correo electrónico | Obl. | Obl. | Obl. |
| `SUPERADMIN_PASSWORD_HASH` | Hash Argon2id de su contraseña. La contraseña original nunca se almacena ni se transmite. | `$argon2id$v=19$m=...,t=...,p=...$...` | Obl. | Obl. | Obl. |
| `SUPERADMIN_SESSION_VERSION` | Incrementarlo invalida de inmediato todas las sesiones raíz. | Entero positivo | Obl. | Obl. | Obl. |

El hash se genera con el comando documentado del repositorio, disponible desde la Fase 1:

```bash
npm run auth:hash-password
```

Solicita la contraseña por entrada oculta, no la escribe en el historial del intérprete, en archivos ni en registros, e imprime dos cosas: la línea escapada para pegar en `.env.local` y el valor crudo para el panel de Vercel. Un hash Argon2id empieza por `$` y lleva otros tres, de modo que es justo el valor que un archivo de entorno estropea si se pega sin escapar (véase §1).

---

## 4. Base de datos (PRD §17.3)

| Variable | Propósito | Formato | Desarrollo | Vista previa | Producción |
|---|---|---|---|---|---|
| `DATABASE_URL` | Conexión **agrupada** de Neon usada por la aplicación en ejecución serverless. | `postgresql://usuario:clave@host/base?sslmode=require` | Obl. | Obl. | Obl. |
| `DIRECT_URL` | Conexión **directa** de Neon usada exclusivamente por `prisma migrate` y las semillas. | Igual formato, sin el agrupador | Obl. | Obl. | Obl. |

Cada ambiente usa una base distinta. La rama de vista previa nunca apunta a la base de producción.

### La base de desarrollo se levanta y se comprueba desde el repositorio

| Orden | Qué hace |
|---|---|
| `npm run db:check` | Compara la base configurada con **lo que producen las migraciones** y, si difieren, imprime exactamente qué falta o qué sobra. |
| `npm run db:sync` | Vacía esa base, aplica las migraciones, siembra y la deja lista para trabajar. Solo funciona contra una base local: contra cualquier otra se niega. |

`npm run dev` ejecuta la comprobación antes de arrancar, así que una base desfasada se nota al arrancar y no tres pantallas después.

**Por qué no basta `prisma migrate status`.** Responde «al día» comparando la *lista* de migraciones aplicadas por su nombre, no su contenido. Mientras una fase está en curso, su migración todavía no publicada se edita varias veces y la base local se queda con la primera versión mientras el registro afirma que ya la tiene. A partir de ahí todo miente en la misma dirección: el servidor de desarrollo falla con columnas que «existen», `prisma migrate diff` propone deshacer cosas que sí están en el repositorio, y las pruebas pasan —construyen su base desde cero en cada ejecución— mientras la máquina de quien programa no funciona.

**Qué compara exactamente.** La base contra el resultado de `prisma/migrations`, **no** contra el esquema Prisma. La diferencia importa: el esquema no sabe expresar `text_pattern_ops`, de modo que compararlo con él propondría borrar el índice de prefijo territorial en cada ejecución (ADR-0027).

**Y deja la base utilizable, no solo migrada.** La semilla deja los avisos de privacidad en borrador a propósito —publicarlos es un acto de la organización, no una consecuencia de instalar el sistema—, pero sin uno publicado el formulario público se niega a recabar datos y ni el sitio de desarrollo ni las pruebas de extremo a extremo pueden funcionar. `db:sync` lo publica en la base local, lo dice en voz alta y explica que en un despliegue real lo publica la organización desde su pantalla. Nada de esto se hace a mano.

---

## 5. Almacenamiento de archivos (PRD §17.4)

| Variable | Propósito | Formato | Desarrollo | Vista previa | Producción |
|---|---|---|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | Acceso de lectura y escritura al almacén de Vercel Blob. Todos los objetos se escriben con acceso privado. | Token del proveedor | Obl. | Obl. | Obl. |
| `FILE_URL_SIGNING_SECRET` | Firma de las URL temporales de descarga emitidas por la aplicación. Independiente de `AUTH_SECRET` para poder rotarse por separado. | 32 bytes aleatorios en base64url | Obl. | Obl. | Obl. |

Rotar `FILE_URL_SIGNING_SECRET` invalida las URL de descarga en vuelo sin afectar sesiones.

---

## 6. Stripe (PRD §11.2)

Cada entidad jurídica tiene su propio conjunto. La ruta de webhook incluye la cuenta: `/api/v1/webhooks/stripe/{account}`.

| Variable | Propósito | Formato | Desarrollo | Vista previa | Producción |
|---|---|---|---|---|---|
| `STRIPE_FUERZA_SECRET_KEY` | Clave secreta de la cuenta del sindicato. Conceptos sindicales. | Clave secreta de Stripe | Opc. hasta Fase 3 | Obl. desde Fase 3 | Obl. desde Fase 3 |
| `STRIPE_FUERZA_WEBHOOK_SECRET` | Secreto de firma del webhook de esa cuenta. | Secreto de endpoint de Stripe | Opc. hasta Fase 3 | Obl. desde Fase 3 | Obl. desde Fase 3 |
| `NEXT_PUBLIC_STRIPE_FUERZA_PUBLISHABLE_KEY` | Clave publicable de esa cuenta. **Pública por diseño.** | Clave publicable de Stripe | Opc. hasta Fase 3 | Obl. desde Fase 3 | Obl. desde Fase 3 |
| `STRIPE_ALIANZA_SECRET_KEY` | Clave secreta de la cuenta de la A.C. Programas sociales, cursos y aportaciones. | Clave secreta de Stripe | Opc. hasta Fase 3 | Obl. desde Fase 3 | Obl. desde Fase 3 |
| `STRIPE_ALIANZA_WEBHOOK_SECRET` | Secreto de firma del webhook de esa cuenta. | Secreto de endpoint de Stripe | Opc. hasta Fase 3 | Obl. desde Fase 3 | Obl. desde Fase 3 |
| `NEXT_PUBLIC_STRIPE_ALIANZA_PUBLISHABLE_KEY` | Clave publicable de esa cuenta. **Pública por diseño.** | Clave publicable de Stripe | Opc. hasta Fase 3 | Obl. desde Fase 3 | Obl. desde Fase 3 |

En desarrollo y vista previa se usan claves de prueba. Si al inicio se opera una sola cuenta autorizada, se configura ese conjunto y el otro queda vacío; el modelo de datos ya distingue la entidad receptora en cada movimiento, de modo que separar después no reconstruye el historial.

---

## 7. Inteligencia artificial (PRD §15)

| Variable | Propósito | Formato | Desarrollo | Vista previa | Producción |
|---|---|---|---|---|---|
| `GEMINI_API_KEY` | Clave del SDK oficial de Google. Se usa **exclusivamente en servidor**. | Clave del proveedor | Opc. hasta Fase 8 | Obl. desde Fase 8 | Obl. desde Fase 8 |
| `GEMINI_DEFAULT_MODEL` | Modelo con el que se **siembra** la configuración del proveedor en una instalación nueva. En marcha no lo lee nadie: el modelo por omisión y los modelos permitidos son `AiProviderConfiguration`, que se administra desde la plataforma (PRD §15.1). Cambiar esta variable en una instalación ya sembrada no cambia nada, y ese es el punto: el mismo dato no puede mandar desde dos sitios. | Identificador de modelo, p. ej. `gemini-2.5-flash` | Opc. hasta Fase 8 | Obl. desde Fase 8 | Obl. desde Fase 8 |

Sin estas variables, el servicio de IA queda deshabilitado y la aplicación **continúa operando** por los flujos humanos equivalentes (PRD §15.5). Los límites de tokens, peticiones y costo se administran en `AiProviderConfiguration`, no por entorno.

---

## 8. Correo transaccional (PRD §16.2)

| Variable | Propósito | Formato | Desarrollo | Vista previa | Producción |
|---|---|---|---|---|---|
| `EMAIL_PROVIDER` | Adaptador activo del puerto de correo. | `resend` · `smtp` · `console` | Obl. | Obl. | Obl. |
| `EMAIL_FROM` | Remitente verificado de los mensajes institucionales. | `Nombre <correo@dominio>` | Obl. | Obl. | Obl. |
| `EMAIL_API_KEY` | Credencial del proveedor. | Clave del proveedor | — con `console` | Obl. salvo `console` | Obl. |

En desarrollo se usa `console`: los mensajes se registran sin enviarse y sin exponer datos personales. En pruebas automatizadas se usa un adaptador de captura que permite verificar el contenido sin salida real.

---

## 9. Trabajos programados y verificación pública

| Variable | Propósito | Formato | Desarrollo | Vista previa | Producción |
|---|---|---|---|---|---|
| `CRON_SECRET` | Autentica las invocaciones de Vercel Cron a `/api/v1/cron/*`. Se compara en tiempo constante. | 32 bytes aleatorios en base64url | Obl. | Obl. | Obl. |
| `QR_SIGNING_SECRET` | **Llavero** de firma de los códigos opacos de las credenciales. Contiene la clave activa y, durante una rotación, las anteriores que aún deben poder verificarse. | Lista separada por comas de entradas `identificador:clave`, la primera es la activa. Ej.: `k2:<32 bytes base64url>,k1:<32 bytes base64url>` | Obl. | Obl. | Obl. |

**Rotación sin invalidación simultánea (defecto `D-F0-012`).** Cada credencial y cada certificado guardan en `signingKeyId` el identificador de la clave con la que se firmaron. Rotar consiste en anteponer una clave nueva al llavero: lo emitido a partir de ese momento se firma con ella, y lo emitido antes **sigue verificando** con la clave anterior, que permanece en el llavero. Solo cuando la última credencial firmada con una clave vieja ha vencido o se ha reemplazado se retira esa entrada del llavero.

Sin el identificador de clave, una sola rotación invalidaría de golpe todas las credenciales sindicales vigentes, lo que convertía una medida de higiene criptográfica en un incidente institucional. Retirar una clave del llavero **antes** de tiempo sí produce ese efecto, y por eso el panel de salud muestra cuántas credenciales vivas dependen de cada clave antes de permitir su retiro.

---

## 10. Matriz de rotación

| Variable | Frecuencia sugerida | Efecto inmediato de la rotación |
|---|---|---|
| `AUTH_SECRET` | Ante sospecha de compromiso | Anula los enlaces firmados en vuelo y reinicia los recuentos del límite de intentos. **No** cierra las sesiones abiertas: como no las firma, rotarlo no las invalida. Para cerrarlas hay que revocarlas, y para las del actor raíz, subir `SUPERADMIN_SESSION_VERSION` |
| `SUPERADMIN_PASSWORD_HASH` | Al cambiar la persona responsable o ante sospecha | Invalida la contraseña anterior |
| `SUPERADMIN_SESSION_VERSION` | Ante sospecha o al concluir una intervención de soporte | Cierra todas las sesiones raíz |
| `DATABASE_URL` / `DIRECT_URL` | Según política del proveedor | Requiere redespliegue |
| `BLOB_READ_WRITE_TOKEN` | Según política del proveedor | Requiere redespliegue |
| `FILE_URL_SIGNING_SECRET` | Ante sospecha | Anula las URL de descarga vigentes |
| `STRIPE_*_SECRET_KEY` | Según política del proveedor, con periodo de solapamiento | Requiere actualizar antes de revocar la anterior |
| `STRIPE_*_WEBHOOK_SECRET` | Al recrear el endpoint | Los eventos firmados con el secreto anterior dejan de validar |
| `GEMINI_API_KEY` | Según política del proveedor | El servicio de IA degrada al flujo humano hasta actualizarla |
| `EMAIL_API_KEY` | Según política del proveedor | Los envíos fallan y se reintentan hasta actualizarla |
| `CRON_SECRET` | Anual o ante sospecha | Debe actualizarse en Vercel Cron en el mismo cambio |
| `QR_SIGNING_SECRET` | Anual, anteponiendo una clave nueva | Ninguno inmediato: lo ya emitido verifica con su clave anterior mientras siga en el llavero. Retirar una clave con credenciales vivas sí las invalida |

---

## 11. Configuración por fase

Una variable no es obligatoria antes de la fase que la usa. `phase:verify` comprueba que **estén documentadas y presentes en la plantilla** desde la Fase 0; la obligatoriedad de tener un **valor** se activa con la fase correspondiente.

La fase que manda es la constante `ACTIVE_PHASE` de `src/platform/config/env.ts`, y **se sube al abrir cada fase, no al cerrarla**. Quedarse corta no da un aviso: da un arranque limpio con las claves vacías y un fallo en el primer cobro (defecto `D-F4-002`).

| Fase | Variables que pasan a ser obligatorias |
|---|---|
| 1 | `APP_URL`, `AUTH_SECRET`, `SUPERADMIN_*`, `DATABASE_URL`, `DIRECT_URL`, `BLOB_READ_WRITE_TOKEN`, `FILE_URL_SIGNING_SECRET`, `CRON_SECRET`, `EMAIL_PROVIDER`, `EMAIL_FROM` |
| 3 | `STRIPE_*` de ambas cuentas |
| 4 | `QR_SIGNING_SECRET`, que en realidad se exige desde el primer arranque: un llavero de firma vacío no tiene valor por omisión razonable, así que su formato se valida siempre |
| 5 | `VOTE_CREDENTIAL_SECRET`, secreto maestro del que se deriva la clave de firma de cada votación (ADR-0012) |
| 8 | `GEMINI_API_KEY`, y `GEMINI_DEFAULT_MODEL`, que el arranque exige porque la instalación no está completa sin ella: la semilla se niega a escribir una configuración de proveedor sin modelo, y el arranque lo advierte antes y más barato |

`EMAIL_API_KEY` no entra en esta tabla porque no depende de la fase sino del proveedor: con `EMAIL_PROVIDER=console` no hace falta, y con un proveedor real es obligatoria desde el primer envío.

### La tabla se comprueba contra la integración continua

El control `C-COH-14` coteja `REQUIRED_BY_PHASE` con las variables que declara `.github/workflows/calidad.yml`, y falla nombrando la que falte.

Y el control `C-COH-18` coteja **esta tabla** con esa misma constante. Se escribió porque la fila de Gemini decía «Fase 10» —su número antes de la corrección de alcance— mientras la tabla de arriba de este documento decía 8: la cuarta vez que un número de fase escrito a mano sobrevive a una renumeración. Una tabla que repite una constante y no se coteja con ella no documenta; se separa.

Existe por un fallo real. `VOTE_CREDENTIAL_SECRET` se introdujo al abrir la Fase 5, quien la introdujo la escribió en su `.env.local` y siguió trabajando: en su máquina todo pasaba y la integración continua se caía en la primera prueba que arranca la aplicación, con un mensaje que aconseja copiar `.env.example` —un consejo dirigido a una persona, inútil dentro de un contenedor—. Estuvo tres commits en rojo, el cierre de la Fase 5 entre ellos.

La tabla ya existía y era correcta. Lo que faltaba era algo que la cotejara con el único sitio donde tenía que reflejarse.

---

## 12. Trazabilidad

| Requisito del PRD | Sección |
|---|---|
| §21 Variables mínimas y arranque fallido comprensible | §1 a §9 |
| §4.4 Superadmin por entorno y comando de hash | §3 |
| §11.2 Separación de cuentas de Stripe | §6 |
| §15.1 Gemini solo en servidor | §7 |
| §16.2 Correo desacoplado | §8 |
| §17.3 Doble conexión de Neon | §4 |
| §17.4 Archivos privados y firma de URL | §5 |
| §17.5 Autenticación de trabajos programados | §9 |
| §20.3 Secretos solo en entorno y separación de ambientes | §1, §10 |

---

## Variable opcional de desarrollo

| Variable | Obligatoria | Ambiente | Para qué sirve |
|---|---|---|---|
| `SHADOW_DATABASE_URL` | No | Solo desarrollo | Base vacía y desechable donde `prisma migrate dev` y `prisma migrate diff` levantan una copia del esquema para compararla. En Neon no se puede crear una base al vuelo, de modo que hay que apuntarla a una base vacía preparada de antemano. Ni la aplicación ni el despliegue la necesitan: su ausencia no impide nada en producción. |
