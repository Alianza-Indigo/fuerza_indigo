# Agregar una plataforma o una herramienta al catálogo

> Entregable de la **Fase 7** (PRD §24, `F7-DOC-001`): *«documentación para
> agregar una plataforma o una herramienta nueva sin tocar el núcleo»*.

Hay dos caminos y conviene no confundirlos. El primero es el normal y **no
toca el repositorio**. El segundo existe para que una instalación nueva
arranque con las fichas del ecosistema ya escritas.

---

## 1. Lo normal: se agrega desde el gestor, sin desplegar nada

Quien tiene `ecosystem.link.manage` —hoy, el rol de contenidos y comunicación—
entra en **Gestión → Catálogo del ecosistema** y edita las fichas: nombre, qué
es, para quién es, acento de color, orden y **dirección de acceso**.

Cambiar una dirección se ve en el sitio público enseguida. No hay despliegue, no
hay variable de entorno, no hay archivo que tocar. Es el punto entero del
catálogo: el día que una plataforma cambie de dominio, arreglarlo es pegar una
dirección, no abrir un ticket.

**Lo que conviene saber al escribir una ficha:**

- **La dirección empieza por `https://`.** No es una preferencia: quien pulsa va
  a escribir su contraseña del otro lado, y por texto plano eso viaja a la vista.
  La base lo impone, así que una dirección mal escrita no llega a guardarse.
- **Dejar la dirección vacía retira el acceso.** La ficha sigue publicada y sigue
  contando qué es esa plataforma; lo que desaparece es el botón. Es lo correcto:
  un botón sin destino real enseña que los botones de este sitio a veces no
  funcionan.
- **Retirar de la vista no borra.** Una plataforma que se cae una semana no
  debería perder su ficha, su orden y su texto.
- **Cambiar la dirección queda registrado**, con quién fue, cuándo, y con el
  valor anterior y el nuevo.

---

## 2. Cuando la ficha debe existir en toda instalación nueva

Solo entonces se toca el repositorio, y solo un archivo: `prisma/seed/index.ts`,
en `seedEcosystemLinks`. Se agrega una entrada más a la lista, con su `code`
—que identifica la ficha para siempre y no se edita—, sus textos, su acento y su
orden.

**Sin dirección.** La semilla no inventa direcciones: nadie que despliegue este
repositorio conoce la dirección real de cada plataforma, y una inventada sería un
botón que lleva a ninguna parte o, peor, al dominio de otro. La dirección la pone
la organización desde el gestor.

La semilla es idempotente y **no pisa lo que alguien ya administró**: volver a
ejecutarla no borra una dirección configurada.

No hay nada más que tocar. En concreto, **no** hay que:

- crear una tabla, una migración ni un enumerado;
- declarar un permiso: `ecosystem.link.manage` cubre todo el catálogo;
- escribir una pantalla: la misma sirve las cinco fichas y servirá la sexta;
- tocar el núcleo de membresías, el catálogo de cobros ni nada de afiliación.

Ese último punto no es una promesa: el criterio `F7-QA-001` crea una ficha nueva
y comprueba que ninguna tabla de membresías, solicitudes, calidades, productos o
pagos cambió.

---

## 3. Lo que este catálogo no hace, y no va a hacer

Cada plataforma del ecosistema —CIAN, CENI, NeuroPlan, ADIA, NEXO— **vive fuera
de este repositorio**, con su propia autenticación, su propia operación, sus
propios cobros y sus propios datos. Este catálogo guarda **su ficha y su
dirección**, y lleva a ellas por redirección externa.

No hay, y no debe agregarse:

| Lo que no hay | Por qué |
|---|---|
| Inicio de sesión único, tokens de lanzamiento, intercambio de identidad | El acceso es una redirección. Pasar la identidad obliga a este repositorio a saber quién es alguien del otro lado, y a mantenerlo sincronizado para siempre |
| API, sincronización de personas, expedientes o pagos | Lo mismo, y además convierte cualquier caída ajena en una caída propia |
| Derechos de acceso, planes, vigencias, registro de quién entró | Quien decide es la persona y el catálogo es público. Un derecho de acceso aquí sería una regla sobre una plataforma que no operamos |
| `iframe` | Mezcla dos sesiones ante quien mira y convierte un fallo ajeno en un fallo aparente de Fuerza Índigo |
| Direcciones escritas en un componente | Obligan a desplegar para corregir una dirección, y mientras tanto mandan gente a donde ya no debe |

Las cinco están comprobadas por el control `C-F7-02` de `npm run phase:verify`,
que recorre el código y falla si alguna aparece. No es una recomendación: es una
puerta.

**Y no se toca el repositorio ni el funcionamiento de esas plataformas.** Ni
para «ayudar». Son de otros equipos y su operación es suya.

---

## 4. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Entidad y sus reglas en la base | `prisma/schema/ecosystem.prisma` y su migración |
| Lectura pública del catálogo | `src/modules/ecosystem/application/catalog.ts` |
| Administración | `src/modules/ecosystem/application/administration.ts` |
| Ficha, acento y decisión de si hay acceso | `src/modules/ecosystem/domain/link.ts` |
| Tarjeta que enseñan las dos pantallas | `src/design-system/ecosystem-card.tsx` |
| Catálogo público · portal · administración | `app/(publico)/herramientas`, `app/(portal)/mi/herramientas`, `app/gestion/contenidos/ecosistema` |
| Semilla | `prisma/seed/index.ts`, `seedEcosystemLinks` |

El contrato está en el PRD §12, §13 y §14; las decisiones y su porqué, en
`docs/DECISIONS.md` (ADR-0126, ADR-0127 y ADR-0128).
