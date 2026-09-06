# Cómo se continúa este proyecto

> Manual de operación. Está escrito para quien llega sin haber visto nada: otra
> ventana, otra cuenta, otra persona, otro agente. Explica **cómo** se trabaja.
>
> **No dice en qué fase estamos.** Eso lo dice `docs/PHASE_STATUS.md` y solo él.
> Un segundo sitio que declare el estado se desincroniza del primero, y esa es la
> forma exacta en que este proyecto ya se equivocó una vez (`D-F6-006`). El
> control `C-COH-17` impide que este documento nombre una fase concreta.

---

## 1. Lo primero, en tres minutos

```bash
cat docs/PHASE_STATUS.md   # dónde estamos: fase activa, estado, bloques, defectos
npm run phase:status       # la misma fase, según el arranque
npm run phase:verify       # ¿la puerta universal está en verde ahora mismo?
```

Con eso ya sabe qué se está construyendo, qué falta y si el repositorio está
sano. `docs/BACKLOG.md` dice qué queda por delante; `docs/PRD.md` §24 dice qué
contrata cada fase.

---

## 2. Puesta en marcha

Hace falta Node 22 o superior y un PostgreSQL 16 al que poder conectarse. La
aplicación usa una sola base de datos; en producción es Neon.

```bash
npm install
cp .env.example .env.local     # cada variable está explicada en docs/ENVIRONMENT.md
npm run db:generate
npm run db:migrate             # levanta el esquema desde las migraciones
npm run db:seed                # semilla idempotente, sin un solo dato real
npm run dev
```

`.env.local` necesita como mínimo `APP_URL`, `AUTH_SECRET`, `DATABASE_URL`,
`DIRECT_URL`, el Superadmin raíz y las variables que la fase activa vuelve
obligatorias. Si falta alguna, el arranque se detiene y **dice cuál**: no hay que
adivinar. `src/platform/config/env.ts` declara desde qué fase se exige cada una.

`npm run auth:hash-password` genera el hash Argon2id del Superadmin en las dos
formas que hacen falta: la de archivo, con las contrabarras que el cargador
necesita, y la cruda para pegar en el panel de Vercel.

### Un PostgreSQL local, si no hay ninguno a mano

Cualquier PostgreSQL 16 sirve. Un servidor propio del proyecto, sin tocar el
del sistema:

```bash
sudo -u postgres /usr/lib/postgresql/16/bin/initdb -D /var/lib/postgresql/fi
sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/fi \
  -l /var/lib/postgresql/fi/pg.log -o "-p 5433 -k /tmp -c listen_addresses=''" start
```

Con eso, `DATABASE_URL` y `DIRECT_URL` apuntan a
`postgresql://…@localhost:5433/fuerza_dev`.

`npm run db:check` compara la base configurada contra **lo que producen las
migraciones**, no contra el esquema de Prisma, y dice qué sobra y qué falta.
`npm run db:sync --apply` la pone al día. Es la comprobación que detecta que
alguien tocó la base a mano.

---

## 3. Cómo se corre cada cosa

| Qué | Comando | Qué necesita |
|---|---|---|
| Controles de fase | `npm run phase:verify` | Nada. Ni siquiera dependencias instaladas |
| Estilo y fronteras de módulos | `npm run lint` | — |
| Tipos | `npm run typecheck` | — |
| Unitarias | `npm run test` | — |
| Integración | `npm run test:integration` | PostgreSQL y `DIRECT_URL` |
| Todas las de Vitest | `npx vitest run` | Lo mismo |
| Compilación | `npm run build` | — |
| Extremo a extremo y accesibilidad | `npm run test:e2e` | Navegador y base sembrada |
| Solo accesibilidad | `npm run test:a11y` | Lo mismo |

**Las pruebas de integración usan PostgreSQL de verdad, no un doble.** Buena
parte de lo que este sistema garantiza vive en el motor —índices únicos
parciales, bloqueos consultivos, privilegios de columna que hacen inmutable una
bitácora— y un doble en memoria las daría todas por buenas. Cada archivo aplica
las migraciones sobre una base efímera propia, así que **cada ejecución completa
demuestra además que una instalación desde cero funciona**.

Si el entorno trae un Chromium preinstalado con una revisión distinta de la que
pide Playwright, `E2E_CHROMIUM_PATH` apunta a él y evita descargar otro:

```bash
E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test
```

---

## 4. Cómo se construye

**Una fase se parte en bloques** —A, B, C…— y cada bloque es **un commit**. Un
bloque entrega algo que funciona de punta a punta: esquema y migración, o un caso
de uso con su pantalla, sus permisos y sus pruebas. No se parte por capas: un
commit con «el modelo» y otro con «la pantalla» deja el repositorio a medias
entre los dos.

El orden que ha funcionado, dentro de cada bloque:

1. **Esquema y migración** primero, si el bloque los toca. Verificar la migración
   sobre una base al día **y** sobre una instalación desde cero.
2. **Dominio y caso de uso**, con sus permisos, su motivo cuando el permiso lo
   exige y su sonda de asignación cuando la exige.
3. **Pantalla**, con su estado vacío escrito y su denegación escrita. Un estado
   vacío sin texto propio es una pantalla sin terminar.
4. **Pruebas**, y después **romperlas una por una** (§5).
5. **Puerta de calidad completa** y **integración continua en verde**.
6. **Actualizar `docs/PHASE_STATUS.md`**: el bloque pasa a `Completo`, y cualquier
   defecto encontrado entra en el registro con su corrección.

### Reglas de esquema

- Nunca `prisma format`.
- Nunca se reescribe una migración ya aplicada. Una corrección es una migración
  **nueva**, y tiene que funcionar sobre una base al día y sobre una desde cero.
- PostgreSQL no permite retirar un valor de un tipo enumerado: el tipo se
  renombra, se vuelve a crear sin el valor y se reasignan sus columnas. Antes de
  tocarlo, la migración comprueba que ninguna fila lo use y **se detiene con la
  fila concreta** si alguna lo usa.
- La inmutabilidad se sostiene con privilegios de columna
  (`REVOKE UPDATE … ; GRANT UPDATE (columnas) …`), no con una promesa en el
  código: una lista blanca de columnas no crece sola.

### Reglas de permisos

- Un permiso con `requiresReason` exige que quien lo ejecuta aporte el motivo;
  sin él la acción se niega y el botón «siempre responde que no tienes
  autorización». `C-F5-08` lo comprueba.
- Un permiso con `needsAssignment` exige la sonda que la comprueba. `C-F5-10`.
- **Un recurso sin territorio no se niega: se permite.** Es el fallo más fácil de
  cometer y el más difícil de ver, porque nada se rompe. `C-F6-01` lo comprueba
  en las decisiones sobre expedientes.

---

## 5. El método: probar viéndolo fallar

Una prueba que nunca se ha visto en rojo no demuestra que la regla funcione;
demuestra que la prueba no estorba. Por eso **cada garantía se prueba así**:

1. Se rompe a propósito el código que la sostiene.
2. Se comprueba que la prueba se pone en rojo, y que falla **por la razón
   correcta**.
3. Se restaura.

Cuando la prueba **no** se pone en rojo, casi nunca es que sobre: es que la
rotura estaba mal elegida, o que la regla no la ejercía nadie. Las dos cosas han
pasado en este proyecto y las dos eran defectos reales.

Lo mismo vale para los controles del verificador: se rompe el archivo que
comprueban y se mira fallar el control.

---

## 6. Cómo se cierra una fase

La puerta universal del PRD §23.2, entera:

```bash
npm run phase:verify   # 0 fallidos
npm run lint && npm run typecheck
npx vitest run
npm run build
npx playwright test
npm run db:check
```

Y la **integración continua en verde** sobre el commit que cierra. Verde en la
máquina no es verde: el flujo `.github/workflows/calidad.yml` corre `phase:verify`
→ `lint` → `typecheck` → unitarias → integración → `build` → extremo a extremo.

Empujar un commit nuevo **cancela** la ejecución en curso del anterior por el
grupo de concurrencia: una ejecución cancelada no cuenta como verde.

Después:

1. `docs/PHASE_STATUS.md` con los bloques completos, los criterios de aceptación
   del PRD §24 **comprobados ejecutando el sistema** —no leyendo el código—, las
   evidencias, los defectos con su corrección y los resultados.
2. Defectos abiertos de severidad bloqueante: **ninguno**. El verificador lee esa
   tabla y se niega a dar la fase por aprobada si queda alguno.
3. Se emite el informe de cierre y **se para**. La fase siguiente no se empieza
   sin autorización expresa de la persona usuaria (PRD §23.3).

### Cuando aparece algo después del cierre

Se reabre. Ha pasado dos veces y las dos se registró como lo que fue: la fase se
había declarado cerrada y no lo estaba. Declararla aprobada sobre un texto que ya
cambió es sostener una firma sobre otra cosa.

---

## 7. Documentación: una sola fuente por hecho

Tres de los defectos de este proyecto fueron el mismo: **una regla escrita en un
sitio y comprobada en otro**. Una puerta de descarga con su propia idea de qué
compartimento era un archivo; un arranque que creía una fase distinta de la
declarada; un README que anunciaba un contrato de fases distinto del contratado.

Ninguno fue un error de juicio. Los tres fueron dos fuentes para el mismo hecho.

Cuando encuentre un dato repetido, la corrección no es sincronizar las copias: es
**dejar una fuente y hacer que las demás la lean o se comparen con ella**, con un
control que falle cuando se separen. Así están escritos `C-COH-15`, `C-COH-16` y
`C-COH-17`.

El **archivo histórico** de `docs/PHASE_STATUS.md` es la excepción y no se
reescribe: es el registro de lo que se dijo y se firmó cuando el contrato era
otro. Reescribirlo convertiría un historial en una versión conveniente del
pasado. Los controles lo excluyen a propósito.

---

## 8. Git

Un bloque, un commit. El mensaje explica **por qué**, no qué archivos cambiaron:
eso ya está en el diff. Si un defecto apareció durante el bloque, el mensaje lo
dice y dice cómo se corrigió.

Nunca se reescribe la historia de una rama que ya se empujó.
