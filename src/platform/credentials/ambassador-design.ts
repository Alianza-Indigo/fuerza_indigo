import { colorToken } from '@/design-system/tokens';
import { escaparXml, svgQr } from './qr';

/** Formato ID-1 horizontal: el tamaño de una tarjeta bancaria. */
const ANCHO = 856;
const ALTO = 540;

export interface DatosDeCredencialDeEmbajador {
  readonly displayName: string;
  readonly code: string;
  readonly territory: string | null;
  readonly issuedAt: Date;
  readonly affiliationUrl: string;
}

function fecha(valor: Date): string {
  const dia = String(valor.getUTCDate()).padStart(2, '0');
  const mes = String(valor.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}.${mes}.${valor.getUTCFullYear()}`;
}

function ajustado(texto: string, tamano: number, disponible: number): string {
  const estimado = texto.length * tamano * 0.56;
  return estimado <= disponible
    ? ''
    : ` textLength="${Math.round(disponible)}" lengthAdjust="spacingAndGlyphs"`;
}

function marca(x: number, y: number): string {
  return Array.from({ length: 8 }, (_, indice) => {
    const angulo = indice * 45;
    const relleno = indice % 2 === 0 ? '#22d3ee' : '#8b5cf6';
    return `<path d="M${x} ${y - 27}L${x + 11} ${y - 10}L${x} ${y - 3}L${x - 11} ${y - 10}Z" fill="${relleno}" transform="rotate(${angulo} ${x} ${y})"/>`;
  }).join('');
}

/**
 * Credencial digital del afiliador.
 *
 * El QR abre su página pública vigente, que identifica al embajador y ofrece
 * los formularios ya ligados a su código. No lleva correo ni teléfono: la
 * tarjeta está hecha para compartirse públicamente.
 */
export function svgCredencialDeEmbajador(datos: DatosDeCredencialDeEmbajador): string {
  const linea = colorToken('--color-slate-200');
  const cabecera = colorToken('--color-indigo-950');
  const acento = colorToken('--color-indigo-600');

  const qr = svgQr(datos.affiliationUrl, {
    titulo: `Afiliación con el Embajador Índigo ${datos.code}`,
    tinta: cabecera,
    fondo: '#ffffff',
  });
  const qrInterno = qr.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const ladoQr = /viewBox="0 0 (\d+) \d+"/.exec(qr)?.[1] ?? '29';
  const territorio = datos.territory ?? 'Cobertura nacional';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO} ${ALTO}" width="85.6mm" height="54mm" role="img" aria-label="Credencial digital de Embajador Índigo de ${escaparXml(datos.displayName)}">`,
    `<title>Credencial digital de Embajador Índigo</title>`,
    `<desc>Afiliador autorizado ${escaparXml(datos.displayName)}, código ${escaparXml(datos.code)}. El QR abre su enlace de afiliación.</desc>`,
    '<defs>',
    '<linearGradient id="fondo-embajador" x1="0" y1="0" x2="1" y2="1">',
    `<stop offset="0" stop-color="${cabecera}"/>`,
    '<stop offset="0.58" stop-color="#101b57"/>',
    '<stop offset="1" stop-color="#052c55"/>',
    '</linearGradient>',
    '<radialGradient id="halo-embajador" cx="0" cy="0" r="1" gradientTransform="translate(380 230) rotate(25) scale(430 300)">',
    '<stop stop-color="#6d4aff" stop-opacity=".34"/>',
    '<stop offset="1" stop-color="#6d4aff" stop-opacity="0"/>',
    '</radialGradient>',
    '</defs>',
    `<rect width="${ANCHO}" height="${ALTO}" rx="30" fill="url(#fondo-embajador)"/>`,
    `<rect width="${ANCHO}" height="${ALTO}" rx="30" fill="url(#halo-embajador)"/>`,
    `<rect x="2" y="2" width="${ANCHO - 4}" height="${ALTO - 4}" rx="28" fill="none" stroke="#22d3ee" stroke-opacity=".65" stroke-width="4"/>`,
    marca(66, 66),
    '<text x="112" y="60" font-family="system-ui, sans-serif" font-size="31" font-weight="850" fill="#ffffff">FUERZA ÍNDIGO</text>',
    '<text x="112" y="87" font-family="system-ui, sans-serif" font-size="13" letter-spacing="1.4" fill="#bae6fd">RED DE AFILIACIÓN</text>',
    '<text x="48" y="158" font-family="system-ui, sans-serif" font-size="19" font-weight="750" letter-spacing="2.2" fill="#67e8f9">EMBAJADOR ÍNDIGO</text>',
    `<text x="48" y="223" font-family="Georgia, serif" font-size="43" font-weight="700" fill="#ffffff"${ajustado(datos.displayName, 43, 520)}>${escaparXml(datos.displayName)}</text>`,
    '<text x="48" y="263" font-family="system-ui, sans-serif" font-size="18" font-weight="650" fill="#dbeafe">AFILIADOR AUTORIZADO</text>',
    '<text x="48" y="323" font-family="system-ui, sans-serif" font-size="14" letter-spacing="1" fill="#93c5fd">CÓDIGO PERSONAL</text>',
    `<text x="48" y="362" font-family="ui-monospace, monospace" font-size="31" font-weight="800" fill="#ffffff">${escaparXml(datos.code)}</text>`,
    '<text x="48" y="414" font-family="system-ui, sans-serif" font-size="14" fill="#93c5fd">ZONA DE AFILIACIÓN</text>',
    `<text x="48" y="443" font-family="system-ui, sans-serif" font-size="20" font-weight="650" fill="#ffffff"${ajustado(territorio, 20, 490)}>${escaparXml(territorio)}</text>`,
    `<text x="48" y="497" font-family="system-ui, sans-serif" font-size="14" fill="#bfdbfe">Alta ${fecha(datos.issuedAt)} · Vigente mientras el registro permanezca activo</text>`,
    `<rect x="606" y="92" width="202" height="202" rx="18" fill="#ffffff" stroke="#67e8f9" stroke-width="3"/>`,
    `<svg x="617" y="103" width="180" height="180" viewBox="0 0 ${ladoQr} ${ladoQr}">${qrInterno}</svg>`,
    '<text x="707" y="329" text-anchor="middle" font-family="system-ui, sans-serif" font-size="21" font-weight="800" fill="#ffffff">ESCANEA PARA AFILIAR</text>',
    '<text x="707" y="357" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#bae6fd">Elige la categoría y registra</text>',
    '<text x="707" y="378" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#bae6fd">con este código personal</text>',
    `<line x1="606" y1="413" x2="808" y2="413" stroke="${linea}" stroke-opacity=".45"/>`,
    `<text x="707" y="448" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="700" fill="#ffffff">${escaparXml(datos.code)}</text>`,
    `<text x="707" y="480" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#bfdbfe">${escaparXml(datos.affiliationUrl.replace(/^https?:\/\//, ''))}</text>`,
    `<circle cx="807" cy="42" r="8" fill="${acento}"/>`,
    `<circle cx="807" cy="42" r="3" fill="#ffffff"/>`,
    '</svg>',
  ].join('');
}
