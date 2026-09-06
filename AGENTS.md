# Fuerza Índigo · cómo se trabaja en este repositorio

Léalo entero antes de tocar nada. Es corto a propósito. Lo que no está aquí está
en `docs/HANDOFF.md`, que es el manual de operación, y en `docs/PRD.md`, que es
el contrato.

## Los cuatro documentos que importan, en este orden

1. **`docs/PRD.md`** — el contrato. Fuente de verdad del alcance y de las once
   fases. Si algo lo contradice, gana el PRD.
2. **`docs/PHASE_STATUS.md`** — **dónde estamos**. Qué fase está activa, en qué
   estado, qué bloques van hechos, qué defectos hay abiertos. Este documento y
   ningún otro dice el estado del proyecto: no lo copie a otro sitio.
3. **`docs/HANDOFF.md`** — cómo se continúa: puesta en marcha, cómo se corre
   cada suite, cómo se construye un bloque, cómo se cierra una fase.
4. **`docs/BACKLOG.md`** — qué queda, repartido por fases y sin tareas huérfanas.

`docs/DECISIONS.md` guarda por qué las cosas son como son. Antes de cambiar algo
que parezca raro, búsquelo ahí: suele estar razonado.

## Las reglas que no se negocian

- **Solo se construye la fase activa** que declara `docs/PHASE_STATUS.md`. Se
  termina al 100 %, se cierra con informe y **se para** a esperar autorización
  expresa (PRD §23). No se adelanta trabajo de la fase siguiente.
- **No hay producto mínimo viable** (PRD §0.3). Ningún botón sin acción, ninguna
  pantalla provisional, ningún dato simulado, ningún `TODO`, ninguna función a
  medias en la fase activa.
- **Las decisiones técnicas las toma quien construye** (PRD §0.1) —ORM, patrón
  de API, estructura de carpetas, validación, pruebas— y se registran en
  `docs/DECISIONS.md`. No se le trasladan a la persona usuaria.
- **CIAN y CENI no se construyen aquí.** Son plataformas propias, independientes
  y ya desarrolladas. Este repositorio las presenta y lleva a ellas con una ficha
  y una dirección externa configurable desde el gestor de contenidos. Nunca se
  toca su repositorio ni su funcionamiento (PRD §13 y §14).
- **Ningún enlace externo se escribe en un componente.** Se administra desde el
  catálogo o el CMS.
- **El proveedor vetado en el PRD §0.2** no se usa en base de datos,
  autenticación, almacenamiento, funciones, SDK, dependencias, variables ni
  documentación. `C-REPO-03` lo comprueba.
- **Nunca se ejecuta `prisma format`** ni se reescribe una migración ya aplicada.
  Una corrección de esquema es una migración correctiva nueva, que debe funcionar
  igual sobre una base al día y sobre una instalación desde cero.
- **Nunca entran datos personales reales** al repositorio, a la semilla, a los
  registros ni a los informes. Ningún secreto se guarda en la base: van en el
  entorno.

## El método

Una regla que nunca se ha visto fallar no está probada: solo se sabe que no
estorba. **Cada garantía se prueba rompiendo el código que la sostiene, viendo la
prueba ponerse en rojo y restaurando.** Ese método ha encontrado defectos reales
que ninguna otra revisión vio, incluidas reglas que no ejercía nadie.

Y la puerta de salida no es lo que corre en su máquina: **la integración continua
tiene que estar en verde** antes de dar por cerrado un bloque.

## Antes de cerrar cualquier cosa

```bash
npm run phase:verify   # controles de la puerta universal (PRD §23.2)
npm run lint && npm run typecheck
npx vitest run && npm run build
npx playwright test    # extremo a extremo y accesibilidad
npm run db:check       # la base configurada coincide con las migraciones
```

Todo verde, y la integración continua también. El detalle está en
`docs/HANDOFF.md`.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
