import { cookies, headers } from 'next/headers';
import { env } from '@/platform/config/env';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { resolveActor } from '@/platform/auth/actor-resolver';
import { SESSION_COOKIE, SUPERADMIN_COOKIE } from '@/platform/auth/session';
import { classifyUserAgent, hashIp, newCorrelationId, summarizeUserAgent } from '@/platform/kernel/ids';

/**
 * Contexto de la petición en curso (docs/ARCHITECTURE.md §12).
 *
 * Resuelve una sola vez la correlación, el origen seudonimizado y el actor. La
 * dirección IP **nunca** se conserva en claro: se guarda su hash con sal, que
 * basta para reconocer repeticiones y detectar abuso (PRD §20.3).
 */

export interface RequestContext {
  readonly correlationId: string;
  readonly ipHash: string | null;
  readonly userAgentSummary: string | null;
  readonly userAgentClass: 'MOBILE' | 'DESKTOP' | 'BOT' | 'UNKNOWN';
}

/** Primera dirección de la cadena de reenvío. */
function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get('x-forwarded-for');
  if (forwarded !== null && forwarded !== '') return forwarded.split(',')[0]?.trim() ?? null;
  return headerList.get('x-real-ip');
}

export async function requestContext(): Promise<RequestContext> {
  const headerList = await headers();
  const userAgent = headerList.get('user-agent');

  return {
    correlationId: headerList.get('x-request-id') ?? newCorrelationId(),
    ipHash: hashIp(clientIp(headerList), env().AUTH_SECRET),
    userAgentSummary: summarizeUserAgent(userAgent),
    userAgentClass: classifyUserAgent(userAgent),
  };
}

/** Contexto del actor a partir de las cookies de sesión. */
export async function currentActor(): Promise<ActorContext> {
  const context = await requestContext();
  const cookieStore = await cookies();

  return resolveActor({
    sessionToken: cookieStore.get(SESSION_COOKIE)?.value ?? null,
    rootSessionToken: cookieStore.get(SUPERADMIN_COOKIE)?.value ?? null,
    correlationId: context.correlationId,
    ipHash: context.ipHash,
    userAgentSummary: context.userAgentSummary,
  });
}

/** Etiqueta legible del dispositivo, para el listado de sesiones propias. */
export function deviceLabelFrom(userAgentSummary: string | null): string | null {
  if (userAgentSummary === null) return null;
  const value = userAgentSummary.toLowerCase();
  const system = /windows/.test(value)
    ? 'Windows'
    : /mac os|macintosh/.test(value)
      ? 'macOS'
      : /android/.test(value)
        ? 'Android'
        : /iphone|ipad|ios/.test(value)
          ? 'iOS'
          : /linux/.test(value)
            ? 'Linux'
            : 'Sistema desconocido';
  const browser = /edg\//.test(value)
    ? 'Edge'
    : /chrome|crios/.test(value)
      ? 'Chrome'
      : /firefox|fxios/.test(value)
        ? 'Firefox'
        : /safari/.test(value)
          ? 'Safari'
          : 'Navegador desconocido';
  return `${browser} en ${system}`;
}
