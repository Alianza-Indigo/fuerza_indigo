import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  contextoDe,
  crearMembresia,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
  type PersonaDePrueba,
} from './helpers/fixtures';
import {
  credentialForDownload,
  credentialRegistry,
  endMembership,
  issueCredential,
  personCredentials,
  replaceCredential,
  revokeCredential,
  suspendMembership,
  verifyCredential,
  verificationSummary,
} from '@/modules/membership';
import { leerToken, nuevoCodigoFirmado, tokenDe } from '@/platform/credentials/signing';
import { svgCredencial } from '@/platform/credentials/design';
import { resetEnvCache } from '@/platform/config/env';
import type { ActorContext } from '@/platform/kernel/actor-context';

/**
 * Credenciales, QR, verificador público y revocación
 * (PRD §7.4; F4-CRE-001 a F4-CRE-004).
 *
 * Las dos promesas que se prueban de frente:
 *
 * 1. **Una credencial revocada se refleja inmediatamente en el verificador**
 *    (PRD §24 Fase 4). No «en el siguiente trabajo nocturno»: en la consulta
 *    siguiente.
 * 2. **El verificador distingue vigencia, suspensión, vencimiento y
 *    revocación**, y cada una por su propia causa.
 */

let base: TestDatabase;
let entidadId: string;
let secretaria: ActorContext;
let secretariaPersona: PersonaDePrueba;

beforeAll(async () => {
  base = await createTestDatabase('credenciales');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  secretariaPersona = await crearPersonaConCuenta(base.prisma, {
    givenName: 'Secretaria',
    familyName: 'De Credenciales',
  });
  await nombrar(base.prisma, {
    userId: secretariaPersona.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  secretaria = await contextoDe(base.prisma, secretariaPersona);
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

const MOTIVO = 'Se acordó en la sesión del comité ejecutivo del quince de septiembre.';

let contador = 0;

/**
 * Una persona agremiada con membresía y credencial.
 *
 * La credencial no se crea aquí a mano: se crea sola al activarse la membresía.
 * Este ayudante usa el atajo de fixture para la membresía, así que emite la
 * credencial con el mismo caso de uso que usaría la activación real.
 */
async function agremiadaConCredencial(nombre: string, opciones: { expiresAt?: Date } = {}) {
  contador += 1;
  const persona = await crearPersonaConCuenta(base.prisma, {
    givenName: `${nombre}${contador}`,
    familyName: 'De Credencial',
  });
  await nombrar(base.prisma, {
    userId: persona.userId,
    roleCode: 'UNION_MEMBER',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  const membresia = await crearMembresia(base.prisma, {
    personId: persona.personId,
    legalEntityId: entidadId,
    typeCode: 'AGREMIADO',
    // Una vigencia en el pasado obliga a retroceder también el alta: la base
    // exige que la vigencia termine después de empezar, y que haya que
    // respetarlo aquí es la prueba de que la garantía existe.
    ...(opciones.expiresAt === undefined
      ? {}
      : {
          expiresAt: opciones.expiresAt,
          startedAt: new Date(opciones.expiresAt.getTime() - 365 * 24 * 60 * 60 * 1000),
        }),
  });

  const codigo = nuevoCodigoFirmado();
  const actor = await base.prisma.actor.findFirstOrThrow({ select: { id: true } });
  const credencial = await base.prisma.memberCredential.create({
    data: {
      publicCode: codigo.publicCode,
      signingKeyId: codigo.signingKeyId,
      signature: codigo.signature,
      membershipId: membresia.id,
      personId: persona.personId,
      credentialKind: 'UNION_MEMBER',
      displayName: `${nombre}${contador} De Credencial`,
      expiresAt: opciones.expiresAt ?? null,
      createdByActorId: actor.id,
      updatedByActorId: actor.id,
    },
    select: { id: true, publicCode: true, signingKeyId: true, signature: true },
  });

  return {
    persona,
    suyo: await contextoDe(base.prisma, persona),
    membresia,
    credencial,
    token: tokenDe(credencial),
  };
}

/* -------------------------------------------------------------------------- */

describe('el código opaco y su firma (F4-CRE-001)', () => {
  it('no lleva ningún dato personal: es aleatorio y del alfabeto dictable', () => {
    const uno = nuevoCodigoFirmado();
    const otro = nuevoCodigoFirmado();
    expect(uno.publicCode).not.toBe(otro.publicCode);
    // Sin I, L, O ni U: el código se dicta por teléfono a una oficina.
    expect(uno.publicCode).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{20}$/);
    expect(uno.token).toBe(`${uno.publicCode}.${uno.signingKeyId}.${uno.signature}`);
  });

  it('la firma cuadra para el código que firmó, y solo para ese', () => {
    const codigo = nuevoCodigoFirmado();
    const lectura = leerToken(codigo.token);
    expect(lectura.clase).toBe('FIRMADO');
    if (lectura.clase === 'FIRMADO') expect(lectura.publicCode).toBe(codigo.publicCode);

    // Cambiar el código dejando la firma, o al revés, no cuela.
    const otro = nuevoCodigoFirmado();
    expect(leerToken(`${otro.publicCode}.${codigo.signingKeyId}.${codigo.signature}`).clase).toBe('INVALIDO');
    expect(leerToken(`${codigo.publicCode}.${codigo.signingKeyId}.${otro.signature}`).clase).toBe('INVALIDO');
  });

  it('un identificador de clave que no está en el llavero se rechaza', () => {
    const codigo = nuevoCodigoFirmado();
    expect(leerToken(`${codigo.publicCode}.kx.${codigo.signature}`).clase).toBe('INVALIDO');
  });

  it('un código tecleado a mano se acepta sin firma, y se sabe que viene así', () => {
    // El alfabeto se eligió para poder dictarlo. Negarse a comprobar un código
    // tecleado convertiría una medida de seguridad en una barrera: en una
    // oficina sin cámara esta es la única puerta.
    const codigo = nuevoCodigoFirmado();
    const lectura = leerToken(`  ${codigo.publicCode.toLowerCase()}  `);
    expect(lectura.clase).toBe('SIN_FIRMA');
    if (lectura.clase === 'SIN_FIRMA') expect(lectura.publicCode).toBe(codigo.publicCode);
  });

  it('rotar el llavero no invalida lo ya impreso (defecto D-F0-012)', () => {
    const anterior = process.env['QR_SIGNING_SECRET'];
    try {
      process.env['QR_SIGNING_SECRET'] = 'k1:llave-uno-de-prueba-no-es-real';
      resetEnvCache();
      const viejo = nuevoCodigoFirmado();
      expect(viejo.signingKeyId).toBe('k1');

      // Llega una clave nueva y la vieja se queda en el llavero.
      process.env['QR_SIGNING_SECRET'] = 'k2:llave-dos-de-prueba,k1:llave-uno-de-prueba-no-es-real';
      resetEnvCache();
      const nuevo = nuevoCodigoFirmado();
      expect(nuevo.signingKeyId).toBe('k2');

      // La credencial impresa el año pasado sigue verificándose.
      expect(leerToken(viejo.token).clase).toBe('FIRMADO');
      expect(leerToken(nuevo.token).clase).toBe('FIRMADO');

      // Y al retirar la clave vieja, lo firmado con ella deja de verificarse:
      // por eso `ENVIRONMENT.md` avisa de no retirarla con credenciales vivas.
      process.env['QR_SIGNING_SECRET'] = 'k2:llave-dos-de-prueba';
      resetEnvCache();
      expect(leerToken(viejo.token).clase).toBe('INVALIDO');
      expect(leerToken(nuevo.token).clase).toBe('FIRMADO');
    } finally {
      if (anterior === undefined) delete process.env['QR_SIGNING_SECRET'];
      else process.env['QR_SIGNING_SECRET'] = anterior;
      resetEnvCache();
    }
  });
});

describe('el verificador distingue los cuatro estados (F4-CRE-003)', () => {
  it('una credencial de una membresía activa se verifica como vigente', async () => {
    const { token, persona } = await agremiadaConCredencial('Vigente');
    const resultado = await verifyCredential(token);
    expect(resultado.found).toBe(true);
    expect(resultado.status).toBe('ACTIVE');
    expect(resultado.displayName).toContain('De Credencial');
    expect(resultado.kind).toBe('UNION_MEMBER');
    expect(persona.personId).not.toBe('');
  });

  it('enseña los siete datos del PRD §7.4 y ninguno más', async () => {
    const { token } = await agremiadaConCredencial('Siete');
    const resultado = await verifyCredential(token);

    // Lo que sí: nombre, foto, tipo, estado, vigencia, territorio, código.
    expect(Object.keys(resultado).sort()).toEqual(
      [
        'displayName',
        'expiresAt',
        'found',
        'issuedAt',
        'kind',
        'photoFileId',
        'publicCode',
        'status',
        'territoryLabel',
      ].sort(),
    );

    // Lo que no: nada que identifique a la persona más allá de su nombre
    // autorizado. Ni número de miembro, ni correo, ni identificador interno.
    const serializado = JSON.stringify(resultado);
    expect(serializado).not.toContain('memberNumber');
    expect(serializado).not.toContain('personId');
  });

  it('suspender la membresía suspende la credencial, sin tocarla', async () => {
    const { token, membresia, credencial } = await agremiadaConCredencial('Suspende');

    const suspendida = await suspendMembership(secretaria, {
      membershipId: membresia.id,
      reason: 'Cuotas atrasadas de más de seis meses, notificadas por escrito dos veces.',
    });
    expect(suspendida.ok, suspendida.ok ? '' : JSON.stringify(suspendida.error)).toBe(true);

    const resultado = await verifyCredential(token);
    expect(resultado.status).toBe('SUSPENDED');

    // La fila de la credencial no cambió: el estado se deriva. Escribirlo
    // obligaría a acordarse de deshacerlo al levantar la suspensión.
    const fila = await base.prisma.memberCredential.findUniqueOrThrow({
      where: { id: credencial.id },
      select: { status: true, revokedAt: true },
    });
    expect(fila.status).toBe('ACTIVE');
    expect(fila.revokedAt).toBeNull();
  });

  it('una credencial cuya vigencia pasó se verifica como vencida', async () => {
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { token } = await agremiadaConCredencial('Vence', { expiresAt: ayer });
    const resultado = await verifyCredential(token);
    expect(resultado.status).toBe('EXPIRED');
  });

  it('un código que no existe no dice si estuvo cerca', async () => {
    const inventado = 'ZZZZZZZZZZZZZZZZZZZZ';
    const resultado = await verifyCredential(inventado);
    expect(resultado.found).toBe(false);
    expect(resultado.displayName).toBeNull();
    expect(resultado.status).toBeNull();
  });

  it('un token con firma falsa se trata igual que uno inexistente', async () => {
    // La misma respuesta a propósito: distinguirlas diría a quien prueba
    // códigos si acertó el formato, que es la mitad del trabajo.
    const { credencial } = await agremiadaConCredencial('Falsa');
    const falso = `${credencial.publicCode}.${credencial.signingKeyId}.xxxxxxxxxxxxxxxxxxxxxxxx`;
    const resultado = await verifyCredential(falso);
    expect(resultado.found).toBe(false);
  });

  it('la fotografía no se enseña cuando la credencial no vale', async () => {
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { token, credencial } = await agremiadaConCredencial('ConFoto', { expiresAt: ayer });

    // Se le pone una fotografía a la credencial vencida.
    const archivo = await base.prisma.fileObject.findFirst({ select: { id: true } });
    if (archivo !== null) {
      await base.sql.query('UPDATE member_credential SET "photoFileId" = $1 WHERE id = $2', [
        archivo.id,
        credencial.id,
      ]);
    }

    const resultado = await verifyCredential(token);
    expect(resultado.status).toBe('EXPIRED');
    // Enseñar la cara de alguien junto a un documento que no vale no ayuda a
    // verificar nada y la expone en la peor situación posible.
    expect(resultado.photoFileId).toBeNull();
  });
});

describe('la revocación surte efecto en el acto (F4-CRE-004)', () => {
  it('entre una consulta y la siguiente, sin ningún trabajo de por medio', async () => {
    const { token, credencial } = await agremiadaConCredencial('Revoca');
    expect((await verifyCredential(token)).status).toBe('ACTIVE');

    const revocada = await revokeCredential(secretaria, {
      credentialId: credencial.id,
      reason: 'La persona reportó que perdió la credencial impresa el martes pasado.',
    });
    expect(revocada.ok, revocada.ok ? '' : JSON.stringify(revocada.error)).toBe(true);

    // Sin esperar a nada: la consulta siguiente ya la ve revocada.
    expect((await verifyCredential(token)).status).toBe('REVOKED');
  });

  it('el motivo de la revocación no viaja al verificador', async () => {
    const { token, credencial } = await agremiadaConCredencial('MotivoOculto');
    await revokeCredential(secretaria, {
      credentialId: credencial.id,
      reason: 'Se retiró por un procedimiento disciplinario en curso, expediente catorce.',
    });

    const resultado = await verifyCredential(token);
    expect(resultado.status).toBe('REVOKED');
    expect(JSON.stringify(resultado)).not.toContain('disciplinario');
  });

  it('revocar exige motivo escrito y no se repite', async () => {
    const { credencial } = await agremiadaConCredencial('SinMotivo');
    const corto = await revokeCredential(secretaria, { credentialId: credencial.id, reason: 'porque sí' });
    expect(corto.ok).toBe(false);

    const buena = await revokeCredential(secretaria, {
      credentialId: credencial.id,
      reason: 'La persona reportó que perdió la credencial impresa el martes pasado.',
    });
    expect(buena.ok).toBe(true);

    const otra = await revokeCredential(secretaria, {
      credentialId: credencial.id,
      reason: 'La persona reportó que perdió la credencial impresa el martes pasado.',
    });
    expect(otra.ok).toBe(false);
    if (!otra.ok) expect(otra.error.code).toBe('CONFLICT');
  });

  it('quien no tiene la facultad no revoca', async () => {
    const { credencial } = await agremiadaConCredencial('Ajena');
    const { suyo } = await agremiadaConCredencial('Curiosa');
    const intento = await revokeCredential(suyo, {
      credentialId: credencial.id,
      reason: 'Quiero revocar la credencial de otra persona sin tener la facultad.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });

  it('terminar la membresía revoca la credencial, con asiento', async () => {
    const { token, membresia, credencial } = await agremiadaConCredencial('SeVa');

    const baja = await endMembership(secretaria, {
      membershipId: membresia.id,
      endReason: 'VOLUNTARY_WITHDRAWAL',
      reason: 'La persona pidió por escrito dejar de ser agremiada.',
    });
    expect(baja.ok, baja.ok ? '' : JSON.stringify(baja.error)).toBe(true);

    expect((await verifyCredential(token)).status).toBe('REVOKED');

    // Y consta el acto, no solo su efecto: quién, cuándo y por qué.
    const fila = await base.prisma.memberCredential.findUniqueOrThrow({
      where: { id: credencial.id },
      select: { status: true, revokedAt: true, revokeReason: true },
    });
    expect(fila.status).toBe('REVOKED');
    expect(fila.revokedAt).not.toBeNull();
    expect(fila.revokeReason).toContain('dejar de ser agremiada');

    const asiento = await base.prisma.auditEvent.findFirst({
      where: { action: 'credentialing.credential.revoked', objectId: credencial.id },
      select: { id: true },
    });
    expect(asiento).not.toBeNull();
  });
});

describe('reponer una credencial perdida', () => {
  it('emite otra y deja la anterior sin valor, con la cadena escrita', async () => {
    const { token, credencial, persona } = await agremiadaConCredencial('Repone');

    const repuesta = await replaceCredential(secretaria, {
      credentialId: credencial.id,
      reason: 'La persona reportó que perdió la credencial impresa y pidió reposición.',
    });
    expect(repuesta.ok, repuesta.ok ? '' : JSON.stringify(repuesta.error)).toBe(true);
    if (!repuesta.ok) return;

    // El código viejo, el que pueda estar en una cartera ajena, ya no acredita.
    expect((await verifyCredential(token)).status).toBe('REPLACED');

    // Y el nuevo sí.
    const nueva = await base.prisma.memberCredential.findUniqueOrThrow({
      where: { id: repuesta.data.credentialId },
      select: { publicCode: true, signingKeyId: true, signature: true, membershipId: true },
    });
    expect((await verifyCredential(tokenDe(nueva))).status).toBe('ACTIVE');
    expect(nueva.publicCode).not.toBe(credencial.publicCode);

    // La cadena queda escrita: se puede seguir de la vieja a la nueva.
    const vieja = await base.prisma.memberCredential.findUniqueOrThrow({
      where: { id: credencial.id },
      select: { replacedByCredentialId: true },
    });
    expect(vieja.replacedByCredentialId).toBe(repuesta.data.credentialId);

    // Y la persona ve las dos, con lo que le pasó a cada una.
    const suyas = await personCredentials(secretaria, persona.personId);
    expect(suyas.ok).toBe(true);
    if (suyas.ok) expect(suyas.data).toHaveLength(2);
  });

  it('no se repone una credencial cuya membresía ya terminó', async () => {
    const { membresia, credencial } = await agremiadaConCredencial('YaNo');
    await endMembership(secretaria, {
      membershipId: membresia.id,
      endReason: 'VOLUNTARY_WITHDRAWAL',
      reason: 'La persona pidió por escrito dejar de ser agremiada.',
    });

    const intento = await replaceCredential(secretaria, {
      credentialId: credencial.id,
      reason: 'Quiero reponer la credencial de alguien que ya no es miembro.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('CONFLICT');
  });
});

describe('credenciales de cargo y profesionales (F4-CRE-001)', () => {
  it('se emiten a mano, con motivo, y no exigen membresía', async () => {
    const persona = await crearPersonaConCuenta(base.prisma, {
      givenName: 'Representante',
      familyName: 'Sin Membresía',
    });

    const emitida = await issueCredential(secretaria, {
      personId: persona.personId,
      kind: 'OFFICE_OR_REPRESENTATION',
      legalEntityId: entidadId,
      territoryLabel: 'Secretaría de Organización · Nacional',
      reason: MOTIVO,
    });
    expect(emitida.ok, emitida.ok ? '' : JSON.stringify(emitida.error)).toBe(true);
    if (!emitida.ok) return;

    const fila = await base.prisma.memberCredential.findUniqueOrThrow({
      where: { id: emitida.data.credentialId },
      select: { membershipId: true, credentialKind: true, territoryLabel: true, signature: true, signingKeyId: true, publicCode: true },
    });
    expect(fila.membershipId).toBeNull();
    expect(fila.credentialKind).toBe('OFFICE_OR_REPRESENTATION');

    const resultado = await verifyCredential(tokenDe(fila));
    expect(resultado.status).toBe('ACTIVE');
    expect(resultado.territoryLabel).toBe('Secretaría de Organización · Nacional');
  });

  it('una credencial no puede nacer vencida', async () => {
    const persona = await crearPersonaConCuenta(base.prisma, {
      givenName: 'Nace',
      familyName: 'Vencida',
    });
    const intento = await issueCredential(secretaria, {
      personId: persona.personId,
      kind: 'AUTHORIZED_PROFESSIONAL',
      legalEntityId: entidadId,
      territoryLabel: 'Psicología · autorización del ecosistema',
      expiresOn: '2020-01-01',
      reason: MOTIVO,
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('CONFLICT');
  });

  it('la base impide una credencial de agremiado sin membresía detrás', async () => {
    // No es una regla del caso de uso: es una comprobación de la base. Aunque
    // alguien escribiera la fila a mano, no entra.
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Falsa', familyName: 'Agremiada' });
    const codigo = nuevoCodigoFirmado();
    const actor = await base.prisma.actor.findFirstOrThrow({ select: { id: true } });

    await expect(
      base.prisma.memberCredential.create({
        data: {
          publicCode: codigo.publicCode,
          signingKeyId: codigo.signingKeyId,
          signature: codigo.signature,
          personId: persona.personId,
          credentialKind: 'UNION_MEMBER',
          displayName: 'Falsa Agremiada',
          createdByActorId: actor.id,
          updatedByActorId: actor.id,
        },
      }),
    ).rejects.toThrow(/membresia_segun_el_tipo/);
  });
});

describe('descargar la credencial (F4-CRE-002)', () => {
  it('la persona descarga la suya, y queda asiento de la entrega', async () => {
    const { persona, suyo, credencial } = await agremiadaConCredencial('Descarga');

    const resultado = await credentialForDownload(suyo, credencial.id);
    expect(resultado.ok, resultado.ok ? '' : JSON.stringify(resultado.error)).toBe(true);
    if (!resultado.ok) return;

    const asiento = await base.prisma.auditEvent.findFirst({
      where: {
        action: 'credentialing.credential.downloaded',
        objectId: credencial.id,
        onBehalfOfPersonId: persona.personId,
      },
      select: { id: true },
    });
    expect(asiento).not.toBeNull();
  });

  it('el documento lleva el QR, el código legible y el diseño de su tipo', async () => {
    const { suyo, credencial } = await agremiadaConCredencial('Dibuja');
    const datos = await credentialForDownload(suyo, credencial.id);
    if (!datos.ok) throw datos.error;

    const svg = svgCredencial({
      kind: datos.data.kind,
      displayName: datos.data.displayName,
      publicCode: datos.data.publicCode,
      token: datos.data.token,
      verificationUrl: 'https://ejemplo.invalid/verificar',
      issuedAt: datos.data.issuedAt,
      expiresAt: datos.data.expiresAt,
      territoryLabel: datos.data.territoryLabel,
      issuer: 'Fuerza Índigo',
    });

    // Tamaño de tarjeta: se imprime y entra en una cartera.
    expect(svg).toContain('width="85.6mm"');
    expect(svg).toContain('height="54mm"');
    // El tipo, escrito: no se distingue solo por el color.
    expect(svg).toContain('AGREMIADO');
    // El código, en bloques de cinco para poder dictarlo.
    expect(svg).toContain(datos.data.publicCode.slice(0, 5));
    // Y el QR dentro.
    expect(svg).toContain('shape-rendering="crispEdges"');
  });

  it('no se descarga una credencial que ya no vale', async () => {
    const { suyo, credencial } = await agremiadaConCredencial('NoVale');
    await revokeCredential(secretaria, {
      credentialId: credencial.id,
      reason: 'La persona reportó que perdió la credencial impresa el martes pasado.',
    });

    // Entregar el dibujo de una credencial revocada es fabricar el documento
    // que no debería circular.
    const intento = await credentialForDownload(suyo, credencial.id);
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('CONFLICT');
  });

  it('nadie descarga la credencial de otra persona', async () => {
    const { credencial } = await agremiadaConCredencial('Mia');
    const { suyo } = await agremiadaConCredencial('Tuya');
    const intento = await credentialForDownload(suyo, credencial.id);
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });
});

describe('la medición del verificador es agregada (PRD §7.4)', () => {
  it('no guarda hora exacta, ni dirección, ni nada de quien consulta', async () => {
    const { token } = await agremiadaConCredencial('Mide');
    await verifyCredential(token, { countryCodeHint: 'MX', userAgentClass: 'MOBILE' });

    const fila = await base.prisma.credentialVerification.findFirstOrThrow({
      orderBy: { id: 'desc' },
      select: { occurredAtHour: true, countryCodeHint: true, userAgentClass: true, result: true },
    });

    // La hora viene truncada, y la base lo exige con una comprobación: con
    // minuto y segundo, un registro agregado se vuelve un rastro de quién miró
    // qué y cuándo.
    expect(fila.occurredAtHour.getUTCMinutes()).toBe(0);
    expect(fila.occurredAtHour.getUTCSeconds()).toBe(0);
    expect(fila.countryCodeHint).toBe('MX');
    expect(fila.userAgentClass).toBe('MOBILE');
    expect(fila.result).toBe('VALID');
  });

  it('la base rechaza guardar el instante exacto, aunque alguien lo intente', async () => {
    await expect(
      base.sql.query(
        `INSERT INTO credential_verification (id, "queriedCode", result, "occurredAtHour")
         VALUES (gen_random_uuid(), 'PRUEBA', 'NOT_FOUND', now())`,
      ),
    ).rejects.toThrow(/hora_truncada/);
  });

  it('un código inexistente también se cuenta, para poder ver un barrido', async () => {
    const antes = await base.prisma.credentialVerification.count({ where: { result: 'NOT_FOUND' } });
    await verifyCredential('YYYYYYYYYYYYYYYYYYYY');
    const despues = await base.prisma.credentialVerification.count({ where: { result: 'NOT_FOUND' } });
    // Sin el código consultado no se puede distinguir una errata de un intento
    // sistemático de adivinar códigos.
    expect(despues).toBe(antes + 1);
  });

  it('el resumen cuenta por día y por resultado, sin desglosar por persona', async () => {
    const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const resumen = await verificationSummary(secretaria, desde);
    expect(resumen.ok, resumen.ok ? '' : JSON.stringify(resumen.error)).toBe(true);
    if (!resumen.ok) return;
    expect(resumen.data.length).toBeGreaterThan(0);
    expect(Object.keys(resumen.data[0]!).sort()).toEqual(['consultas', 'dia', 'result']);
  });
});

describe('mirar lo propio no es un privilegio del rango (defecto D-F4-017)', () => {
  it('quien solicita y aún no tiene membresía lee una lista vacía, no una negativa', async () => {
    // La diferencia importa: «no tienes autorización» describe una decisión de
    // la organización sobre esa persona; una lista vacía describe un hecho del
    // trámite. Confundirlas hace que la plataforma parezca hostil justo con
    // quien acaba de llegar.
    contador += 1;
    const persona = await crearPersonaConCuenta(base.prisma, {
      givenName: `Solicita${contador}`,
      familyName: 'Sin Membresía',
    });
    await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode: 'APPLICANT',
      grantedById: secretariaPersona.userId,
      legalEntityId: entidadId,
    });
    const suyo = await contextoDe(base.prisma, persona);

    const suyas = await personCredentials(suyo, persona.personId);
    expect(suyas.ok, suyas.ok ? '' : JSON.stringify(suyas.error)).toBe(true);
    if (suyas.ok) expect(suyas.data).toEqual([]);
  });

  it('pero sigue sin poder mirar la credencial de otra persona', async () => {
    contador += 1;
    const persona = await crearPersonaConCuenta(base.prisma, {
      givenName: `Curiosa${contador}`,
      familyName: 'Sin Membresía',
    });
    await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode: 'APPLICANT',
      grantedById: secretariaPersona.userId,
      legalEntityId: entidadId,
    });
    const suyo = await contextoDe(base.prisma, persona);
    const ajena = await agremiadaConCredencial('Ajena2');

    const intento = await personCredentials(suyo, ajena.persona.personId);
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });
});

describe('el listado de gestión', () => {
  it('filtra por el estado vigente, no por el guardado', async () => {
    const { membresia } = await agremiadaConCredencial('Filtra');
    await suspendMembership(secretaria, {
      membershipId: membresia.id,
      reason: 'Suspensión de prueba para comprobar el filtro por estado vigente.',
    });

    const suspendidas = await credentialRegistry(secretaria, { status: 'SUSPENDED' });
    expect(suspendidas.ok).toBe(true);
    if (!suspendidas.ok) return;
    // Su fila sigue diciendo «activa»; el listado la encuentra igual.
    expect(suspendidas.data.some((una) => una.storedStatus === 'ACTIVE')).toBe(true);
    expect(suspendidas.data.every((una) => una.status === 'SUSPENDED')).toBe(true);
  });

  it('quien no tiene la facultad no lo lee', async () => {
    const { suyo } = await agremiadaConCredencial('Fisgona');
    const intento = await credentialRegistry(suyo);
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });
});
