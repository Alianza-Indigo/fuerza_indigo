import type { CredentialKind } from '@prisma-client/enums';

import { colorToken } from '@/design-system/tokens';
import { escaparXml, svgQr } from './qr';

/**
 * Los cuatro diseños de credencial (PRD §7.4).
 *
 * **Se distinguen claramente**, y no solo por el color: cada tipo lleva su
 * nombre escrito en grande, una franja de anchura propia y un símbolo distinto.
 * Un diseño que solo cambiara de matiz sería indistinguible para quien no
 * percibe ese matiz, y también en la fotocopia en blanco y negro que acaba
 * pegada en la puerta de una oficina.
 *
 * **El SVG es autónomo.** No usa variables CSS —fuera del navegador no
 * existen—, sino hexadecimales calculados de los mismos tokens que usa la
 * interfaz (`colorToken`), de modo que la credencial no se separa de la paleta
 * el día que alguien la ajuste.
 *
 * **Formato ID-1**, el de una tarjeta bancaria: 85,6 × 54 mm. Se imprime a
 * tamaño real y entra en una cartera, que es donde vive una credencial.
 */

/** Décimas de milímetro: 856 × 540 unidades para una tarjeta ID-1. */
const ANCHO = 856;
const ALTO = 540;

export interface DisenoDeCredencial {
  readonly etiqueta: string;
  /** Token del acento. Da el color de la franja y del código. */
  readonly acento: string;
  /** Token del fondo suave del reverso de la franja. */
  readonly acentoSuave: string;
  /** Alto de la franja superior. Distingue los tipos sin depender del color. */
  readonly franja: number;
  /**
   * Símbolo del tipo, trazado en la franja. Cuatro formas inconfundibles al
   * tacto de la vista: círculo, cuadrado, rombo y triángulo.
   */
  readonly simbolo: 'CIRCULO' | 'CUADRADO' | 'ROMBO' | 'TRIANGULO';
  /** Qué acredita, en una línea, para quien la lee sin conocer la organización. */
  readonly acredita: string;
}

export const DISENOS: Record<CredentialKind, DisenoDeCredencial> = {
  UNION_MEMBER: {
    etiqueta: 'Agremiado',
    acento: '--color-indigo-600',
    acentoSuave: '--color-indigo-50',
    franja: 96,
    simbolo: 'CIRCULO',
    acredita: 'Persona agremiada al sindicato, con derechos plenos.',
  },
  HONORARY_AFFILIATE: {
    etiqueta: 'Afiliación honoraria',
    acento: '--color-alianza-600',
    acentoSuave: '--color-alianza-50',
    franja: 72,
    simbolo: 'CUADRADO',
    acredita: 'Afiliación honoraria. Sin derechos electorales.',
  },
  OFFICE_OR_REPRESENTATION: {
    etiqueta: 'Cargo o representación',
    acento: '--color-indigo-950',
    acentoSuave: '--color-slate-100',
    franja: 132,
    simbolo: 'ROMBO',
    acredita: 'Representación institucional vigente del sindicato.',
  },
  AUTHORIZED_PROFESSIONAL: {
    etiqueta: 'Profesional autorizada',
    acento: '--color-tools-600',
    acentoSuave: '--color-tools-50',
    franja: 48,
    simbolo: 'TRIANGULO',
    acredita: 'Profesional autorizada por el ecosistema Índigo.',
  },
};

/** Trazado del símbolo del tipo, centrado en (cx, cy) con radio r. */
function simbolo(forma: DisenoDeCredencial['simbolo'], cx: number, cy: number, r: number): string {
  switch (forma) {
    case 'CIRCULO':
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff" stroke-width="8"/>`;
    case 'CUADRADO':
      return `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" fill="none" stroke="#ffffff" stroke-width="8"/>`;
    case 'ROMBO':
      return `<path d="M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z" fill="none" stroke="#ffffff" stroke-width="8"/>`;
    case 'TRIANGULO':
      return `<path d="M${cx} ${cy - r}L${cx + r} ${cy + r}L${cx - r} ${cy + r}Z" fill="none" stroke="#ffffff" stroke-width="8"/>`;
  }
}

export interface DatosDeCredencial {
  readonly kind: CredentialKind;
  /** Nombre o denominación autorizada (PRD §7.4). */
  readonly displayName: string;
  /** Número público de verificación: el código opaco, no el de miembro. */
  readonly publicCode: string;
  /** Lo que se escribe dentro del QR. */
  readonly token: string;
  /** Dirección del verificador, para escribirla también en letra legible. */
  readonly verificationUrl: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date | null;
  readonly territoryLabel: string | null;
  /** Nombre de la entidad que la emite. */
  readonly issuer: string;
}

/**
 * Texto que **nunca se sale de su sitio** (defecto `D-F4-018`).
 *
 * Un SVG no ajusta ni recorta: el texto que no cabe se sale por el borde de la
 * tarjeta y desaparece al imprimir. Y lo que se sale es siempre lo mismo —un
 * nombre largo, una dirección de verificación—, o sea justo lo que hay que
 * poder leer.
 *
 * `textLength` con `lengthAdjust="spacingAndGlyphs"` deja que el navegador
 * comprima el trazo hasta el ancho disponible. Se aplica **solo cuando hace
 * falta**, calculado con una estimación conservadora del ancho de un carácter:
 * comprimir lo que ya cabía deformaría un texto sin ninguna razón.
 */
function ajustado(texto: string, tamaño: number, disponible: number): string {
  // 0,56 em por carácter es holgado para una tipografía de sistema; prefiere
  // comprimir de más antes que dejar que algo se salga.
  const estimado = texto.length * tamaño * 0.56;
  return estimado <= disponible
    ? ''
    : ` textLength="${Math.round(disponible)}" lengthAdjust="spacingAndGlyphs"`;
}

/** Fecha corta e inequívoca para un documento impreso: `05.09.2026`. */
function fecha(valor: Date): string {
  const dia = String(valor.getUTCDate()).padStart(2, '0');
  const mes = String(valor.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}.${mes}.${valor.getUTCFullYear()}`;
}

/**
 * Agrupa el código en bloques de cinco para poder dictarlo y transcribirlo.
 * `A1B2C3D4E5F6G7H8J9K0` → `A1B2C 3D4E5 F6G7H 8J9K0`.
 */
export function codigoLegible(publicCode: string): string {
  return (publicCode.match(/.{1,5}/g) ?? [publicCode]).join(' ');
}

/**
 * La credencial completa, en un SVG que se puede imprimir tal cual.
 *
 * Se elige SVG y no PDF a conciencia (ADR-0091): imprime igual de bien a
 * cualquier tamaño, lo abre cualquier navegador sin instalar nada, pesa unos
 * pocos kilobytes y no obliga a añadir una biblioteca de composición de
 * documentos para dibujar seis líneas de texto y un cuadrado de módulos.
 */
export function svgCredencial(datos: DatosDeCredencial): string {
  const diseno = DISENOS[datos.kind];
  const acento = colorToken(diseno.acento);
  const acentoSuave = colorToken(diseno.acentoSuave);
  const tinta = colorToken('--color-slate-900');
  const tintaSuave = colorToken('--color-slate-600');
  const linea = colorToken('--color-slate-200');

  // El QR se dibuja aparte y se incrusta: así el trazado de los módulos y el de
  // la tarjeta no se estorban, y el mismo código sirve para la pantalla.
  const qr = svgQr(datos.token, {
    titulo: `Código de verificación ${codigoLegible(datos.publicCode)}`,
    tinta,
    fondo: '#ffffff',
  });
  const qrInterno = qr.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const ladoQr = /viewBox="0 0 (\d+) \d+"/.exec(qr)?.[1] ?? '29';

  const vigencia =
    datos.expiresAt === null
      ? 'Sin fecha de término'
      : `Vigente hasta ${fecha(datos.expiresAt)}`;

  // Hay dos anchos disponibles, porque el QR solo ocupa la esquina inferior
  // derecha. Arriba —titular, qué acredita, territorio— se puede usar la
  // tarjeta entera; abajo hay que dejarle sitio al recuadro del código.
  // Tratarlo todo con el ancho estrecho comprimía sin razón las líneas de
  // arriba, que tenían doscientos puntos libres a su derecha.
  const COLUMNA_ALTA = ANCHO - 80;
  const COLUMNA_BAJA = ANCHO - 232 - 40 - 16;
  const verifica = `Verifica en ${datos.verificationUrl}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO} ${ALTO}" width="85.6mm" height="54mm" role="img" aria-label="Credencial de ${escaparXml(diseno.etiqueta)} de ${escaparXml(datos.displayName)}">`,
    `<title>Credencial de ${escaparXml(diseno.etiqueta)}</title>`,
    `<desc>${escaparXml(diseno.acredita)} Titular: ${escaparXml(datos.displayName)}. ${escaparXml(vigencia)}. Código de verificación ${escaparXml(codigoLegible(datos.publicCode))}.</desc>`,

    `<rect width="${ANCHO}" height="${ALTO}" rx="28" fill="#ffffff"/>`,
    `<rect width="${ANCHO}" height="${ALTO}" rx="28" fill="none" stroke="${linea}" stroke-width="2"/>`,

    // Franja del tipo. Su alto distingue los cuatro diseños sin usar el color.
    `<path d="M0 28a28 28 0 0 1 28-28h800a28 28 0 0 1 28 28v${diseno.franja - 28}H0Z" fill="${acento}"/>`,
    simbolo(diseno.simbolo, 64, diseno.franja / 2, Math.min(24, diseno.franja / 2 - 12)),
    `<text x="112" y="${diseno.franja / 2 + 11}" font-family="system-ui, sans-serif" font-size="32" font-weight="700" fill="#ffffff">${escaparXml(diseno.etiqueta.toUpperCase())}</text>`,
    `<text x="${ANCHO - 32}" y="${diseno.franja / 2 + 8}" text-anchor="end" font-family="system-ui, sans-serif" font-size="22" fill="#ffffff">${escaparXml(datos.issuer)}</text>`,

    // Titular.
    `<text x="40" y="${diseno.franja + 78}" font-family="system-ui, sans-serif" font-size="42" font-weight="700" fill="${tinta}"${ajustado(datos.displayName, 42, COLUMNA_ALTA)}>${escaparXml(datos.displayName)}</text>`,
    `<text x="40" y="${diseno.franja + 118}" font-family="system-ui, sans-serif" font-size="22" fill="${tintaSuave}"${ajustado(diseno.acredita, 22, COLUMNA_ALTA)}>${escaparXml(diseno.acredita)}</text>`,

    datos.territoryLabel === null
      ? ''
      : `<text x="40" y="${diseno.franja + 156}" font-family="system-ui, sans-serif" font-size="22" fill="${tintaSuave}"${ajustado(datos.territoryLabel, 22, COLUMNA_ALTA)}>${escaparXml(datos.territoryLabel)}</text>`,

    // Vigencia.
    `<text x="40" y="${ALTO - 122}" font-family="system-ui, sans-serif" font-size="22" fill="${tintaSuave}">Emitida ${fecha(datos.issuedAt)}</text>`,
    `<text x="40" y="${ALTO - 90}" font-family="system-ui, sans-serif" font-size="24" font-weight="600" fill="${tinta}">${escaparXml(vigencia)}</text>`,

    // Código legible, para dictarlo cuando no hay cámara.
    `<text x="40" y="${ALTO - 52}" font-family="ui-monospace, monospace" font-size="24" letter-spacing="2" fill="${tinta}">${escaparXml(codigoLegible(datos.publicCode))}</text>`,

    // Y dónde comprobarlo. Va aquí, en la columna de texto y alineada a la
    // izquierda: centrada bajo el QR se salía por el borde derecho de la
    // tarjeta, y lo que se perdía era precisamente la dirección que alguien
    // tendría que teclear (defecto `D-F4-018`).
    `<text x="40" y="${ALTO - 22}" font-family="system-ui, sans-serif" font-size="18" fill="${tintaSuave}"${ajustado(verifica, 18, COLUMNA_BAJA)}>${escaparXml(verifica)}</text>`,

    // El QR, sobre un rectángulo del acento suave que le da zona tranquila
    // aunque la tarjeta se imprima sobre papel de color.
    `<rect x="${ANCHO - 232}" y="${ALTO - 232}" width="200" height="200" rx="12" fill="${acentoSuave}"/>`,
    `<svg x="${ANCHO - 226}" y="${ALTO - 226}" width="188" height="188" viewBox="0 0 ${ladoQr} ${ladoQr}">${qrInterno}</svg>`,

    '</svg>',
  ]
    .filter((parte) => parte !== '')
    .join('');
}
