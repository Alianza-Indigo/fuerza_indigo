import type { NextConfig } from 'next';

/**
 * Cabeceras de seguridad del PRD §20 y `docs/SECURITY.md` §7.
 *
 * Aquí van las que tienen el mismo valor en toda petición. La política de
 * contenido **no** está aquí: necesita un `nonce` distinto cada vez y por eso se
 * emite en `proxy.ts`. Este comentario describía una política con nonces que no
 * existía en ninguna parte (`D-F1-016`).
 */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Los tipos se verifican también aquí, además de en `npm run typecheck`.
  // Nunca se silencian: ambos comandos son obligatorios en la puerta de salida
  // y en la integración continua (PRD §23.2).
  typescript: { ignoreBuildErrors: false },

  // `@node-rs/argon2` y `pg` son binarios nativos: deben quedar fuera del empaquetado
  // del servidor para que Vercel los resuelva en tiempo de ejecución.
  serverExternalPackages: ['@node-rs/argon2', 'pg', '@prisma/adapter-pg'],

  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

export default nextConfig;
