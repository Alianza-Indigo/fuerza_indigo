# Sistema de diseño

> Entregable de la **Fase 2** (PRD §24, `F2-DOC-001`). Documenta los tokens, las primitivas, los temas, las preferencias neuroinclusivas y los patrones de estado que contrata el PRD §5. Lo que aquí se afirma se comprueba en `tests/unit/design/`, `tests/a11y/` y `tests/e2e/visual/`; nada de esto es una intención.

---

## 1. Por qué no hay una biblioteca de componentes

El PRD §17.2 admite `shadcn/ui` «completamente personalizado mediante tokens propios». Se construyeron primitivas propias, y la razón no es preferencia estética.

Los componentes de una biblioteca traen decisiones de accesibilidad tomadas para un caso general: un objetivo táctil de 36 píxeles, una etiqueta que puede sustituirse por texto de marcador, un anillo de foco que se puede desactivar con una propiedad. Cada una de esas decisiones se puede corregir, pero corregirlas todas en cada componente cuesta más que escribir el componente, y sobre todo **deja abierta la posibilidad de que la siguiente pantalla no las corrija**.

Aquí las decisiones están en la primitiva y no hay forma de esquivarlas: `Field` no admite un `placeholder` sin `label`, `SubmitButton` no admite un alto menor que 44 píxeles, ninguna primitiva acepta `className`. Un control accesible no es el que se puede configurar bien: es el que no se puede configurar mal.

---

## 2. Tokens

Tres capas, en `app/globals.css`. La regla que las separa es simple: **una pantalla nunca usa un color de la paleta directamente**.

| Capa | Qué es | Ejemplo | Quién la usa |
|---|---|---|---|
| Paleta | El color en sí, en OKLCH | `--color-indigo-600` | Solo la capa semántica |
| Semántica | Para qué sirve | `--color-accent`, `--color-ink-soft` | Las primitivas y las pantallas |
| Preferencia | Cómo lo quiere cada persona | `--pref-text-scale`, `--pref-density-scale` | La capa semántica |

**Por qué OKLCH.** Dos colores con la misma `L` se perciben igual de claros aunque tengan tonos distintos, cosa que no ocurre en HSL. Es lo que permite que los cinco acentos de módulo se distingan sin que uno parezca apagado al lado de otro, y lo que hace verificable la afirmación «comparten familia»: la prueba compara la luminosidad, no la impresión de quien la escribió.

**Por qué la capa semántica.** Sin ella, cambiar el índigo obliga a buscar cada sitio donde alguien lo usó y decidir uno por uno si ahí significaba «acento», «enlace» o «borde». Con ella, se cambia en un sitio.

### Acentos de módulo

| Módulo | Token | Qué identifica |
|---|---|---|
| Sindicato | `--color-indigo-500` | Fuerza Índigo |
| Alianza | `--color-alianza-500` | Alianza Índigo, acción social |
| CIAN | `--color-cian-500` | Atención neurodivergente |
| CENI | `--color-ceni-500` | Certificación de entornos |
| Herramientas | `--color-tools-500` | NeuroPlan, ADIA y NEXO |

Los cinco comparten luminosidad y varían solo en tono y croma. Es lo que el criterio 2 de la fase pide con «diferencia módulos sin fragmentar el ecosistema», y `tests/unit/design/contrast.test.ts` lo comprueba calculando sobre los tokens, no sobre una captura.

---

## 3. Contraste

El umbral de `docs/TEST_PLAN.md` §7 es AA como mínimo y AAA en el texto de cuerpo. Lo que hay aquí lo supera y **se calcula en cada ejecución de las pruebas**:

| Token | Sobre | Razón exigida | Por qué esa |
|---|---|---|---|
| `--color-ink` | `--color-bg` | ≥ 7:1 (AAA) | Es el texto que se lee entero, no el que se ojea |
| `--color-ink-soft` | `--color-bg` | ≥ 4.5:1 (AA) | Texto secundario, pero texto al fin |
| `--color-line-strong` | `--color-bg` | ≥ 3:1 | Es el borde de un control: si no se ve, el campo no existe |
| Acentos y señales | `--color-bg` | ≥ 4.5:1 | Llevan texto encima |

`--color-line` es la única línea decorativa y **no** tiene umbral: separa visualmente sin comunicar nada. Distinguirla de `--color-line-strong` fue una corrección: antes había un solo token de línea, al 1.32:1, usado tanto para separadores como para bordes de campo.

La conversión de OKLCH a luminancia relativa está en `src/design-system/color.ts`, implementada con las fórmulas de Björn Ottosson y la definición 1.4.3 de WCAG 2.2. No se usa una biblioteca porque son treinta líneas y porque tenerlas aquí permite que la prueba lea **la misma hoja de estilos que sirve el navegador** y compare valores, en vez de confiar en una tabla escrita a mano.

---

## 4. Temas

Tres estados, no dos: claro, oscuro y **lo que diga el sistema**, que es el valor por omisión.

Los tokens se declaran tres veces y el orden importa:

1. En `:root` a secas, la paleta clara completa.
2. Dentro de `@media (prefers-color-scheme: dark)` con `:root:not([data-theme="light"])`, solo los que cambian.
3. Dentro de `:root[data-theme="dark"]`, los mismos.

La tercera declaración es la que hace que fijar el tema a mano gane sobre el del sistema en **las dos direcciones**. Los bloques 2 y 3 son idénticos, y una prueba compara sus textos: cuando divergieron, el tema oscuro fijado a mano se veía distinto del tema oscuro automático, y nadie lo notó hasta que la prueba lo dijo.

El tema se aplica **en el servidor**, como atributo de `<html>`. Nada parpadea porque nada se decide en el navegador.

---

## 5. Preferencias neuroinclusivas

Cinco ejes independientes (PRD §5.3). Se presentan por separado a propósito: no hay un «modo accesible» que los active en bloque, porque quien necesita el texto más grande no necesariamente quiere perder el movimiento, y agruparlos obligaría a aceptar cambios que nadie pidió.

| Eje | Valores | Qué cambia |
|---|---|---|
| `text` | normal · grande · mayor | `--pref-text-scale`, que multiplica toda la escala tipográfica |
| `density` | normal · amplia | `--pref-density-scale`, que multiplica la unidad de espaciado |
| `motion` | sistema · reducido | Desactiva transiciones y animaciones |
| `focus` | inactivo · activo | Atenúa lo marcado como `data-secondary`. **Nada desaparece**: vuelve al pasar por encima |
| `theme` | sistema · claro · oscuro | Fija el tema |

**Dónde se guardan.** En una cookie de un año, y además en el registro de la persona cuando tiene cuenta. La preferencia de la cuenta gana sobre la cookie: alguien que ajusta el tamaño del texto en su teléfono lo encuentra ajustado en la computadora de la delegación.

**Qué no se mide de ellas.** La medición agregada cuenta que el centro de accesibilidad se usó, nunca qué se eligió. Subir el tamaño del texto o reducir el movimiento es un dato de salud.

---

## 6. Primitivas

En `src/design-system/primitives.tsx`. Ninguna acepta `className`: una primitiva que admite estilos por fuera deja de garantizar nada, porque cualquier pantalla puede deshacer su contraste o su tamaño con una clase.

### Formulario

`Field` · `TextArea` · `Select` · `RadioGroup` · `Checkbox`

Todas comparten la misma estructura: **etiqueta visible siempre**, ayuda opcional y errores junto al campo, los tres asociados con `aria-describedby`. La etiqueta nunca se sustituye por texto de marcador, porque al escribir el marcador desaparece y la persona pierde la referencia de qué se le pedía.

`RadioGroup` admite una explicación por opción. Es lo que permite elegir sin conocer el vocabulario de la institución: nadie tiene que saber si lo suyo es un «conflicto colectivo» para pedir ayuda.

### Acción

`SubmitButton` · `LinkButton`

Un enlace con apariencia de botón sigue siendo un enlace: navega, se comparte y se abre en otra pestaña. Los dos garantizan 44 píxeles de alto.

### Estado (PRD §5.4)

`Notice` · `ErrorNotice` · `SuccessNotice` · `ForbiddenNotice` · `ExpiredSessionNotice` · `EmptyState` · `NoResults` · `Skeleton` · `RequiresConnection`

`EmptyState` y `NoResults` son distintos a propósito: **aún no has buscado** y **no hay resultados para lo que buscaste** no dicen lo mismo ni ofrecen lo mismo.

`Notice` anuncia con `role="status"` salvo cuando el tono es de peligro, que usa `alert`. La diferencia importa: un `alert` interrumpe la lectura de un lector de pantalla en mitad de una frase, y perder la conexión no merece esa interrupción.

### Estructura

`PageShell` · `AuthShell` · `Card` · `Section` · `Prose` · `Badge` · `ModuleBadge` · `ScrollableTable` · `Disclosure`

`ScrollableTable` desplaza la tabla dentro de su propio marco. Una tabla ancha que desplaza la página entera hace perder la posición de lectura en cada columna.

### Proceso por pasos

`src/design-system/stepper.tsx`, para trámites largos (PRD §5.3): avance visible, guardado automático en el dispositivo, posibilidad de pausar y continuar, y resumen antes de enviar. El foco se mueve al encabezado en cada paso, para que quien usa lector de pantalla sepa que cambió de sitio.

---

## 7. Movimiento

Todas las transiciones usan `--duration-fast` y `--duration-normal`, y las dos valen cero cuando el sistema pide movimiento reducido o cuando la persona lo elige aquí. Nada parpadea ni se reproduce solo.

---

## 8. Marca provisional

El icono de la aplicación instalable y la imagen social se generan con `npm run design:icons` a partir de los tokens. Son una marca tipográfica —las iniciales sobre el índigo—, no un logotipo que se presente como la identidad de la organización: son la pieza mínima que exige un manifiesto para poder instalar la aplicación. Cuando la organización aporte su marca, se sustituyen los archivos y el guion deja de hacer falta.

---

## 9. Qué comprueba cada prueba

| Qué se afirma | Dónde se comprueba |
|---|---|
| Los contrastes cumplen sus umbrales | `tests/unit/design/contrast.test.ts`, calculando sobre `app/globals.css` |
| Los dos bloques de tema oscuro no divergen | Misma prueba, comparando sus textos |
| Los acentos de módulo comparten luminosidad | Misma prueba |
| Las primitivas no admiten `className` | `tests/unit/design/primitives.test.ts` |
| Las preferencias se leen sin romperse ante un valor inválido | `tests/unit/design/preferences.test.ts` |
| Cero violaciones críticas o serias, en los dos temas | `tests/a11y/rutas-publicas.spec.ts` |
| 44 píxeles, 200 % de ampliación y 360 px sin desbordamiento | Misma suite |
| Los dos temas pintan y son distintos; el fijado gana | `tests/e2e/visual/temas.spec.ts` |
| El texto grande agranda y el enfoque atenúa sin esconder | Misma suite |

---

## 10. Trazabilidad

| Sección del PRD | Dónde se cumple |
|---|---|
| §5.1 Diseño desde 360 px | `tests/a11y` y `tests/e2e/visual`, en los dos perfiles |
| §5.2 Accesibilidad AA | §3 de este documento y la suite de accesibilidad |
| §5.3 Neuroinclusión | §5 y §6 de este documento |
| §5.4 Estados obligatorios | §6, bloque de estado |
| §17.2 Tokens propios | §1 y §2 de este documento |
| §24 Fase 2, criterio 2 | §2, acentos de módulo |
