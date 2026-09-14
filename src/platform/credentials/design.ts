import type { CredentialKind } from '@prisma-client/enums';

import { colorToken } from '@/design-system/tokens';
import { escaparXml, svgQr } from './qr';

/**
 * Los cinco diseños de credencial (PRD §7.4).
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
 * **Formato ID-1**, el de una tarjeta bancaria: cada cara mide 85,6 × 54 mm.
 * El archivo reúne anverso y reverso, listos para colocarse en una impresión
 * dúplex sin inventar una segunda composición.
 */

/** Décimas de milímetro: 856 × 540 unidades por cara de una tarjeta ID-1. */
const ANCHO = 856;
const ALTO_CARA = 540;
const SEPARACION = 24;
const REVERSO_Y = ALTO_CARA + SEPARACION;
const ALTO = ALTO_CARA * 2 + SEPARACION;

export interface DisenoDeCredencial {
  readonly etiqueta: string;
  /** Token del acento. Da el color de la franja y del código. */
  readonly acento: string;
  /** Token del fondo suave del reverso de la franja. */
  readonly acentoSuave: string;
  /** Alto de la franja superior. Distingue los tipos sin depender del color. */
  readonly franja: number;
  /**
   * Símbolo del tipo, trazado en la franja. Cinco formas inconfundibles sin
   * depender del color.
   */
  readonly simbolo: 'CIRCULO' | 'CUADRADO' | 'HEXAGONO' | 'ROMBO' | 'TRIANGULO';
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
    etiqueta: 'Agremiado honorario',
    acento: '--color-alianza-600',
    acentoSuave: '--color-alianza-50',
    franja: 72,
    simbolo: 'CUADRADO',
    acredita: 'Agremiado honorario con voz y sin voto.',
  },
  PROTECTED_BENEFICIARY: {
    etiqueta: 'Beneficiario protegido',
    acento: '--color-indigo-700',
    acentoSuave: '--color-indigo-100',
    franja: 112,
    simbolo: 'HEXAGONO',
    acredita: 'Protección y acompañamiento de Fuerza Índigo.',
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
    case 'HEXAGONO':
      return `<path d="M${cx} ${cy - r}L${cx + r} ${cy - r / 2}L${cx + r} ${cy + r / 2}L${cx} ${cy + r}L${cx - r} ${cy + r / 2}L${cx - r} ${cy - r / 2}Z" fill="none" stroke="#ffffff" stroke-width="8"/>`;
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
  /** CURP de la persona identificada. Solo se entrega al render autorizado. */
  readonly curp: string;
  /** Folio sindical o de registro protegido, distinto del código del QR. */
  readonly folio: string;
  /** Fotografía privada convertida a data URL por el servidor autorizado. */
  readonly photoDataUrl: string;
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
  const cabecera = colorToken('--color-indigo-950');

  // El QR se dibuja aparte y se incrusta: así el trazado de los módulos y el de
  // la tarjeta no se estorban, y el mismo código sirve para la pantalla.
  const qr = svgQr(datos.token, {
    titulo: `Código de verificación ${codigoLegible(datos.publicCode)}`,
    tinta,
    fondo: '#ffffff',
  });
  const qrInterno = qr.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const ladoQr = /viewBox="0 0 (\d+) \d+"/.exec(qr)?.[1] ?? '29';

  const vigencia = datos.expiresAt === null ? 'Mientras el registro esté activo' : fecha(datos.expiresAt);
  const sitio = datos.verificationUrl.replace(/^https?:\/\//, '').replace(/\/verificar\/?$/, '');

  const marca = (x: number, y: number): string =>
    Array.from({ length: 8 }, (_, indice) => {
      const angulo = indice * 45;
      const relleno = indice % 2 === 0 ? '#22d3ee' : '#8b5cf6';
      return `<path d="M${x} ${y - 34}L${x + 13} ${y - 13}L${x} ${y - 4}L${x - 13} ${y - 13}Z" fill="${relleno}" transform="rotate(${angulo} ${x} ${y})"/>`;
    }).join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO} ${ALTO}" width="85.6mm" height="110.4mm" role="img" aria-label="Anverso y reverso de la credencial de ${escaparXml(diseno.etiqueta)} de ${escaparXml(datos.displayName)}">`,
    `<title>Credencial de ${escaparXml(diseno.etiqueta)}</title>`,
    `<desc>Identificación institucional. Titular: ${escaparXml(datos.displayName)}. CURP ${escaparXml(datos.curp)}. Folio ${escaparXml(datos.folio)}. Código de verificación ${escaparXml(codigoLegible(datos.publicCode))}.</desc>`,

    '<defs>',
    '<clipPath id="foto-credencial"><rect x="36" y="158" width="224" height="292" rx="16"/></clipPath>',
    '</defs>',

    // Anverso: identificación personal.
    `<rect width="${ANCHO}" height="${ALTO_CARA}" rx="28" fill="#fffdfa"/>`,
    `<rect width="${ANCHO}" height="${ALTO_CARA}" rx="28" fill="none" stroke="${acento}" stroke-width="4"/>`,
    `<path d="M0 28A28 28 0 0 1 28 0H828A28 28 0 0 1 856 28V132H0Z" fill="${cabecera}"/>`,
    marca(70, 66),
    `<text x="124" y="62" font-family="Georgia, serif" font-size="40" font-weight="700" fill="#ffffff">FUERZA ÍNDIGO</text>`,
    `<text x="124" y="94" font-family="system-ui, sans-serif" font-size="15" letter-spacing="0.5" fill="#ffffff">SINDICATO UNIÓN DE INCLUSIÓN Y DERECHOS NEURODIVERGENTES</text>`,
    `<rect x="0" y="132" width="${Math.max(12, Math.round(diseno.franja / 4))}" height="408" fill="${acento}"/>`,
    `<image href="${escaparXml(datos.photoDataUrl)}" x="36" y="158" width="224" height="292" preserveAspectRatio="xMidYMid slice" clip-path="url(#foto-credencial)"/>`,
    `<rect x="36" y="158" width="224" height="292" rx="16" fill="none" stroke="${linea}" stroke-width="3"/>`,
    `<g transform="translate(292 158)">`,
    `<circle cx="24" cy="22" r="25" fill="${acento}"/>`,
    simbolo(diseno.simbolo, 24, 22, 18),
    `<text x="56" y="31" font-family="system-ui, sans-serif" font-size="27" font-weight="800" fill="${acento}"${ajustado(diseno.etiqueta.toUpperCase(), 27, 472)}>${escaparXml(diseno.etiqueta.toUpperCase())}</text>`,
    `<text x="0" y="94" font-family="Georgia, serif" font-size="38" font-weight="700" fill="${tinta}"${ajustado(datos.displayName, 38, 516)}>${escaparXml(datos.displayName)}</text>`,
    `<text x="0" y="147" font-family="system-ui, sans-serif" font-size="16" fill="${tintaSuave}">CURP</text>`,
    `<text x="0" y="178" font-family="ui-monospace, monospace" font-size="24" font-weight="700" fill="${tinta}">${escaparXml(datos.curp)}</text>`,
    `<text x="270" y="147" font-family="system-ui, sans-serif" font-size="16" fill="${tintaSuave}">FOLIO FUERZA ÍNDIGO</text>`,
    `<text x="270" y="178" font-family="ui-monospace, monospace" font-size="22" font-weight="700" fill="${tinta}"${ajustado(datos.folio, 22, 246)}>${escaparXml(datos.folio)}</text>`,
    `<text x="0" y="235" font-family="system-ui, sans-serif" font-size="16" fill="${tintaSuave}">EXPEDICIÓN</text>`,
    `<text x="0" y="266" font-family="system-ui, sans-serif" font-size="22" font-weight="700" fill="${tinta}">${fecha(datos.issuedAt)}</text>`,
    `<text x="270" y="235" font-family="system-ui, sans-serif" font-size="16" fill="${tintaSuave}">VIGENCIA</text>`,
    `<text x="270" y="266" font-family="system-ui, sans-serif" font-size="19" font-weight="700" fill="${tinta}"${ajustado(vigencia, 19, 246)}>${escaparXml(vigencia)}</text>`,
    datos.territoryLabel === null
      ? ''
      : `<text x="0" y="321" font-family="system-ui, sans-serif" font-size="20" font-weight="600" fill="${tinta}"${ajustado(datos.territoryLabel, 20, 516)}>${escaparXml(datos.territoryLabel)}</text>`,
    '</g>',
    `<text x="816" y="510" text-anchor="end" font-family="system-ui, sans-serif" font-size="15" letter-spacing="1" fill="${tintaSuave}">IDENTIFICACIÓN INSTITUCIONAL</text>`,

    // Reverso: datos del sindicato y verificación.
    `<rect y="${REVERSO_Y}" width="${ANCHO}" height="${ALTO_CARA}" rx="28" fill="#fffdfa"/>`,
    `<rect y="${REVERSO_Y}" width="${ANCHO}" height="${ALTO_CARA}" rx="28" fill="none" stroke="${acento}" stroke-width="4"/>`,
    `<path d="M0 ${REVERSO_Y + 28}A28 28 0 0 1 28 ${REVERSO_Y}H828A28 28 0 0 1 856 ${REVERSO_Y + 28}V${REVERSO_Y + 112}H0Z" fill="${cabecera}"/>`,
    `<text x="428" y="${REVERSO_Y + 72}" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="700" fill="#ffffff">VERIFICACIÓN DE CREDENCIAL</text>`,
    `<rect x="40" y="${REVERSO_Y + 145}" width="276" height="276" rx="14" fill="${acentoSuave}" stroke="${acento}" stroke-width="2"/>`,
    `<svg x="52" y="${REVERSO_Y + 157}" width="252" height="252" viewBox="0 0 ${ladoQr} ${ladoQr}">${qrInterno}</svg>`,
    `<text x="178" y="${REVERSO_Y + 455}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="${acento}"${ajustado(sitio, 20, 270)}>${escaparXml(sitio)}</text>`,
    `<text x="356" y="${REVERSO_Y + 176}" font-family="Georgia, serif" font-size="34" font-weight="700" fill="${tinta}">Escanee para confirmar</text>`,
    `<text x="356" y="${REVERSO_Y + 214}" font-family="system-ui, sans-serif" font-size="18" fill="${tintaSuave}">El QR abre el registro individual y muestra su estado actual.</text>`,
    `<text x="356" y="${REVERSO_Y + 270}" font-family="system-ui, sans-serif" font-size="15" fill="${tintaSuave}">FOLIO</text>`,
    `<text x="356" y="${REVERSO_Y + 300}" font-family="ui-monospace, monospace" font-size="22" font-weight="700" fill="${tinta}">${escaparXml(datos.folio)}</text>`,
    `<text x="356" y="${REVERSO_Y + 350}" font-family="system-ui, sans-serif" font-size="15" fill="${tintaSuave}">CÓDIGO DE VERIFICACIÓN</text>`,
    `<text x="356" y="${REVERSO_Y + 380}" font-family="ui-monospace, monospace" font-size="20" font-weight="700" fill="${tinta}"${ajustado(codigoLegible(datos.publicCode), 20, 460)}>${escaparXml(codigoLegible(datos.publicCode))}</text>`,
    `<line x1="356" y1="${REVERSO_Y + 414}" x2="816" y2="${REVERSO_Y + 414}" stroke="${linea}" stroke-width="2"/>`,
    `<text x="586" y="${REVERSO_Y + 448}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="${tintaSuave}">SINDICATO UNIÓN DE INCLUSIÓN Y DERECHOS NEURODIVERGENTES</text>`,
    `<text x="586" y="${REVERSO_Y + 477}" text-anchor="middle" font-family="Georgia, serif" font-size="24" font-weight="700" fill="${cabecera}">${escaparXml(datos.issuer.toUpperCase())}</text>`,
    `<text x="428" y="${REVERSO_Y + 515}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="${tintaSuave}">La consulta electrónica vigente prevalece sobre la impresión.</text>`,

    '</svg>',
  ]
    .filter((parte) => parte !== '')
    .join('');
}
