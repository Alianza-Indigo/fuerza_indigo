#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

import { colorToken } from '../../src/design-system/tokens';

/**
 * Genera los iconos de la aplicación instalable (F2-PWA-001).
 *
 *   npm run design:icons
 *
 * Los colores **no** se escriben a mano: se leen de `app/globals.css`, del
 * mismo token que usa la interfaz. Un hexadecimal copiado se separa de la
 * paleta en cuanto alguien la ajusta, y el icono es justo donde menos se nota,
 * porque nadie lo mira dos veces.
 *
 * La marca es tipográfica: las iniciales del sindicato sobre su índigo. No es
 * un logotipo inventado que se presente como la identidad de la organización,
 * sino la pieza mínima que exige un manifiesto para que la aplicación se pueda
 * instalar, construida con los valores que el sistema de diseño ya declara.
 * Cuando la organización aporte su marca, se sustituyen los archivos y este
 * guion deja de hacer falta.
 *
 * El rasterizado usa el navegador que ya está instalado para las pruebas de
 * extremo a extremo: pintar un SVG es exactamente lo que sabe hacer, y evita
 * una dependencia de imagen más en el árbol.
 */

const RAIZ = process.cwd();
const PUBLICO = path.join(RAIZ, 'public');

/**
 * Imagen social (1200×630).
 *
 * Es lo que se ve cuando alguien comparte un enlace en una red o en un grupo de
 * mensajería, que para un sindicato es como circula casi todo. Lleva el nombre
 * y una línea que dice qué es, sobre el índigo de la paleta: sin ella, quien
 * recibe el enlace ve un rectángulo gris y no lo abre.
 */
function svgSocial(fondo: string, tinta: string, tintaSuave: string): string {
  const tipografia =
    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" aria-label="Fuerza Índigo">',
    `  <rect width="1200" height="630" fill="${fondo}"/>`,
    `  <text x="96" y="300" fill="${tinta}" font-family="${tipografia}" font-size="104" font-weight="700" letter-spacing="-3">Fuerza Índigo</text>`,
    `  <text x="96" y="380" fill="${tintaSuave}" font-family="${tipografia}" font-size="42" font-weight="500">Sindicato de personas neurodivergentes</text>`,
    `  <rect x="96" y="440" width="180" height="10" rx="5" fill="${tintaSuave}"/>`,
    '</svg>',
  ].join('\n');
}

/**
 * Marca cuadrada con zona de seguridad para recorte.
 *
 * El fondo cubre el lienzo entero y las letras ocupan el círculo central del
 * ochenta por ciento: es lo que exige `maskable`, porque cada sistema recorta
 * el icono con una forma distinta y lo que quede fuera de ese círculo se pierde.
 */
function svg(fondo: string, tinta: string): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Fuerza Índigo">',
    `  <rect width="512" height="512" fill="${fondo}"/>`,
    `  <text x="256" y="256" fill="${tinta}"`,
    '        font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"',
    '        font-size="232" font-weight="700" letter-spacing="-8"',
    '        text-anchor="middle" dominant-baseline="central">FI</text>',
    '</svg>',
  ].join('\n');
}

async function main(): Promise<void> {
  const fondo = colorToken('--color-indigo-600');
  const tinta = colorToken('--color-indigo-50');

  mkdirSync(PUBLICO, { recursive: true });

  const tintaSuave = colorToken('--color-indigo-200');
  const marca = svg(fondo, tinta);
  const social = svgSocial(fondo, tinta, tintaSuave);
  writeFileSync(path.join(PUBLICO, 'icono.svg'), `${marca}\n`);

  const navegador = await chromium.launch({
    ...(process.env['E2E_CHROMIUM_PATH'] === undefined
      ? {}
      : { executablePath: process.env['E2E_CHROMIUM_PATH'] }),
  });

  try {
    const medidas = [
      { archivo: 'icono-192.png', lado: 192 },
      { archivo: 'icono-512.png', lado: 512 },
      // Apple no usa el manifiesto: toma este archivo y **no** aplica máscara,
      // así que lleva la misma marca sin depender del recorte del sistema.
      { archivo: 'apple-touch-icon.png', lado: 180 },
    ];

    for (const { archivo, lado } of medidas) {
      const pagina = await navegador.newPage({
        viewport: { width: lado, height: lado },
        deviceScaleFactor: 1,
      });
      await pagina.setContent(
        `<!doctype html><style>html,body{margin:0;padding:0}svg{display:block;width:${lado}px;height:${lado}px}</style>${marca}`,
      );
      await pagina.screenshot({ path: path.join(PUBLICO, archivo), omitBackground: false });
      await pagina.close();
      console.log(`Escrito public/${archivo} (${lado}×${lado})`);
    }

    const paginaSocial = await navegador.newPage({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
    });
    await paginaSocial.setContent(
      `<!doctype html><style>html,body{margin:0;padding:0}svg{display:block;width:1200px;height:630px}</style>${social}`,
    );
    await paginaSocial.screenshot({ path: path.join(PUBLICO, 'og.png') });
    await paginaSocial.close();
    console.log('Escrito public/og.png (1200×630)');
  } finally {
    await navegador.close();
  }

  console.log(`Colores tomados de los tokens: fondo ${fondo}, tinta ${tinta}.`);
}

main().catch((error: unknown) => {
  console.error('No se pudieron generar los iconos:', error instanceof Error ? error.message : error);
  process.exit(1);
});
