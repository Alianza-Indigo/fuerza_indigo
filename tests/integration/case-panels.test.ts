import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import { confirmRouting, PUBLIC_INTAKE_NOTICE_CODE, submitRequest } from '@/modules/support';
import { casePanel, openCase, panelsForActor, unassignCase, assignCase } from '@/modules/cases';
import { materiasSinPanel, PANELES } from '@/modules/cases/domain';
import type { SupportRequestType } from '@prisma-client/enums';

/**
 * Los tres paneles de coordinación (PRD §24 Fase 6; F6-CAS-013).
 *
 * Cinco promesas que se comprueban ejecutando:
 *
 *  · Los paneles **se declaran una vez** y sus materias no se solapan: un
 *    expediente en dos paneles se atendería dos veces o ninguna.
 *  · Ninguna materia de una entidad se queda **sin panel**: quedaría fuera de
 *    toda bandeja de coordinación sin que nadie lo supiera.
 *  · El panel enseña **lo que no lleva nadie**, que es lo que no aparece en
 *    ninguna otra pantalla.
 *  · Lo abre **quien reparte**, no quien atiende.
 *  · Sigue acotado por entidad, compartimento y **territorio**.
 */

let base: TestDatabase;
let fuerzaId: string;
let alianzaId: string;
let coordina: PersonaDePrueba;
let coordinaSocial: PersonaDePrueba;
let soloAtiende: PersonaDePrueba;
let coordinaJalisco: PersonaDePrueba;
let jalisco: { id: string };
let nayarit: { id: string };

const CONTEXTO = { correlationId: 'prueba-paneles', ipHash: 'huella-de-paneles' };

const RELATO =
  'Me despidieron el lunes después de pedir por escrito un ajuste razonable por mi condición. Llevo cuatro años en la empresa y nunca tuve una amonestación.';

beforeAll(async () => {
  base = await createTestDatabase('paneles');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);
  alianzaId = (
    await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })
  ).id;

  const unidades = await base.prisma.territorialUnit.findMany({
    where: { depth: 1 },
    orderBy: { path: 'asc' },
    select: { id: true },
  });
  jalisco = unidades[0]!;
  nayarit = unidades[1]!;

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });

  coordina = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Coordina' });
  await nombrar(base.prisma, {
    userId: coordina.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });

  coordinaSocial = await crearPersonaConCuenta(base.prisma, { givenName: 'Coordina', familyName: 'Lo Social' });
  await nombrar(base.prisma, {
    userId: coordinaSocial.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: alianzaId,
  });

  // Lleva expedientes y no reparte: `cases.case.assign` no está en su rol.
  soloAtiende = await crearPersonaConCuenta(base.prisma, { givenName: 'Solo', familyName: 'Atiende' });
  await nombrar(base.prisma, {
    userId: soloAtiende.userId,
    roleCode: 'TERRITORIAL_DELEGATE',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });

  coordinaJalisco = await crearPersonaConCuenta(base.prisma, { givenName: 'Coordina', familyName: 'Jalisco' });
  await nombrar(base.prisma, {
    userId: coordinaJalisco.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
    territorialUnitIds: [jalisco.id],
    includesDescendants: true,
  });

  await base.prisma.consentVersion.updateMany({
    where: { code: PUBLIC_INTAKE_NOTICE_CODE },
    data: { status: 'PUBLISHED' },
  });
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

beforeEach(async () => {
  for (const tabla of ['case_event', 'case_assignment', 'case_participant', 'case_file', 'support_request']) {
    await base.sql.query(`DELETE FROM "${tabla}"`);
  }
});

/** Abre un expediente de la materia y el territorio indicados. */
async function abrir(
  materia: SupportRequestType,
  opciones: { territorio?: string | null; entidad?: 'FUERZA_INDIGO' | 'ALIANZA_INDIGO' } = {},
): Promise<{ caseId: string; folio: string }> {
  const entidad = opciones.entidad ?? 'FUERZA_INDIGO';
  const quien = entidad === 'FUERZA_INDIGO' ? coordina : coordinaSocial;

  const enviado = await submitRequest(
    {
      requestType: materia,
      contactName: 'Quien Escribe',
      contactEmail: 'quien.escribe@ejemplo.mx',
      preferredChannel: 'EMAIL',
      subject: 'Necesito ayuda con lo que me está pasando',
      narrative: RELATO,
      acceptedPrivacyNotice: true,
    },
    CONTEXTO,
  );
  if (!enviado.ok) throw new Error(enviado.error.message);
  const solicitud = await base.prisma.supportRequest.findFirstOrThrow({
    where: { folio: enviado.data.folio },
    select: { id: true },
  });

  const canalizada = await confirmRouting(await contextoDe(base.prisma, quien), {
    requestId: solicitud.id,
    legalEntity: entidad,
    urgency: 'ROUTINE',
    territorialUnitId: opciones.territorio ?? null,
    note: 'Entra por la vía ordinaria del área que le corresponde.',
  });
  if (!canalizada.ok) throw new Error(canalizada.error.message);

  const abierto = await openCase(await contextoDe(base.prisma, quien), {
    supportRequestId: solicitud.id,
    legalEntityId: entidad === 'FUERZA_INDIGO' ? fuerzaId : alianzaId,
    domain: entidad === 'FUERZA_INDIGO' ? 'UNION_DEFENSE' : 'SOCIAL_ATTENTION',
    caseType: materia,
    priority: 'NORMAL',
    reason: 'Se abre el expediente para dar seguimiento a lo que la persona contó.',
  });
  if (!abierto.ok) throw new Error(abierto.error.message);
  return abierto.data;
}

describe('los paneles se declaran una vez, y no se solapan ni dejan huecos', () => {
  it('ninguna materia aparece en dos paneles de la misma entidad y dominio', () => {
    const vistas = new Map<string, string[]>();
    for (const panel of PANELES) {
      for (const materia of panel.materias) {
        const clave = `${panel.entidad}|${panel.dominio}|${materia}`;
        vistas.set(clave, [...(vistas.get(clave) ?? []), panel.codigo]);
      }
    }
    const repetidas = [...vistas.entries()].filter(([, paneles]) => paneles.length > 1);
    // Un expediente en dos paneles se atendería dos veces o ninguna, y cada
    // secretaría creería que lo lleva la otra.
    expect(repetidas).toEqual([]);
  });

  it('ninguna materia del sindicato se queda fuera de todo panel', () => {
    const huerfanas = materiasSinPanel('UNION_DEFENSE', 'FUERZA_INDIGO');
    // Las materias que la entrada pública manda al lado social no tienen por
    // qué estar en un panel sindical; las que sí lleva el sindicato, sí.
    expect(huerfanas).not.toContain('INDIVIDUAL_LABOR_DISPUTE');
    expect(huerfanas).not.toContain('DISCRIMINATION_OR_ADJUSTMENTS');
    expect(huerfanas).not.toContain('ACCESSIBILITY');
  });

  it('cada materia va al panel que le toca y no al otro', async () => {
    const laboral = await abrir('INDIVIDUAL_LABOR_DISPUTE');
    const accesibilidad = await abrir('ACCESSIBILITY');

    const trabajo = await casePanel(await contextoDe(base.prisma, coordina), 'trabajo-y-conflictos');
    expect(trabajo.ok, trabajo.ok ? '' : trabajo.error.message).toBe(true);
    if (!trabajo.ok) return;

    const neuro = await casePanel(await contextoDe(base.prisma, coordina), 'neuroinclusion-y-enlace-familiar');
    expect(neuro.ok).toBe(true);
    if (!neuro.ok) return;

    expect(trabajo.data.expedientes.map((fila) => fila.folio)).toEqual([laboral.folio]);
    expect(neuro.data.expedientes.map((fila) => fila.folio)).toEqual([accesibilidad.folio]);
  });

  it('un panel que no existe no se inventa', async () => {
    const intento = await casePanel(await contextoDe(base.prisma, coordina), 'panel-que-no-existe');
    expect(intento.ok).toBe(false);
  });
});

describe('el panel enseña lo que no lleva nadie', () => {
  it('un expediente sin responsable aparece, y con su falta señalada', async () => {
    const { caseId, folio } = await abrir('INDIVIDUAL_LABOR_DISPUTE');

    // Se releva a quien lo abrió, dejándolo sin nadie: es lo que ninguna otra
    // pantalla enseña, porque «mis expedientes» solo trae los asignados.
    const asignacion = await base.prisma.caseAssignment.findFirstOrThrow({
      where: { caseId, unassignedAt: null },
      select: { id: true },
    });
    await base.prisma.caseAssignment.update({
      where: { id: asignacion.id },
      data: { unassignedAt: new Date(), unassignReason: 'Deja de llevarlo por reorganización del área.' },
    });

    const panel = await casePanel(await contextoDe(base.prisma, coordina), 'trabajo-y-conflictos');
    expect(panel.ok, panel.ok ? '' : panel.error.message).toBe(true);
    if (!panel.ok) return;

    const fila = panel.data.expedientes.find((entrada) => entrada.folio === folio);
    expect(fila?.responsable).toBeNull();
    expect(panel.data.totales.sinResponsable).toBe(1);
  });

  it('los totales cuentan lo que duele, no solo lo que hay', async () => {
    const { caseId } = await abrir('INDIVIDUAL_LABOR_DISPUTE');

    // Se envejece la apertura sin valorar: pasa su plazo de primera respuesta.
    await base.sql.query(`UPDATE "case_file" SET "openedAt" = now() - interval '10 days' WHERE id = $1`, [caseId]);

    const panel = await casePanel(await contextoDe(base.prisma, coordina), 'trabajo-y-conflictos');
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;

    expect(panel.data.totales.abiertos).toBe(1);
    expect(panel.data.totales.sinValorar).toBe(1);
    expect(panel.data.expedientes[0]?.sinValorar).toBe(true);
  });

  it('un expediente recién abierto no cuenta como desatendido', async () => {
    await abrir('INDIVIDUAL_LABOR_DISPUTE');

    const panel = await casePanel(await contextoDe(base.prisma, coordina), 'trabajo-y-conflictos');
    expect(panel.ok).toBe(true);
    // Sin valorar es «pasó su plazo», no «nunca se valoró»: uno de hace diez
    // minutos no está desatendido, está recién llegado.
    if (panel.ok) expect(panel.data.totales.sinValorar).toBe(0);
  });

  it('un expediente cerrado deja de ocupar sitio en el panel', async () => {
    const { caseId } = await abrir('INDIVIDUAL_LABOR_DISPUTE');

    await base.prisma.case.update({
      where: { id: caseId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closeOutcome: 'RESOLVED',
        closeReason: 'Se resolvió con la empresa antes de llegar a la demanda.',
      },
    });

    const panel = await casePanel(await contextoDe(base.prisma, coordina), 'trabajo-y-conflictos');
    expect(panel.ok).toBe(true);
    if (panel.ok) expect(panel.data.totales.abiertos).toBe(0);
  });
});

describe('lo abre quien reparte, y sigue acotado', () => {
  it('quien atiende expedientes pero no reparte no abre ningún panel', async () => {
    const suyos = await panelsForActor(await contextoDe(base.prisma, soloAtiende));
    expect(suyos.ok, suyos.ok ? '' : suyos.error.message).toBe(true);
    if (suyos.ok) expect(suyos.data).toHaveLength(0);

    const intento = await casePanel(await contextoDe(base.prisma, soloAtiende), 'trabajo-y-conflictos');
    expect(intento.ok).toBe(false);
  });

  it('quien coordina la asociación civil ve su panel y no los del sindicato', async () => {
    const suyos = await panelsForActor(await contextoDe(base.prisma, coordinaSocial));
    expect(suyos.ok).toBe(true);
    if (!suyos.ok) return;

    expect(suyos.data.map((panel) => panel.codigo)).toEqual(['atencion-social']);

    const ajeno = await casePanel(await contextoDe(base.prisma, coordinaSocial), 'trabajo-y-conflictos');
    expect(ajeno.ok).toBe(false);
  });

  it('quien coordina sin acotación ve los dos paneles de su entidad', async () => {
    const suyos = await panelsForActor(await contextoDe(base.prisma, coordina));
    expect(suyos.ok).toBe(true);
    if (!suyos.ok) return;
    expect(suyos.data.map((panel) => panel.codigo).sort()).toEqual([
      'neuroinclusion-y-enlace-familiar',
      'trabajo-y-conflictos',
    ]);
  });

  it('coordinar un territorio no es coordinarlos todos', async () => {
    const enJalisco = await abrir('INDIVIDUAL_LABOR_DISPUTE', { territorio: jalisco.id });
    const enNayarit = await abrir('INDIVIDUAL_LABOR_DISPUTE', { territorio: nayarit.id });

    const acotado = await casePanel(await contextoDe(base.prisma, coordinaJalisco), 'trabajo-y-conflictos');
    expect(acotado.ok, acotado.ok ? '' : acotado.error.message).toBe(true);
    if (!acotado.ok) return;

    const folios = acotado.data.expedientes.map((fila) => fila.folio);
    expect(folios).toContain(enJalisco.folio);
    expect(folios).not.toContain(enNayarit.folio);

    // Y quien no está acotada ve los dos.
    const completo = await casePanel(await contextoDe(base.prisma, coordina), 'trabajo-y-conflictos');
    expect(completo.ok).toBe(true);
    if (completo.ok) expect(completo.data.expedientes).toHaveLength(2);
  });

  it('desde el panel se reparte: lo que aparece sin responsable se puede asignar', async () => {
    const { caseId, folio } = await abrir('INDIVIDUAL_LABOR_DISPUTE');
    const titular = await base.prisma.caseAssignment.findFirstOrThrow({
      where: { caseId, unassignedAt: null },
      select: { id: true },
    });

    const asignada = await assignCase(await contextoDe(base.prisma, coordina), {
      caseId,
      userId: soloAtiende.userId,
      assignmentRole: 'OWNER',
      reason: 'Le corresponde por territorio y tiene capacidad esta semana.',
    });
    expect(asignada.ok, asignada.ok ? '' : asignada.error.message).toBe(true);
    void titular;

    const panel = await casePanel(await contextoDe(base.prisma, coordina), 'trabajo-y-conflictos');
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;

    const fila = panel.data.expedientes.find((entrada) => entrada.folio === folio);
    expect(fila?.responsable).toContain('Atiende');
    expect(panel.data.totales.sinResponsable).toBe(0);
    void unassignCase;
  });
});
