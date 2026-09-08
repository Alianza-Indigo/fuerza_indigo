import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar } from './helpers/fixtures';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { panelDeGestion } from '@/modules/dashboards';
import { PUBLIC_INTAKE_NOTICE_CODE, submitRequest } from '@/modules/support';

/**
 * El tablero de gestión: decisiones accionables, no métricas (PRD §24 Fase 9
 * criterio 6).
 *
 * Se prueba contra la base real, con el método de romper: una cola con trabajo
 * sale con su cuenta y su enlace; una cola vacía no sale; y a quien no alcanza
 * una cola, esa cola ni se le cuenta.
 */

let base: TestDatabase;
let entidadId: string;
let secretaria: ActorContext;
let cualquiera: ActorContext;

beforeAll(async () => {
  base = await createTestDatabase('tablero_gestion');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  // El aviso del buzón público tiene que estar publicado para poder enviar.
  await base.prisma.consentVersion.updateMany({
    where: { code: PUBLIC_INTAKE_NOTICE_CODE },
    data: { status: 'PUBLISHED' },
  });

  const granter = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  const sec = await crearPersonaConCuenta(base.prisma, { givenName: 'Secretaria', familyName: 'Ejecutiva' });
  await nombrar(base.prisma, { userId: sec.userId, roleCode: 'EXECUTIVE_SECRETARY', grantedById: granter.userId, legalEntityId: entidadId });
  secretaria = await contextoDe(base.prisma, sec);

  const nadie = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin', familyName: 'Cargo' });
  cualquiera = await contextoDe(base.prisma, nadie);
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

async function enviarMensaje(n: number): Promise<void> {
  const enviado = await submitRequest(
    {
      requestType: 'INDIVIDUAL_LABOR_DISPUTE',
      contactName: 'Quien Escribe',
      contactEmail: `quien.escribe.${n}@ejemplo.mx`,
      preferredChannel: 'EMAIL',
      subject: 'Necesito orientación',
      narrative: 'Me despidieron tras pedir un ajuste razonable en el trabajo.',
      acceptedPrivacyNotice: true,
    },
    { correlationId: `tablero-${n}`, ipHash: `huella-tablero-${n}` },
  );
  if (!enviado.ok) throw new Error(enviado.error.message);
}

function tarea(panel: Awaited<ReturnType<typeof panelDeGestion>>, id: string) {
  if (!panel.ok) return undefined;
  return panel.data.tareas.find((t) => t.id === id);
}

describe('tablero de gestión', () => {
  it('una cola vacía no aparece', async () => {
    const panel = await panelDeGestion(secretaria);
    expect(panel.ok).toBe(true);
    // Sin mensajes enviados todavía, la cola de mensajes no está en el tablero.
    expect(tarea(panel, 'mensajes-sin-atender')).toBeUndefined();
  });

  it('una cola con trabajo sale con su cuenta y su enlace', async () => {
    await enviarMensaje(1);
    await enviarMensaje(2);

    const panel = await panelDeGestion(secretaria);
    const t = tarea(panel, 'mensajes-sin-atender');
    expect(t).toBeDefined();
    expect(t!.cantidad).toBeGreaterThanOrEqual(2);
    expect(t!.accion.href).toBe('/gestion/mensajes');
  });

  it('LA GARANTÍA: toda tarea del tablero tiene cuenta positiva y un enlace a donde se atiende', async () => {
    await enviarMensaje(3);
    const panel = await panelDeGestion(secretaria);
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.data.tareas.length).toBeGreaterThan(0);
    for (const t of panel.data.tareas) {
      expect(t.cantidad).toBeGreaterThan(0);
      expect(t.accion.href.length).toBeGreaterThan(0);
      expect(t.accion.etiqueta.length).toBeGreaterThan(0);
    }
  });

  it('a quien no alcanza una cola, esa cola ni se le cuenta', async () => {
    await enviarMensaje(4);
    const panel = await panelDeGestion(cualquiera);
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    // Quien no tiene ninguna facultad de gestión no ve ninguna cola, aunque
    // haya trabajo pendiente en la organización.
    expect(panel.data.tareas).toHaveLength(0);
  });
});
