import { createHash } from 'node:crypto';
import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction, type Tx } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { newPublicId } from '@/platform/kernel/ids';
import { uploadFile } from '@/platform/files/file-service';
import type { DocumentSubject } from '@prisma-client/enums';
import { MARCA_DE_VARIABLE, variablesDeclaradas, variablesUsadas } from './templates';

/**
 * Emisión de documentos institucionales (PRD §16.2; F5-DOC).
 *
 * **El documento se guarda como archivo, no como una consulta.** Un acta que se
 * vuelve a componer cada vez que alguien la abre cambia cuando cambian los datos
 * de los que se compuso; lo que se conserva aquí es el archivo emitido, con su
 * huella, y `variablesSnapshot` guarda los valores exactos con los que se
 * compuso. El motor retira el privilegio de actualización sobre esa columna:
 * un documento cuyo contenido puede reescribirse después no prueba nada.
 *
 * **El formato es HTML autocontenido.** No trae imágenes externas, ni tipografías
 * remotas, ni guiones: se abre y se imprime en cualquier equipo, dentro de veinte
 * años, sin depender de que un servicio siga existiendo (ADR-0100).
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** Escapa el texto que entra al documento. Un valor no puede traer marcado. */
export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sustituye las variables del cuerpo por sus valores.
 *
 * Es una función pura y determinista: los mismos valores producen exactamente
 * el mismo texto, que es lo que permite comprobar años después que el archivo
 * guardado corresponde con la plantilla y con la instantánea de variables.
 */
export function renderizarCuerpo(bodyTemplate: string, valores: Readonly<Record<string, string>>): string {
  return bodyTemplate.replace(MARCA_DE_VARIABLE, (_coincidencia, nombre: string) =>
    escaparHtml(valores[nombre] ?? ''),
  );
}

/** Documento completo, listo para guardarse y para imprimirse. */
export function componerDocumento(input: {
  readonly titulo: string;
  readonly entidad: string;
  readonly serie: string;
  readonly folio: string;
  readonly emitidoEl: Date;
  readonly cuerpo: string;
}): string {
  const fecha = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeZone: 'America/Mexico_City',
  }).format(input.emitidoEl);

  return `<!DOCTYPE html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(input.titulo)} · ${escaparHtml(input.folio)}</title>
<style>
:root { color-scheme: light; }
body { margin: 0; padding: 2.5rem 2rem; font-family: Georgia, "Times New Roman", serif; font-size: 12pt; line-height: 1.6; color: #111; background: #fff; }
main { max-width: 44rem; margin: 0 auto; }
header { border-bottom: 2px solid #111; padding-bottom: 1rem; margin-bottom: 2rem; }
h1 { font-size: 16pt; margin: 0 0 .25rem; }
.meta { font-size: 10pt; color: #444; }
.cuerpo p { margin: 0 0 1rem; }
footer { margin-top: 3rem; border-top: 1px solid #999; padding-top: .75rem; font-size: 9pt; color: #444; }
@media print { body { padding: 0; } }
</style>
</head>
<body>
<main>
<header>
<h1>${escaparHtml(input.titulo)}</h1>
<p class="meta">${escaparHtml(input.entidad)}</p>
<p class="meta">Serie ${escaparHtml(input.serie)} · Folio ${escaparHtml(input.folio)} · Emitido el ${escaparHtml(fecha)}</p>
</header>
<div class="cuerpo">
${input.cuerpo}
</div>
<footer>
<p>Documento emitido por la plataforma institucional. Folio ${escaparHtml(input.folio)}.</p>
</footer>
</main>
</body>
</html>
`;
}

/**
 * Folio de la serie documental: prefijo de la entidad, serie, año y consecutivo.
 *
 * Bajo cerrojo de transacción, igual que el folio de una solicitud: sin él, dos
 * emisiones del mismo segundo pedirían el mismo número y una moriría contra el
 * índice único, justo después de haber guardado el archivo.
 */
async function siguienteFolio(tx: Tx, legalEntityId: string, prefijo: string, serie: string, ano: number): Promise<string> {
  const clave = `documento:${legalEntityId}:${serie}:${ano}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clave}))`;
  const raiz = `${prefijo}-${serie}-${ano}`;
  const usados = await tx.generatedDocument.count({
    where: { legalEntityId, series: serie, folio: { startsWith: `${raiz}-` } },
  });
  return `${raiz}-${String(usados + 1).padStart(5, '0')}`;
}

export const issueDocumentSchema = z.object({
  templateCode: z.string().trim().toUpperCase().min(3).max(60),
  subjectKind: z.enum([
    'MEMBERSHIP',
    'MEMBERSHIP_APPLICATION',
    'CREDENTIAL',
    'ASSEMBLY',
    'ASSEMBLY_CALL',
    'VOTE_PROCESS',
    'ELECTION',
    'OFFICE_TERM',
    'POWER_GRANT',
    'DISCIPLINARY_CASE',
    'BARGAINING_FILE',
    'PAYMENT',
    'COMPLIANCE_OBLIGATION',
  ]),
  subjectId: z.uuid(),
  variables: z.record(z.string().min(1).max(40), z.string().max(20_000)),
});

export type IssueDocumentInput = z.infer<typeof issueDocumentSchema>;

export interface IssuedDocument {
  readonly documentId: string;
  readonly publicId: string;
  readonly series: string;
  readonly folio: string;
  readonly sha256: string;
}

/**
 * Emite un documento a partir de la versión publicada de una plantilla.
 *
 * Exige **todas** las variables declaradas: emitir con una ausente produciría un
 * acta con un hueco donde debería ir el nombre de quien preside. Y rechaza las
 * que sobran, porque una variable que la plantilla no usa es casi siempre un
 * nombre mal escrito, no un dato de más.
 */
export async function issueDocument(
  actor: ActorContext,
  input: IssueDocumentInput,
): Promise<UseCaseResult<IssuedDocument>> {
  const parsed = issueDocumentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;

  const plantilla = await db().documentTemplate.findFirst({
    where: { code: data.templateCode, status: 'PUBLISHED' },
    select: {
      id: true,
      code: true,
      version: true,
      name: true,
      kind: true,
      bodyTemplate: true,
      variables: true,
      numberingSeries: true,
      legalEntityId: true,
      legalEntity: { select: { shortName: true, legalName: true, documentSeriesPrefix: true } },
    },
  });
  if (plantilla === null) {
    return fail(
      errors.notFound(
        `No hay ninguna versión publicada de la plantilla ${data.templateCode}. Redáctala y publícala antes de emitir.`,
      ),
    );
  }

  const decision = can(actor, 'documents.document.issue', {
    kind: 'GeneratedDocument',
    legalEntityId: plantilla.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));
  const emisor = actor.userId;
  if (emisor === null || emisor === undefined) {
    return fail(errors.forbidden('Un documento institucional lo emite una persona con cuenta, no un proceso anónimo.'));
  }

  const declaradas = variablesDeclaradas(plantilla.variables);
  const recibidas = Object.keys(data.variables);
  const faltantes = declaradas.filter((nombre) => !recibidas.includes(nombre));
  const sobrantes = recibidas.filter((nombre) => !declaradas.includes(nombre));

  if (faltantes.length > 0) {
    return fail(errors.validation({ variables: [`Faltan valores para: ${faltantes.join(', ')}.`] }));
  }
  if (sobrantes.length > 0) {
    return fail(
      errors.validation({
        variables: [`La plantilla no usa: ${sobrantes.join(', ')}. Revisa el nombre antes de emitir.`],
      }),
    );
  }
  // Comprobación de cordura: si el cuerpo publicado usara una variable que no
  // está declarada, la publicación lo habría impedido. Se vuelve a mirar aquí
  // porque emitir con un hueco es peor que no emitir.
  const usadas = variablesUsadas(plantilla.bodyTemplate);
  const huecos = usadas.filter((nombre) => !declaradas.includes(nombre));
  if (huecos.length > 0) {
    return fail(
      errors.conflict(`La plantilla ${plantilla.code} v${plantilla.version} tiene huecos sin declarar: ${huecos.join(', ')}.`),
    );
  }

  const serie = plantilla.numberingSeries ?? plantilla.code;
  const emitidoEl = new Date();
  const publicId = newPublicId();

  // El folio se reserva dentro de una transacción corta y propia: el archivo se
  // sube fuera de la transacción, y una subida lenta no puede tener el cerrojo
  // de la serie tomado mientras tanto.
  const folio = await transaction((tx) =>
    siguienteFolio(tx, plantilla.legalEntityId, plantilla.legalEntity.documentSeriesPrefix, serie, emitidoEl.getUTCFullYear()),
  );

  const cuerpo = renderizarCuerpo(plantilla.bodyTemplate, data.variables);
  const html = componerDocumento({
    titulo: plantilla.name,
    entidad: plantilla.legalEntity.legalName,
    serie,
    folio,
    emitidoEl,
    cuerpo,
  });
  const contenido = new TextEncoder().encode(html);
  const sha256 = createHash('sha256').update(contenido).digest('hex');

  const archivo = await uploadFile(actor, {
    legalEntityId: plantilla.legalEntityId,
    classification: 'INTERNAL',
    contextKind: 'GOVERNANCE',
    contextId: data.subjectId,
    originalFileName: `${folio}.html`,
    mimeType: 'text/html',
    content: contenido,
  });
  if (!archivo.ok) return fail(archivo.error);

  const emitido = await transaction(async (tx) => {
    const fila = await tx.generatedDocument.create({
      data: {
        publicId,
        templateId: plantilla.id,
        templateVersion: plantilla.version,
        legalEntityId: plantilla.legalEntityId,
        series: serie,
        folio,
        subjectKind: data.subjectKind,
        subjectId: data.subjectId,
        renderedFileId: archivo.data.fileObjectId,
        variablesSnapshot: data.variables,
        issuedAt: emitidoEl,
        issuedById: emisor,
        status: 'ISSUED',
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.DOCUMENT_ISSUED,
      objectKind: 'GeneratedDocument',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: plantilla.legalEntityId,
      metadata: {
        plantilla: `${plantilla.code} v${plantilla.version}`,
        folio,
        subjectKind: data.subjectKind,
        subjectId: data.subjectId,
        sha256,
      },
    });

    return fila;
  });

  return ok({ documentId: emitido.id, publicId, series: serie, folio, sha256 });
}

export interface DocumentRow {
  readonly id: string;
  readonly publicId: string;
  readonly filePublicId: string;
  readonly templateName: string;
  readonly templateCode: string;
  readonly templateVersion: number;
  readonly series: string;
  readonly folio: string | null;
  readonly subjectKind: DocumentSubject;
  readonly subjectId: string;
  readonly issuedAt: Date;
  readonly status: string;
  readonly signatures: number;
}

/** Documentos emitidos sobre un asunto concreto. */
export async function documentsForSubject(
  actor: ActorContext,
  subjectKind: DocumentSubject,
  subjectId: string,
): Promise<UseCaseResult<readonly DocumentRow[]>> {
  const decision = can(actor, 'documents.document.read', { kind: 'GeneratedDocument' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().generatedDocument.findMany({
    where: { subjectKind, subjectId },
    orderBy: { issuedAt: 'desc' },
    select: {
      id: true,
      publicId: true,
      series: true,
      folio: true,
      subjectKind: true,
      subjectId: true,
      issuedAt: true,
      status: true,
      templateVersion: true,
      renderedFile: { select: { publicId: true } },
      template: { select: { code: true, name: true } },
      _count: { select: { signatures: true } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      publicId: fila.publicId,
      filePublicId: fila.renderedFile.publicId,
      templateName: fila.template.name,
      templateCode: fila.template.code,
      templateVersion: fila.templateVersion,
      series: fila.series,
      folio: fila.folio,
      subjectKind: fila.subjectKind,
      subjectId: fila.subjectId,
      issuedAt: fila.issuedAt,
      status: fila.status,
      signatures: fila._count.signatures,
    })),
  );
}
